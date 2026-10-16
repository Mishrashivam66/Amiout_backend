"use strict";

const crypto = require("node:crypto");
const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");
const { OUTPASS_STATUS } = require("../constants/outpassStatus");

const {
  verifyQRSignature,
  getValidityWindow,
  isWithinQRValidityWindow,
} = require("./qrService");

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

const isWithinGateWindow = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  const minutes = get("hour") * 60 + get("minute");

  return minutes >= 555 && minutes < 1035;
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
    console.error("ENTRY detail population failed:", error.message);
  }

  return outpass;
};

// ============================================================
// VERIFY STUDENT ENTRY
// ============================================================

const verifyEntry = async (outpassId, qrToken, securityGuardId) => {
  // STEP 1: VALIDATE INPUT

  if (
    !mongoose.isValidObjectId(outpassId) ||
    !mongoose.isValidObjectId(securityGuardId)
  ) {
    return fail("Invalid outpass or security guard ID.");
  }

  if (typeof qrToken !== "string" || !qrToken.trim()) {
    return fail("QR token is required.");
  }

  const now = new Date();

  // STEP 2: GATE TIME WINDOW

  if (!isWithinGateWindow(now)) {
    return fail(
      "QR verification is permitted only " +
        "between 09:15 AM and 05:15 PM IST.",
    );
  }

  // STEP 3: QR SIGNATURE

  const verification = verifyQRSignature(qrToken, now);

  if (!verification.valid) {
    return fail(verification.message || "Invalid QR signature.");
  }

  if (verification.payload.outpassId !== String(outpassId)) {
    return fail("QR token does not belong to this outpass.");
  }

  // STEP 4: LOAD OUTPASS

  const outpass = await Outpass.findOne({
    _id: outpassId,
    isDeleted: false,
  }).select("+qrToken");

  if (!outpass) {
    return fail("Outpass not found.");
  }

  // STEP 5: REQUIRE VERIFIED EXIT

  if (outpass.status !== OUTPASS_STATUS.EXITED) {
    return fail("Student must have a verified EXIT before ENTRY.");
  }

  if (outpass.exitVerified !== true || !outpass.exitVerifiedAt) {
    return fail("Verified EXIT record is missing.");
  }

  // STEP 6: PREVENT DUPLICATE ENTRY

  if (outpass.entryVerified === true || outpass.entryVerifiedAt) {
    return fail("ENTRY is already verified.");
  }

  // STEP 7: STORED QR TOKEN

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

  // STEP 8: OFFICIAL DATE AND GATE WINDOW

  if (!isWithinQRValidityWindow(outpass.outDate, now)) {
    return fail(
      "QR verification is not allowed outside " +
        "the scheduled date and gate window.",
    );
  }

  const { validFrom, expiresAt } = getValidityWindow(outpass.outDate);

  // Both database expiry and current policy apply.
  // An old 6 PM QR cannot extend the 5:15 PM cutoff.

  if (
    !outpass.qrValidFrom ||
    !outpass.qrExpiresAt ||
    now < outpass.qrValidFrom ||
    now >= outpass.qrExpiresAt ||
    now < validFrom ||
    now >= expiresAt
  ) {
    return fail("QR pass is outside its permitted time window.");
  }

  // STEP 9: VALIDATE ENTRY AFTER EXIT

  if (now <= new Date(outpass.exitVerifiedAt)) {
    return fail("ENTRY time must be later than EXIT time.");
  }

  // STEP 10: RESOLVE RETURNED STATUS

  const returnedStatus = OUTPASS_STATUS.RETURNED || OUTPASS_STATUS.COMPLETED;

  if (!returnedStatus) {
    return fail("RETURNED or COMPLETED status is not configured.");
  }

  // STEP 11: FINAL VERIFICATION TIME

  const verificationTime = new Date();

  if (
    !isWithinGateWindow(verificationTime) ||
    !isWithinQRValidityWindow(outpass.outDate, verificationTime)
  ) {
    return fail("Security gate verification window has closed.");
  }

  if (verificationTime <= new Date(outpass.exitVerifiedAt)) {
    return fail("ENTRY time must be later than EXIT time.");
  }

  // STEP 12: ATOMIC ENTRY UPDATE

  const updatedOutpass = await Outpass.findOneAndUpdate(
    {
      _id: outpass._id,
      isDeleted: false,

      status: OUTPASS_STATUS.EXITED,

      exitVerified: true,

      exitVerifiedAt: {
        $lt: verificationTime,
      },

      entryVerified: false,
      entryVerifiedAt: null,

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
        status: returnedStatus,

        entryVerified: true,

        entryVerifiedAt: verificationTime,

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
      "ENTRY verification failed. " +
        "The pass may have changed or was already scanned.",
    );
  }

  // STEP 13: STUDENT ACTIVITY

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
    console.error("ENTRY activity failed:", error.message);
  }

  // STEP 14: RESPONSE DETAILS

  await populateSecurityDetails(updatedOutpass);

  return {
    success: true,

    message: "Student ENTRY verified successfully.",

    data: buildSecurityResponse(updatedOutpass),
  };
};

module.exports = Object.freeze({
  verifyEntry,
});
