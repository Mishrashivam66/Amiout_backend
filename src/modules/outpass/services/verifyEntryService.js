"use strict";

const crypto = require("node:crypto");
const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");

const { OUTPASS_STATUS } = require("../constants/outpassStatus");

const { verifyQRSignature } = require("./qrService");

const { outpassDTO } = require("../dtos/outpass.dto");

const { createActivity } = require("../../student/services/activityService");

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

const verifyEntry = async (outpassId, qrToken, securityGuardId) => {
  if (
    !mongoose.isValidObjectId(outpassId) ||
    !mongoose.isValidObjectId(securityGuardId)
  ) {
    return fail("Invalid outpass or security guard ID.");
  }

  if (!qrToken || typeof qrToken !== "string") {
    return fail("QR token is required.");
  }

  const now = new Date();

  // STEP 1: Verify signed QR.
  const verification = verifyQRSignature(qrToken, now);

  if (!verification.valid) {
    return fail(verification.message);
  }

  if (verification.payload.outpassId !== String(outpassId)) {
    return fail("QR token does not belong to this outpass.");
  }

  // STEP 2: Load outpass with stored QR.
  const outpass = await Outpass.findOne({
    _id: outpassId,
    isDeleted: false,
  }).select("+qrToken");

  if (!outpass) {
    return fail("Outpass not found.");
  }

  // STEP 3: ENTRY only after EXIT.
  if (outpass.status !== OUTPASS_STATUS.EXITED) {
    return fail("Student must have a verified EXIT before ENTRY.");
  }

  if (outpass.exitVerified !== true || !outpass.exitVerifiedAt) {
    return fail("Verified EXIT record is missing.");
  }

  if (outpass.entryVerified === true || outpass.entryVerifiedAt) {
    return fail("ENTRY is already verified.");
  }

  // STEP 4: Verify QR has not been changed or revoked.
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

  // Same QR time window currently applies to ENTRY.
  if (
    !outpass.qrValidFrom ||
    !outpass.qrExpiresAt ||
    now < outpass.qrValidFrom ||
    now >= outpass.qrExpiresAt
  ) {
    return fail("QR pass is outside its permitted time window.");
  }

  if (now <= new Date(outpass.exitVerifiedAt)) {
    return fail("ENTRY time must be later than EXIT time.");
  }

  // Use a status that exists in your existing enum.
  const returnedStatus = OUTPASS_STATUS.RETURNED || OUTPASS_STATUS.COMPLETED;

  if (!returnedStatus) {
    return fail("RETURNED or COMPLETED status is not configured.");
  }

  // STEP 5: Atomic ENTRY update.
  const updatedOutpass = await Outpass.findOneAndUpdate(
    {
      _id: outpass._id,
      isDeleted: false,
      status: OUTPASS_STATUS.EXITED,
      exitVerified: true,
      exitVerifiedAt: { $lt: now },
      entryVerified: false,
      entryVerifiedAt: null,
      qrGenerated: true,
      qrToken,
      qrRevokedAt: null,
      qrValidFrom: { $lte: now },
      qrExpiresAt: { $gt: now },
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
      "ENTRY verification failed. Pass state changed or it was already scanned.",
    );
  }

  // STEP 6: Activity (best effort).
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

  return {
    success: true,
    message: "Student ENTRY verified successfully.",
    data: outpassDTO(updatedOutpass),
  };
};

module.exports = Object.freeze({
  verifyEntry,
});
