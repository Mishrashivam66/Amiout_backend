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

  if (!["APPROVED", "EXITED"].includes(outpass.status)) {
    return res.status(403).json({
      success: false,
      message: "QR is not available for this outpass status.",
    });
  }

  if (
    !outpass.hasParentConsent() ||
    !outpass.approvedAt ||
    !outpass.approvedByFaculty
  ) {
    return res.status(403).json({
      success: false,
      message: "Required approvals are incomplete.",
    });
  }

  if (
    !outpass.qrGenerated ||
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

  const verification = verifyQRSignature(outpass.qrToken, now);

  if (
    !verification.valid ||
    verification.payload.outpassId !== String(outpass._id) ||
    verification.payload.expiresAt !==
      Math.floor(outpass.qrExpiresAt.getTime() / 1000)
  ) {
    return res.status(403).json({
      success: false,
      message: "QR integrity verification failed.",
    });
  }

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
