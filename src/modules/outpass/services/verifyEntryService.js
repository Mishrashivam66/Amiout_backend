"use strict";

const crypto = require("node:crypto");
const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");

const { OUTPASS_STATUS } = require("../constants/outpassStatus");

const { verifyQRSignature } = require("./qrService");

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
// POPULATE APPROVAL DETAILS
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
    // ENTRY is already committed.
    // Do not repeat verification because of
    // an optional display-data failure.
    console.error("ENTRY approval detail population failed:", error.message);
  }

  return outpass;
};

// ============================================================
// VERIFY STUDENT ENTRY
// ============================================================

const verifyEntry = async (outpassId, qrToken, securityGuardId) => {
  // ----------------------------------------------------------
  // 1. VALIDATE IDENTIFIERS
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
  // 2. GATE WINDOW
  // ----------------------------------------------------------

  if (!isWithinGateWindow(now)) {
    return fail(
      "QR verification is permitted only between 09:15 AM and 05:15 PM IST.",
    );
  }

  // ----------------------------------------------------------
  // 3. SIGNED QR
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
  // 5. ENTRY REQUIRES VERIFIED EXIT
  // ----------------------------------------------------------

  if (outpass.status !== OUTPASS_STATUS.EXITED) {
    return fail("Student must have a verified EXIT before ENTRY.");
  }

  if (outpass.exitVerified !== true || !outpass.exitVerifiedAt) {
    return fail("Verified EXIT record is missing.");
  }

  // ----------------------------------------------------------
  // 6. PREVENT DUPLICATE ENTRY
  // ----------------------------------------------------------

  if (outpass.entryVerified === true || outpass.entryVerifiedAt) {
    return fail("ENTRY is already verified.");
  }

  // ----------------------------------------------------------
  // 7. QR TOKEN CHECK
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
  // 8. QR TIME VALIDITY
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
  // 9. ENTRY TIME MUST FOLLOW EXIT
  // ----------------------------------------------------------

  if (now <= new Date(outpass.exitVerifiedAt)) {
    return fail("ENTRY time must be later than EXIT time.");
  }

  // ----------------------------------------------------------
  // 10. RETURNED STATUS
  // ----------------------------------------------------------

  const returnedStatus = OUTPASS_STATUS.RETURNED || OUTPASS_STATUS.COMPLETED;

  if (!returnedStatus) {
    return fail("RETURNED or COMPLETED status is not configured.");
  }

  // ----------------------------------------------------------
  // 11. ATOMIC ENTRY VERIFICATION
  // ----------------------------------------------------------

  const updatedOutpass = await Outpass.findOneAndUpdate(
    {
      _id: outpass._id,

      isDeleted: false,

      status: OUTPASS_STATUS.EXITED,

      exitVerified: true,

      exitVerifiedAt: {
        $lt: now,
      },

      entryVerified: false,

      entryVerifiedAt: null,

      qrGenerated: true,

      qrToken,

      qrRevokedAt: null,

      qrValidFrom: {
        $lte: now,
      },

      qrExpiresAt: {
        $gt: now,
      },
    },
    {
      $set: {
        status: returnedStatus,

        entryVerified: true,

        entryVerifiedAt: now,

        entryVerifiedBy: securityGuardId,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updatedOutpass) {
    return fail(
      "ENTRY verification failed. The pass state may have changed or it was already scanned.",
    );
  }

  // ----------------------------------------------------------
  // 12. STUDENT ACTIVITY
  // ----------------------------------------------------------

  try {
    await createActivity({
      user: updatedOutpass.student,

      title: "Entry Verified",

      description:
        `Outpass ${updatedOutpass.outpassId} ` +
        "ENTRY verified by campus security.",

      type: "ENTRY_VERIFIED",

      outpass: updatedOutpass._id,

      icon: "shield-check",
      color: "green",
    });
  } catch (error) {
    console.error("ENTRY activity error:", error.message);
  }

  // ----------------------------------------------------------
  // 13. POPULATE APPROVAL DETAILS
  // ----------------------------------------------------------

  await populateSecurityDetails(updatedOutpass);

  // ----------------------------------------------------------
  // 14. SUCCESS RESPONSE
  // ----------------------------------------------------------

  return {
    success: true,

    message: "Student ENTRY verified successfully.",

    data: buildSecurityResponse(updatedOutpass),
  };
};

module.exports = Object.freeze({
  verifyEntry,
});
