"use strict";

const crypto = require("node:crypto");
const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");

const { OUTPASS_STATUS } = require("../constants/outpassStatus");

const { verifyQRSignature } = require("./qrService");

const { exitVerifiedEvent } = require("../utils/timelineHelper");

const { createActivity } = require("../../student/services/activityService");

const { buildSecurityResponse } = require("../utils/securityResponse");

// ============================================================
// HELPERS
// ============================================================

const fail = (message) => ({
  success: false,
  message,
});

const tokensMatch = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const first = crypto.createHash("sha256").update(a).digest();

  const second = crypto.createHash("sha256").update(b).digest();

  return crypto.timingSafeEqual(first, second);
};

// ============================================================
// GATE WINDOW: 09:15 AM - 05:15 PM IST
// ============================================================

const getISTMinutes = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return get("hour") * 60 + get("minute");
};

const isWithinGateWindow = (date = new Date()) => {
  const minutes = getISTMinutes(date);

  return minutes >= 9 * 60 + 15 && minutes < 17 * 60 + 15;
};

// ============================================================
// POPULATE VERIFIED APPROVAL DETAILS
// ============================================================

const populateSecurityDetails = async (outpass) => {
  try {
    await outpass.populate([
      {
        path: "approvedByFaculty",
        select: "name designation",
      },
      {
        path: "parentDecision.verifiedByFaculty",
        select: "name designation",
      },
      {
        path: "academicInstitute",
        select: "name code",
      },
      {
        path: "academicProgram",
        select: "name code",
      },
    ]);
  } catch (error) {
    // The gate movement was already committed.
    // Do not retry the movement on populate failure.
    console.error("EXIT approval detail population failed:", error.message);
  }

  return outpass;
};

// ============================================================
// VERIFY EXIT
// ============================================================

const verifyExit = async (outpassId, qrToken, securityGuardId) => {
  // ----------------------------------------------------------
  // 1. IDENTIFIERS
  // ----------------------------------------------------------

  if (
    !mongoose.isValidObjectId(outpassId) ||
    !mongoose.isValidObjectId(securityGuardId)
  ) {
    return fail("Invalid outpass or security guard ID.");
  }

  if (typeof qrToken !== "string" || !qrToken.trim()) {
    return fail("QR token is required. Scan the student QR.");
  }

  const now = new Date();

  // ----------------------------------------------------------
  // 2. GATE TIME WINDOW
  // ----------------------------------------------------------

  if (!isWithinGateWindow(now)) {
    return fail(
      "QR verification is permitted only between 09:15 AM and 05:15 PM IST.",
    );
  }

  // ----------------------------------------------------------
  // 3. VERIFY SIGNATURE
  // ----------------------------------------------------------

  const verification = verifyQRSignature(qrToken, now);

  if (!verification.valid) {
    return fail(verification.message || "Invalid QR signature.");
  }

  if (verification.payload.outpassId !== String(outpassId)) {
    return fail("QR token does not belong to this outpass.");
  }

  // ----------------------------------------------------------
  // 4. LOAD OUTPASS
  // ----------------------------------------------------------

  const outpass = await Outpass.findOne({
    _id: outpassId,
    isDeleted: false,
  }).select("+qrToken");

  if (!outpass) {
    return fail("Outpass not found.");
  }

  // ----------------------------------------------------------
  // 5. APPROVED REQUEST ONLY
  // ----------------------------------------------------------

  if (outpass.status !== OUTPASS_STATUS.APPROVED) {
    return fail("Only approved outpasses can be used for EXIT.");
  }

  if (outpass.exitVerified === true || outpass.exitVerifiedAt) {
    return fail("EXIT is already verified.");
  }

  // ----------------------------------------------------------
  // 6. PARENT + UNIVERSITY APPROVAL
  // ----------------------------------------------------------

  if (
    typeof outpass.hasParentConsent !== "function" ||
    !outpass.hasParentConsent()
  ) {
    return fail("Verified parent consent is required before EXIT.");
  }

  if (
    !outpass.approvedByFaculty ||
    !outpass.approvedAt ||
    !outpass.approvedAuthorityRole
  ) {
    return fail("Verified university approval is required before EXIT.");
  }

  // ----------------------------------------------------------
  // 7. STORED QR TOKEN
  // ----------------------------------------------------------

  if (
    outpass.qrGenerated !== true ||
    !outpass.qrToken ||
    !tokensMatch(qrToken, outpass.qrToken)
  ) {
    return fail("QR token is invalid or no longer current.");
  }

  if (outpass.qrRevokedAt) {
    return fail("QR pass has been revoked.");
  }

  // ----------------------------------------------------------
  // 8. QR VALIDITY
  // ----------------------------------------------------------

  if (
    !outpass.qrValidFrom ||
    !outpass.qrExpiresAt ||
    now < outpass.qrValidFrom ||
    now >= outpass.qrExpiresAt
  ) {
    return fail("QR pass is outside its permitted time window.");
  }

  // ----------------------------------------------------------
  // 9. CAPTURE VERIFICATION TIME
  // ----------------------------------------------------------

  const verificationTime = new Date();

  if (!isWithinGateWindow(verificationTime)) {
    return fail("Gate verification window has closed at 05:15 PM IST.");
  }

  // ----------------------------------------------------------
  // 10. ATOMIC EXIT UPDATE
  // ----------------------------------------------------------

  const updatedOutpass = await Outpass.findOneAndUpdate(
    {
      _id: outpass._id,
      isDeleted: false,

      status: OUTPASS_STATUS.APPROVED,

      exitVerified: false,
      exitVerifiedAt: null,

      // Ensure consent/approval have not changed.
      "parentDecision.status": "APPROVED",
      approvedByFaculty: outpass.approvedByFaculty,
      approvedAt: outpass.approvedAt,
      approvedAuthorityRole: outpass.approvedAuthorityRole,

      qrGenerated: true,
      qrToken,
      qrRevokedAt: null,

      qrValidFrom: {
        $lte: verificationTime,
      },

      qrExpiresAt: {
        $gt: verificationTime,
      },
    },
    {
      $set: {
        status: OUTPASS_STATUS.EXITED,

        exitVerified: true,
        exitVerifiedAt: verificationTime,
        exitVerifiedBy: securityGuardId,
      },

      $push: {
        timeline: exitVerifiedEvent(null),
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updatedOutpass) {
    return fail(
      "EXIT could not be verified. The pass state may have changed or it was already scanned.",
    );
  }

  // ----------------------------------------------------------
  // 11. CREATE ACTIVITY (BEST EFFORT)
  // ----------------------------------------------------------

  try {
    await createActivity({
      user: updatedOutpass.student,

      title: "Exit Verified",

      description:
        `Outpass ${updatedOutpass.outpassId} ` +
        "EXIT verified by campus security.",

      type: "EXIT_VERIFIED",

      outpass: updatedOutpass._id,

      icon: "shield-check",
      color: "green",
    });
  } catch (error) {
    console.error("EXIT activity error:", error.message);
  }

  // ----------------------------------------------------------
  // 12. POPULATE APPROVING FACULTY
  // ----------------------------------------------------------

  await populateSecurityDetails(updatedOutpass);

  // ----------------------------------------------------------
  // 13. SUCCESS
  // ----------------------------------------------------------

  return {
    success: true,

    message: "Student EXIT verified successfully.",

    data: buildSecurityResponse(updatedOutpass),
  };
};

module.exports = Object.freeze({
  verifyExit,
});
