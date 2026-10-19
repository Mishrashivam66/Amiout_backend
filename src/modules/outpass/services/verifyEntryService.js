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
// CONFIGURATION
// ============================================================

const AUTHORIZED_APPROVAL_ROLES = new Set([
  "MENTOR",
  "BACKUP_MENTOR",
  "COORDINATOR",
  "HOD",
  "HOI",
]);

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
// OFFICIAL SECURITY GATE WINDOW
//
// 09:15 AM - 06:00 PM IST
// 06:00 PM is exclusive.
// ============================================================

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

  return minutes >= 555 && minutes < 1080;
};

// ============================================================
// POPULATE SECURITY DETAILS
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
//
// RULES:
// 1. QR must be authentic and currently issued.
// 2. EXIT must have been verified earlier.
// 3. ENTRY must not already be verified.
// 4. Original university approval must exist.
// 5. Parent PENDING does not block ENTRY.
// 6. Entry window ends at 06:00 PM IST.
// 7. Atomic update prevents duplicate ENTRY.
//
// IMPORTANT:
// Returning a student must not depend on obtaining
// a fresh parent decision after EXIT.
// ============================================================

const verifyEntry = async (outpassId, qrToken, securityGuardId) => {
  // ==========================================================
  // STEP 1: VALIDATE INPUT
  // ==========================================================

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

  // ==========================================================
  // STEP 2: CHECK SECURITY GATE WINDOW
  // ==========================================================

  if (!isWithinGateWindow(now)) {
    return fail(
      "QR verification is permitted only " +
        "between 09:15 AM and 06:00 PM IST.",
    );
  }

  // ==========================================================
  // STEP 3: VERIFY SIGNED QR
  // ==========================================================

  const verification = verifyQRSignature(qrToken, now);

  if (!verification.valid) {
    return fail(verification.message || "Invalid QR signature.");
  }

  if (verification.payload?.outpassId !== String(outpassId)) {
    return fail("QR token does not belong to this outpass.");
  }

  // ==========================================================
  // STEP 4: LOAD OUTPASS
  // ==========================================================

  const outpass = await Outpass.findOne({
    _id: outpassId,
    isDeleted: false,
  }).select("+qrToken");

  if (!outpass) {
    return fail("Outpass not found.");
  }

  // ==========================================================
  // STEP 5: REQUIRE VERIFIED EXIT
  // ==========================================================

  if (outpass.status !== OUTPASS_STATUS.EXITED) {
    return fail("Student must have a verified EXIT before ENTRY.");
  }

  if (outpass.exitVerified !== true || !outpass.exitVerifiedAt) {
    return fail("Verified EXIT record is missing.");
  }

  // ==========================================================
  // STEP 6: PREVENT DUPLICATE ENTRY
  // ==========================================================

  if (outpass.entryVerified === true || outpass.entryVerifiedAt) {
    return fail("ENTRY is already verified.");
  }

  // ==========================================================
  // STEP 7: UNIVERSITY APPROVAL RECORD
  //
  // Parent SMS consent is not required for returning.
  // The recorded university approval must still exist.
  // ==========================================================

  if (!outpass.approvedByFaculty || !outpass.approvedAt) {
    return fail("Original university approval record is incomplete.");
  }

  const approvedRole = String(outpass.approvedAuthorityRole || "")
    .trim()
    .toUpperCase();

  if (!AUTHORIZED_APPROVAL_ROLES.has(approvedRole)) {
    return fail("Original university approval role is invalid.");
  }

  // ==========================================================
  // STEP 8: VERIFY STORED QR TOKEN
  // ==========================================================

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

  // ==========================================================
  // STEP 9: CHECK QR DATE AND VALIDITY WINDOW
  // ==========================================================

  if (!isWithinQRValidityWindow(outpass.outDate, now)) {
    return fail(
      "QR verification is not allowed outside " +
        "the scheduled date and gate window.",
    );
  }

  const { validFrom, expiresAt } = getValidityWindow(outpass.outDate);

  if (!outpass.qrValidFrom || !outpass.qrExpiresAt) {
    return fail("Stored QR validity information is missing.");
  }

  const savedValidFrom = new Date(outpass.qrValidFrom);

  const savedExpiresAt = new Date(outpass.qrExpiresAt);

  if (
    Number.isNaN(savedValidFrom.getTime()) ||
    Number.isNaN(savedExpiresAt.getTime())
  ) {
    return fail("Stored QR validity information is invalid.");
  }

  if (
    now < savedValidFrom ||
    now >= savedExpiresAt ||
    now < validFrom ||
    now >= expiresAt
  ) {
    return fail("QR pass is outside its permitted time window.");
  }

  // Confirm signed token expiry matches the database.
  if (
    verification.payload?.expiresAt !==
    Math.floor(savedExpiresAt.getTime() / 1000)
  ) {
    return fail("QR token expiry does not match the issued pass.");
  }

  // ==========================================================
  // STEP 10: ENTRY MUST BE AFTER EXIT
  // ==========================================================

  const exitTime = new Date(outpass.exitVerifiedAt);

  if (Number.isNaN(exitTime.getTime()) || now <= exitTime) {
    return fail("ENTRY time must be later than EXIT time.");
  }

  // ==========================================================
  // STEP 11: RETURNED STATUS
  // ==========================================================

  const returnedStatus = OUTPASS_STATUS.RETURNED || OUTPASS_STATUS.COMPLETED;

  if (!returnedStatus) {
    return fail("RETURNED or COMPLETED status is not configured.");
  }

  // ==========================================================
  // STEP 12: FINAL VERIFICATION TIME
  // ==========================================================

  const verificationTime = new Date();

  if (
    !isWithinGateWindow(verificationTime) ||
    !isWithinQRValidityWindow(outpass.outDate, verificationTime)
  ) {
    return fail("Security gate verification window has closed.");
  }

  if (verificationTime <= exitTime || verificationTime >= savedExpiresAt) {
    return fail("ENTRY time is invalid or the QR has expired.");
  }

  // ==========================================================
  // STEP 13: ATOMIC ENTRY UPDATE
  //
  // Prevent:
  // - Duplicate ENTRY
  // - Invalid/replaced QR
  // - Revoked QR
  // - Expired QR
  // - University approval record changing
  //
  // Parent consent is not changed here.
  // ==========================================================

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
        "The outpass may have changed " +
        "or was already scanned.",
    );
  }

  // ==========================================================
  // STEP 14: STUDENT ACTIVITY
  // ==========================================================

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

  // ==========================================================
  // STEP 15: SECURITY RESPONSE
  // ==========================================================

  await populateSecurityDetails(updatedOutpass);

  return {
    success: true,

    message: "Student ENTRY verified successfully.",

    data: buildSecurityResponse(updatedOutpass),
  };
};

// ============================================================
// EXPORT
// ============================================================

module.exports = Object.freeze({
  verifyEntry,
});
