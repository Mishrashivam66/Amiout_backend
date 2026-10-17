"use strict";

const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");

const { verifyQRSignature } = require("../services/qrService");

const getStudentQR = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const studentId = req.user?._id || req.user?.id;
  const { outpassId } = req.params;

  if (!studentId) {
    return res.status(401).json({
      success: false,
      message: "Student login required.",
    });
  }

  const lookup = mongoose.isValidObjectId(outpassId)
    ? {
        $or: [{ _id: outpassId }, { outpassId }],
      }
    : { outpassId };

  const outpass = await Outpass.findOne({
    ...lookup,
    student: studentId,
    isDeleted: false,
  }).select("+qrToken");

  if (!outpass) {
    return res.status(404).json({
      success: false,
      message: "Outpass not found.",
    });
  }

  // ============================================================
  // CHECK OUTPASS STATUS
  // ============================================================

  if (!["APPROVED", "EXITED"].includes(outpass.status)) {
    return res.status(403).json({
      success: false,
      message: "QR is not available for this outpass status.",
    });
  }

  // ============================================================
  // TEMPORARY QR DEBUGGING
  // Remove this console.log after identifying the problem.
  // ============================================================

  console.log("[AMIOUT QR APPROVAL CHECK]", {
    outpassStatus: outpass.status,

    parentStatus: outpass.parentDecision?.status,
    parentMethod: outpass.parentDecision?.method,

    smsDecidedAt: Boolean(outpass.parentDecision?.decidedAt),

    smsTokenUsedAt: Boolean(outpass.parentDecision?.tokenUsedAt),

    callOutcome: outpass.parentDecision?.callOutcome,

    phoneVerifiedByFaculty: Boolean(outpass.parentDecision?.verifiedByFaculty),

    phoneVerifiedByRole: Boolean(outpass.parentDecision?.verifiedByRole),

    phoneVerifiedAt: Boolean(outpass.parentDecision?.callVerifiedAt),

    hasParentConsent:
      typeof outpass.hasParentConsent === "function"
        ? outpass.hasParentConsent()
        : false,

    facultyApprovedAt: Boolean(outpass.approvedAt),

    facultyApprovedBy: Boolean(outpass.approvedByFaculty),

    qrGenerated: outpass.qrGenerated,

    qrTokenExists: Boolean(outpass.qrToken),

    qrValidFromExists: Boolean(outpass.qrValidFrom),

    qrExpiresAtExists: Boolean(outpass.qrExpiresAt),
  });

  // ============================================================
  // VERIFY PARENT CONSENT
  // ============================================================

  if (
    typeof outpass.hasParentConsent !== "function" ||
    !outpass.hasParentConsent()
  ) {
    return res.status(403).json({
      success: false,
      message: "Parent consent verification is pending or incomplete.",
    });
  }

  // ============================================================
  // VERIFY UNIVERSITY APPROVAL
  // ============================================================

  if (!outpass.approvedByFaculty) {
    return res.status(403).json({
      success: false,
      message:
        "University approval record is incomplete: approving faculty missing.",
    });
  }

  if (!outpass.approvedAt) {
    return res.status(403).json({
      success: false,
      message:
        "University approval record is incomplete: approval timestamp missing.",
    });
  }

  // ============================================================
  // CHECK QR GENERATION
  // ============================================================

  if (
    outpass.qrGenerated !== true ||
    !outpass.qrToken ||
    !outpass.qrValidFrom ||
    !outpass.qrExpiresAt ||
    outpass.qrRevokedAt
  ) {
    return res.status(403).json({
      success: false,
      message: "No valid QR has been issued.",
    });
  }

  const now = new Date();

  // ============================================================
  // VERIFY QR TIME WINDOW
  // ============================================================

  if (now < outpass.qrValidFrom) {
    return res.status(403).json({
      success: false,
      message: "QR is not yet valid.",
    });
  }

  if (now >= outpass.qrExpiresAt) {
    return res.status(403).json({
      success: false,
      message: "QR has expired.",
    });
  }

  // ============================================================
  // VERIFY QR SIGNATURE
  // ============================================================

  const verification = verifyQRSignature(outpass.qrToken, now);

  if (
    !verification.valid ||
    verification.payload?.outpassId !== String(outpass._id) ||
    verification.payload?.expiresAt !==
      Math.floor(outpass.qrExpiresAt.getTime() / 1000)
  ) {
    return res.status(403).json({
      success: false,
      message: "QR integrity verification failed.",
    });
  }

  // ============================================================
  // RETURN SECURE QR
  // ============================================================

  return res.status(200).json({
    success: true,
    message: "Digital outpass QR retrieved successfully.",
    data: {
      outpassId: outpass.outpassId,
      qrToken: outpass.qrToken,
      validFrom: outpass.qrValidFrom,
      expiresAt: outpass.qrExpiresAt,
      status: outpass.status,
    },
  });
});

module.exports = Object.freeze({
  getStudentQR,
});
