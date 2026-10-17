"use strict";

const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");

const { verifyQRSignature, createQRToken } = require("../services/qrService");

// ============================================================
// AUTHORIZED UNIVERSITY APPROVAL ROLES
// ============================================================

const AUTHORIZED_ROLES = new Set([
  "MENTOR",
  "BACKUP_MENTOR",
  "COORDINATOR",
  "HOD",
  "HOI",
]);

// ============================================================
// GET STUDENT DIGITAL OUTPASS QR
//
// University faculty approval is mandatory.
// Parent SMS approval is optional while PENDING.
// Explicit parent rejection is never overridden.
//
// SECURITY:
// - Student ownership required
// - University approval required
// - Issued signed QR required
// - Time window required
// - Signature verification required
// ============================================================

const getStudentQR = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  // ==========================================================
  // STEP 1: AUTHENTICATED STUDENT
  // ==========================================================

  const studentId = req.user?._id || req.user?.id;
  const { outpassId } = req.params;

  if (!studentId) {
    return res.status(401).json({
      success: false,
      message: "Student login required.",
    });
  }

  if (!outpassId || typeof outpassId !== "string") {
    return res.status(400).json({
      success: false,
      message: "Valid outpass ID is required.",
    });
  }

  // ==========================================================
  // STEP 2: IDENTIFY OUTPASS
  // ==========================================================

  const lookup = mongoose.isValidObjectId(outpassId)
    ? {
        $or: [{ _id: outpassId }, { outpassId }],
      }
    : {
        outpassId,
      };

  let outpass = await Outpass.findOne({
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

  // ==========================================================
  // STEP 3: OUTPASS STATUS CHECK
  // ==========================================================

  const allowedStatuses = ["APPROVED", "EXITED"];

  if (!allowedStatuses.includes(outpass.status)) {
    return res.status(403).json({
      success: false,
      message: "QR is not available for this outpass status.",
    });
  }

  // ==========================================================
  // STEP 4: PARENT DECISION
  //
  // Parent PENDING:
  //   QR allowed after authorized faculty approval.
  //
  // Parent APPROVED:
  //   QR allowed after authorized faculty approval.
  //
  // Parent REJECTED:
  //   QR blocked.
  //
  // IMPORTANT:
  // Never modify parent status automatically.
  // ==========================================================

  const parentStatus = outpass.parentDecision?.status || "PENDING";

  if (!["PENDING", "APPROVED", "REJECTED"].includes(parentStatus)) {
    return res.status(403).json({
      success: false,
      message: "Invalid parent decision status.",
    });
  }

  if (parentStatus === "REJECTED") {
    return res.status(403).json({
      success: false,
      message: "Parent has rejected this outpass. QR access is blocked.",
    });
  }

  // Parent PENDING does not independently block the QR.
  // University approval checks follow.

  // ==========================================================
  // STEP 5: VERIFY UNIVERSITY FACULTY APPROVAL
  // ==========================================================

  if (!outpass.approvedByFaculty) {
    return res.status(403).json({
      success: false,
      message: "University approval is incomplete: approving faculty missing.",
    });
  }

  if (!outpass.approvedAt) {
    return res.status(403).json({
      success: false,
      message: "University approval is incomplete: approval timestamp missing.",
    });
  }

  const approvedRole = String(outpass.approvedAuthorityRole || "")
    .trim()
    .toUpperCase();

  if (!AUTHORIZED_ROLES.has(approvedRole)) {
    return res.status(403).json({
      success: false,
      message: "University approval role is missing or unauthorized.",
    });
  }

  // ============================================================
  // RECOVER MISSING QR FOR AN ALREADY APPROVED OUTPASS
  // Temporary recovery for old approved records.
  // Parent PENDING is allowed; REJECTED is blocked above.
  // ============================================================

  if (
    outpass.status === "APPROVED" &&
    outpass.qrGenerated === false &&
    !outpass.qrToken &&
    !outpass.qrRevokedAt
  ) {
    let qr;

    try {
      qr = createQRToken(outpass, new Date());
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: error.message || "QR generation failed.",
      });
    }

    const repaired = await Outpass.findOneAndUpdate(
      {
        _id: outpass._id,
        student: studentId,
        isDeleted: false,
        status: "APPROVED",

        approvedByFaculty: outpass.approvedByFaculty,
        approvedAt: outpass.approvedAt,
        approvedAuthorityRole: outpass.approvedAuthorityRole,

        "parentDecision.status": parentStatus,

        qrGenerated: false,
        qrToken: null,
        qrValidFrom: null,
        qrExpiresAt: null,
        qrRevokedAt: null,
      },
      {
        $set: {
          qrGenerated: true,
          qrGeneratedAt: qr.qrGeneratedAt,
          qrToken: qr.token,
          qrValidFrom: qr.qrValidFrom,
          qrExpiresAt: qr.qrExpiresAt,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    ).select("+qrToken");

    if (repaired) {
      outpass = repaired;
    } else {
      // Another request may have issued the QR first,
      // or the outpass may have changed.
      outpass = await Outpass.findOne({
        _id: outpass._id,
        student: studentId,
        isDeleted: false,
      }).select("+qrToken");

      if (!outpass) {
        return res.status(404).json({
          success: false,
          message: "Outpass no longer exists.",
        });
      }

      if (outpass.parentDecision?.status === "REJECTED") {
        return res.status(403).json({
          success: false,
          message: "Parent has rejected this outpass.",
        });
      }
    }
  }

  // ==========================================================
  // STEP 6: VERIFY QR WAS GENERATED
  // ==========================================================

  if (
    outpass.qrGenerated !== true ||
    !outpass.qrToken ||
    !outpass.qrValidFrom ||
    !outpass.qrExpiresAt
  ) {
    return res.status(403).json({
      success: false,
      message: "Digital QR has not been issued for this outpass.",
    });
  }

  // ==========================================================
  // STEP 7: CHECK QR REVOCATION
  // ==========================================================

  if (outpass.qrRevokedAt) {
    return res.status(403).json({
      success: false,
      message: "This QR has been revoked.",
    });
  }

  // ==========================================================
  // STEP 8: VERIFY QR TIME WINDOW
  // ==========================================================

  const now = new Date();

  const validFrom = new Date(outpass.qrValidFrom);
  const expiresAt = new Date(outpass.qrExpiresAt);

  if (
    Number.isNaN(validFrom.getTime()) ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt <= validFrom
  ) {
    return res.status(403).json({
      success: false,
      message: "QR validity information is invalid.",
    });
  }

  if (now < validFrom) {
    return res.status(403).json({
      success: false,
      message: "QR is not yet valid.",
    });
  }

  if (now >= expiresAt) {
    return res.status(403).json({
      success: false,
      message: "QR has expired.",
    });
  }

  // ==========================================================
  // STEP 9: VERIFY QR DIGITAL SIGNATURE
  // ==========================================================

  const verification = verifyQRSignature(outpass.qrToken, now);

  if (
    !verification.valid ||
    verification.payload?.outpassId !== String(outpass._id) ||
    verification.payload?.expiresAt !== Math.floor(expiresAt.getTime() / 1000)
  ) {
    return res.status(403).json({
      success: false,
      message: "QR integrity verification failed.",
    });
  }

  // ==========================================================
  // STEP 10: SUCCESS RESPONSE
  // ==========================================================

  return res.status(200).json({
    success: true,

    message: "Digital outpass QR retrieved successfully.",

    data: {
      outpassId: outpass.outpassId,

      qrToken: outpass.qrToken,

      validFrom: outpass.qrValidFrom,

      expiresAt: outpass.qrExpiresAt,

      status: outpass.status,

      approvedAuthorityRole: approvedRole,

      // Parent status is reported accurately.
      // PENDING is never mislabeled as APPROVED.
      parentStatus,
    },
  });
});

// ============================================================
// EXPORT
// ============================================================

module.exports = Object.freeze({
  getStudentQR,
});
