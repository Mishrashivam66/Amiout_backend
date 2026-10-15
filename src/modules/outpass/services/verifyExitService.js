"use strict";

const crypto = require("node:crypto");
const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");

const { OUTPASS_STATUS } = require("../constants/outpassStatus");

const { verifyQRSignature } = require("./qrService");

const { exitVerifiedEvent } = require("../utils/timelineHelper");

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

const verifyExit = async (outpassId, qrToken, securityGuardId) => {
  if (
    !mongoose.isValidObjectId(outpassId) ||
    !mongoose.isValidObjectId(securityGuardId)
  ) {
    return fail("Invalid outpass or security guard ID.");
  }

  if (!qrToken || typeof qrToken !== "string") {
    return fail("QR token is required. Scan the student QR.");
  }

  const now = new Date();

  // STEP 1: Validate signed QR.
  const verification = verifyQRSignature(qrToken, now);

  if (!verification.valid) {
    return fail(verification.message);
  }

  // STEP 2: QR must belong to the requested outpass.
  if (verification.payload.outpassId !== String(outpassId)) {
    return fail("QR token does not belong to this outpass.");
  }

  // STEP 3: Load the stored QR securely.
  const outpass = await Outpass.findOne({
    _id: outpassId,
    isDeleted: false,
  }).select("+qrToken");

  if (!outpass) {
    return fail("Outpass not found.");
  }

  // STEP 4: Validate approved state.
  if (outpass.status !== OUTPASS_STATUS.APPROVED) {
    return fail("Only approved outpasses can be used for EXIT.");
  }

  if (outpass.exitVerified === true || outpass.exitVerifiedAt) {
    return fail("EXIT is already verified.");
  }

  // STEP 5: Verify current token, revocation and time.
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

  if (
    !outpass.qrValidFrom ||
    !outpass.qrExpiresAt ||
    now < outpass.qrValidFrom ||
    now >= outpass.qrExpiresAt
  ) {
    return fail("QR pass is outside its permitted time window.");
  }

  // STEP 6: Atomic EXIT update.
  const updatedOutpass = await Outpass.findOneAndUpdate(
    {
      _id: outpass._id,
      isDeleted: false,
      status: OUTPASS_STATUS.APPROVED,
      exitVerified: false,
      exitVerifiedAt: null,
      qrGenerated: true,
      qrToken,
      qrRevokedAt: null,
      qrValidFrom: { $lte: now },
      qrExpiresAt: { $gt: now },
    },
    {
      $set: {
        status: OUTPASS_STATUS.EXITED,
        exitVerified: true,
        exitVerifiedAt: now,
        exitVerifiedBy: securityGuardId,
      },
      $push: {
        // Timeline schema references User.
        // Security guard ID is independently stored
        // in exitVerifiedBy for the audit.
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
      "EXIT could not be verified. Pass state changed or it was already scanned.",
    );
  }

  // STEP 7: Activity (best effort).
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

  return {
    success: true,
    message: "Student EXIT verified successfully.",
    data: outpassDTO(updatedOutpass),
  };
};

module.exports = Object.freeze({
  verifyExit,
});
