"use strict";

const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");

const {
  verifyQRSignature,
  getValidityWindow,
  isWithinQRValidityWindow,
} = require("../services/qrService");

// ============================================================
// AMIOUT ENTERPRISE - STUDENT DIGITAL QR CONTROLLER
//
// Security requirements:
// 1. Authenticated student can access only their own QR.
// 2. Valid institutional approval is mandatory.
// 3. Parent APPROVED requires verified consent.
// 4. Parent PENDING requires a consistent faculty bypass audit.
// 5. Parent REJECTED always blocks QR access.
// 6. QR must already exist in database.
// 7. Signature, validity and revocation are verified.
// 8. GET requests never create or update a QR.
// ============================================================

const AUTHORIZED_ROLES = new Set([
  "MENTOR",
  "BACKUP_MENTOR",
  "COORDINATOR",
  "HOD",
  "HOI",
]);

// Legacy audit format support.
// Current sharedApprovalService stores the reason as plain text.
const PARENT_BYPASS_PREFIX = "PARENT_PENDING_BYPASS:";

const getId = (value) => String(value?._id || value || "");

const sameId = (a, b) => Boolean(getId(a)) && getId(a) === getId(b);

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const failure = (res, status, message) =>
  res.status(status).json({
    success: false,
    message,
  });

// ============================================================
// VERIFIED PARENT APPROVAL
// ============================================================

const hasVerifiedParentConsent = (outpass) => {
  if (normalize(outpass.parentDecision?.status) !== "APPROVED") {
    return false;
  }

  if (typeof outpass.hasParentConsent !== "function") {
    return false;
  }

  return outpass.hasParentConsent() === true;
};

// ============================================================
// FACULTY PARENT-BYPASS AUDIT
//
// IMPORTANT:
// Current sharedApprovalService writes:
//
// approvalBypass.reason = reason
// parentConsentAcknowledgement.remark = reason
//
// Therefore a prefix is NOT mandatory.
//
// Validation still requires matching faculty, matching role,
// documented reason, matching audit records and timestamps.
// ============================================================

const hasValidParentBypass = (outpass) => {
  const bypass = outpass.approvalBypass;
  const acknowledgement = outpass.parentConsentAcknowledgement;

  // Parent must remain pending.
  if (normalize(outpass.parentDecision?.status) !== "PENDING") {
    return false;
  }

  // Explicit parent rejection cannot be overridden.
  if (normalize(outpass.parentDecision?.callOutcome) === "REJECTED") {
    return false;
  }

  // Institution must have approved this outpass.
  if (
    !outpass.approvedByFaculty ||
    !outpass.approvedAt ||
    !outpass.approvedAuthorityRole
  ) {
    return false;
  }

  const approvedRole = normalize(outpass.approvedAuthorityRole);

  if (!AUTHORIZED_ROLES.has(approvedRole)) {
    return false;
  }

  // A documented parent bypass must exist.
  if (
    bypass?.used !== true ||
    !bypass.performedBy ||
    !bypass.performedAt ||
    !bypass.authorityRole
  ) {
    return false;
  }

  // The bypass must belong to the actual approver.
  if (!sameId(bypass.performedBy, outpass.approvedByFaculty)) {
    return false;
  }

  if (normalize(bypass.authorityRole) !== approvedRole) {
    return false;
  }

  // ==========================================================
  // FIX: ACCEPT THE AUDIT FORMAT ACTUALLY SAVED
  // BY sharedApprovalService.js
  // ==========================================================

  const storedReason = String(bypass.reason || "").trim();

  const documentedReason = storedReason.startsWith(PARENT_BYPASS_PREFIX)
    ? storedReason.slice(PARENT_BYPASS_PREFIX.length).trim()
    : storedReason;

  // A meaningful reason remains compulsory.
  if (documentedReason.length < 10 || documentedReason.length > 500) {
    return false;
  }

  // Parent status at institutional approval must be pending.
  if (normalize(acknowledgement?.parentStatusAtApproval) !== "PENDING") {
    return false;
  }

  // Verify matching faculty.
  if (!sameId(acknowledgement.acknowledgedBy, outpass.approvedByFaculty)) {
    return false;
  }

  // Verify matching authority role.
  if (normalize(acknowledgement.acknowledgedRole) !== approvedRole) {
    return false;
  }

  // The approval service records the same reason
  // in both audit objects.
  const acknowledgedReason = String(acknowledgement.remark || "").trim();

  if (!acknowledgedReason || acknowledgedReason !== documentedReason) {
    return false;
  }

  // Verify that all required audit timestamps exist.
  if (!acknowledgement.acknowledgedAt) {
    return false;
  }

  const bypassTime = new Date(bypass.performedAt).getTime();

  const approvalTime = new Date(outpass.approvedAt).getTime();

  const acknowledgementTime = new Date(
    acknowledgement.acknowledgedAt,
  ).getTime();

  if (
    !Number.isFinite(bypassTime) ||
    !Number.isFinite(approvalTime) ||
    !Number.isFinite(acknowledgementTime)
  ) {
    return false;
  }

  // Both audit records must originate from
  // the same faculty approval operation.
  if (bypassTime !== approvalTime || acknowledgementTime !== approvalTime) {
    return false;
  }

  return true;
};

// ============================================================
// VALIDATE PARENT AUTHORIZATION
// ============================================================

const validateParentAuthorization = (outpass) => {
  const parentStatus = normalize(outpass.parentDecision?.status || "PENDING");

  // Explicit rejection always takes priority.
  if (
    parentStatus === "REJECTED" ||
    normalize(outpass.parentDecision?.callOutcome) === "REJECTED"
  ) {
    return {
      valid: false,
      message: "Parent rejected this outpass. QR access is blocked.",
    };
  }

  // Normal SMS/verified parent approval.
  if (parentStatus === "APPROVED") {
    if (!hasVerifiedParentConsent(outpass)) {
      return {
        valid: false,
        message: "Verified parent consent record is incomplete.",
      };
    }

    return {
      valid: true,
      parentStatus,
      authorizationType: "PARENT_APPROVED",
    };
  }

  // Faculty-authorized documented bypass.
  if (parentStatus === "PENDING") {
    if (!hasValidParentBypass(outpass)) {
      return {
        valid: false,
        message:
          "Parent decision is pending. Valid faculty-authorized bypass is required.",
      };
    }

    return {
      valid: true,
      parentStatus,
      authorizationType: "FACULTY_AUTHORIZED_PARENT_BYPASS",
    };
  }

  return {
    valid: false,
    message: "Invalid parent decision status.",
  };
};

// ============================================================
// GET STUDENT DIGITAL OUTPASS QR
// ============================================================

const getStudentQR = asyncHandler(async (req, res) => {
  // Never allow shared/private caching of QR tokens.
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  res.set("Vary", "Authorization");

  // ==========================================================
  // STEP 1: AUTHENTICATION
  // ==========================================================

  const studentId = req.user?._id || req.user?.id;

  const outpassId =
    typeof req.params.outpassId === "string" ? req.params.outpassId.trim() : "";

  if (!studentId || !mongoose.isValidObjectId(studentId)) {
    return failure(res, 401, "Valid student login required.");
  }

  if (!outpassId || outpassId.length > 120) {
    return failure(res, 400, "Valid outpass ID is required.");
  }

  // ==========================================================
  // STEP 2: LOAD STUDENT-OWNED OUTPASS
  // ==========================================================

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
    return failure(res, 404, "Outpass not found.");
  }

  // ==========================================================
  // STEP 3: OUTPASS STATUS
  // ==========================================================

  const allowedStatuses = new Set(["APPROVED", "EXITED"]);

  if (!allowedStatuses.has(outpass.status)) {
    return failure(res, 403, "QR is unavailable for this outpass status.");
  }

  // ==========================================================
  // STEP 4: FACULTY APPROVAL
  // ==========================================================

  const approvedRole = normalize(outpass.approvedAuthorityRole);

  if (
    !outpass.approvedByFaculty ||
    !outpass.approvedAt ||
    !AUTHORIZED_ROLES.has(approvedRole)
  ) {
    return failure(res, 403, "Valid university faculty approval is required.");
  }

  // ==========================================================
  // STEP 5: PARENT APPROVAL OR AUDITED BYPASS
  // ==========================================================

  const parentCheck = validateParentAuthorization(outpass);

  if (!parentCheck.valid) {
    return failure(res, 403, parentCheck.message);
  }

  // ==========================================================
  // STEP 6: QR MUST ALREADY EXIST
  // ==========================================================

  if (
    outpass.qrGenerated !== true ||
    !outpass.qrToken ||
    !outpass.qrGeneratedAt ||
    !outpass.qrValidFrom ||
    !outpass.qrExpiresAt
  ) {
    return failure(
      res,
      403,
      "Digital QR has not been issued. Contact university support.",
    );
  }

  // ==========================================================
  // STEP 7: QR REVOCATION
  // ==========================================================

  if (outpass.qrRevokedAt) {
    return failure(res, 403, "This digital QR has been revoked.");
  }

  // ==========================================================
  // STEP 8: QR VALIDITY WINDOW
  // ==========================================================

  const now = new Date();

  const validFrom = new Date(outpass.qrValidFrom);

  const expiresAt = new Date(outpass.qrExpiresAt);

  if (
    !Number.isFinite(validFrom.getTime()) ||
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt <= validFrom
  ) {
    return failure(res, 403, "QR validity information is invalid.");
  }

  if (now < validFrom) {
    return failure(res, 403, "QR is not yet valid.");
  }

  if (now >= expiresAt) {
    return failure(res, 403, "QR has expired.");
  }

  // ==========================================================
  // STEP 9: OFFICIAL UNIVERSITY WINDOW
  // ==========================================================

  let officialWindow;

  try {
    officialWindow = getValidityWindow(outpass.outDate);
  } catch (error) {
    return failure(res, 403, "Outpass QR date is invalid.");
  }

  if (!isWithinQRValidityWindow(outpass.outDate, now)) {
    return failure(
      res,
      403,
      "QR cannot be used outside the official outpass date and time.",
    );
  }

  if (
    validFrom.getTime() !== officialWindow.validFrom.getTime() ||
    expiresAt.getTime() !== officialWindow.expiresAt.getTime()
  ) {
    return failure(res, 403, "QR validity does not match university policy.");
  }

  // ==========================================================
  // STEP 10: SIGNED QR INTEGRITY
  // ==========================================================

  const verification = verifyQRSignature(outpass.qrToken, now);

  if (
    !verification.valid ||
    verification.payload?.outpassId !== String(outpass._id) ||
    verification.payload?.expiresAt !== Math.floor(expiresAt.getTime() / 1000)
  ) {
    return failure(res, 403, "QR integrity verification failed.");
  }

  // ==========================================================
  // STEP 11: RESPONSE
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
      parentStatus: parentCheck.parentStatus,
      authorizationType: parentCheck.authorizationType,
      exitVerified: outpass.exitVerified === true,
      entryVerified: outpass.entryVerified === true,
    },
  });
});

module.exports = Object.freeze({
  getStudentQR,
});
