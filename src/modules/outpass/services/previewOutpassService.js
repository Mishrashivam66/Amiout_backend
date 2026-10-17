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

const { buildSecurityResponse } = require("../utils/securityResponse");

const fail = (message) => ({
  success: false,
  message,
});

const sameId = (a, b) =>
  Boolean(a && b) && String(a._id || a) === String(b._id || b);

const tokensMatch = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();

  return crypto.timingSafeEqual(hashA, hashB);
};

const isWithinGateWindow = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);

  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);

  const minutes = hour * 60 + minute;

  return minutes >= 555 && minutes < 1035;
};

// Keep parent-decision behavior aligned with
// the existing verifyExitService.
const validateParentDecision = (outpass) => {
  const status = outpass.parentDecision?.status || "PENDING";

  if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
    return fail("Invalid parent decision status.");
  }

  if (status !== "REJECTED") {
    return { success: true };
  }

  const decision = outpass.parentDecision;
  const ack = outpass.parentConsentAcknowledgement;

  if (
    !decision?.decidedAt ||
    !ack ||
    ack.parentStatusAtApproval !== "REJECTED" ||
    !ack.acknowledgedBy ||
    !ack.acknowledgedRole ||
    !ack.acknowledgedAt ||
    String(ack.remark || "").trim().length < 10 ||
    !sameId(ack.acknowledgedBy, outpass.approvedByFaculty) ||
    ack.acknowledgedRole !== outpass.approvedAuthorityRole
  ) {
    return fail("Parent rejection has not been formally acknowledged.");
  }

  const decisionTime = new Date(decision.decidedAt).getTime();
  const ackTime = new Date(ack.acknowledgedAt).getTime();

  if (
    !Number.isFinite(decisionTime) ||
    !Number.isFinite(ackTime) ||
    ackTime < decisionTime
  ) {
    return fail("Parent rejection requires a new faculty review.");
  }

  return { success: true };
};

const previewOutpass = async (outpassId, qrToken, securityGuardId, mode) => {
  if (
    !mongoose.isValidObjectId(outpassId) ||
    !mongoose.isValidObjectId(securityGuardId)
  ) {
    return fail("Invalid outpass or security guard ID.");
  }

  if (typeof qrToken !== "string" || !qrToken.trim() || qrToken.length > 4096) {
    return fail("Valid QR token is required.");
  }

  if (!["EXIT", "ENTRY"].includes(mode)) {
    return fail("Invalid verification mode.");
  }

  const now = new Date();

  if (!isWithinGateWindow(now)) {
    return fail(
      "QR verification is allowed only between 09:15 AM and 05:15 PM IST.",
    );
  }

  // Verify actual QR signature.
  const verification = verifyQRSignature(qrToken, now);

  if (!verification.valid) {
    return fail(verification.message || "Invalid QR signature.");
  }

  if (String(verification.payload?.outpassId) !== String(outpassId)) {
    return fail("QR token does not belong to this outpass.");
  }

  const outpass = await Outpass.findOne({
    _id: outpassId,
    isDeleted: false,
  }).select("+qrToken");

  if (!outpass) {
    return fail("Outpass not found.");
  }

  // Check current stored QR.
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

  if (!isWithinQRValidityWindow(outpass.outDate, now)) {
    return fail("QR is outside its scheduled date or gate window.");
  }

  const { validFrom, expiresAt } = getValidityWindow(outpass.outDate);

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

  // Verify whether selected movement is currently eligible.
  if (mode === "EXIT") {
    if (outpass.status !== OUTPASS_STATUS.APPROVED) {
      return fail("Only approved outpasses can be used for EXIT.");
    }

    if (outpass.exitVerified || outpass.exitVerifiedAt) {
      return fail("EXIT is already verified.");
    }

    if (
      !outpass.approvedByFaculty ||
      !outpass.approvedAt ||
      !outpass.approvedAuthorityRole
    ) {
      return fail("University approval is required before EXIT.");
    }

    const parentCheck = validateParentDecision(outpass);

    if (!parentCheck.success) {
      return parentCheck;
    }
  } else {
    if (
      outpass.status !== OUTPASS_STATUS.EXITED ||
      !outpass.exitVerified ||
      !outpass.exitVerifiedAt
    ) {
      return fail("Student must have a verified EXIT before ENTRY.");
    }

    if (outpass.entryVerified || outpass.entryVerifiedAt) {
      return fail("ENTRY is already verified.");
    }

    if (now <= new Date(outpass.exitVerifiedAt)) {
      return fail("ENTRY time must be later than EXIT time.");
    }
  }

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

  // IMPORTANT:
  // No save(), updateOne(), or findOneAndUpdate().
  // This endpoint only reads student/outpass details.
  return {
    success: true,
    message: `QR verified. Review the details before confirming ${mode}.`,
    data: buildSecurityResponse(outpass),
  };
};

module.exports = Object.freeze({
  previewOutpass,
});
