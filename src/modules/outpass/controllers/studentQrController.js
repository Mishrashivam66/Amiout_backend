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
// FINAL RULES:
//
// 1. Only authenticated owner can retrieve QR.
// 2. One authorized faculty approval is mandatory.
// 3. Parent APPROVED requires verified consent.
// 4. Parent PENDING requires audited faculty bypass.
// 5. Parent REJECTED is always blocked.
// 6. QR must already exist in database.
// 7. QR signature, token, date and validity checked.
// 8. GET request never generates or modifies QR.
// ============================================================

const AUTHORIZED_ROLES = new Set([
  "MENTOR",
  "BACKUP_MENTOR",
  "COORDINATOR",
  "HOD",
  "HOI",
]);

const PARENT_BYPASS_PREFIX = "PARENT_PENDING_BYPASS:";

// ============================================================
// HELPERS
// ============================================================

const getId = (value) => String(value?._id || value || "");

const sameId = (a, b) => Boolean(getId(a)) && getId(a) === getId(b);

const normalize = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const failure = (res, status, message) =>
  res.status(status).json({
    success: false,
    message,
  });

// ============================================================
// VALIDATE VERIFIED PARENT APPROVAL
// ============================================================

const hasVerifiedParentConsent = (outpass) => {
  if (outpass.parentDecision?.status !== "APPROVED") {
    return false;
  }

  if (typeof outpass.hasParentConsent !== "function") {
    return false;
  }

  return outpass.hasParentConsent() === true;
};

// ============================================================
// VALIDATE DOCUMENTED FACULTY PARENT BYPASS
//
// This is NOT parent consent.
//
// Required:
// - Parent must still be PENDING.
// - Institutional approval exists.
// - Bypass performed by same approving faculty.
// - Role matches approved authority.
// - Reason and timestamp recorded.
// - Parent status at faculty approval was PENDING.
// ============================================================

const hasValidParentBypass = (outpass) => {
  const bypass = outpass.approvalBypass;

  const acknowledgement = outpass.parentConsentAcknowledgement;

  if (outpass.parentDecision?.status !== "PENDING") {
    return false;
  }

  if (outpass.parentDecision?.callOutcome === "REJECTED") {
    return false;
  }

  if (
    !outpass.approvedByFaculty ||
    !outpass.approvedAt ||
    !outpass.approvedAuthorityRole
  ) {
    return false;
  }

  if (
    bypass?.used !== true ||
    !bypass.performedBy ||
    !bypass.performedAt ||
    !bypass.authorityRole
  ) {
    return false;
  }

  if (!sameId(bypass.performedBy, outpass.approvedByFaculty)) {
    return false;
  }

  if (
    normalize(bypass.authorityRole) !== normalize(outpass.approvedAuthorityRole)
  ) {
    return false;
  }

  const bypassReason = String(bypass.reason || "").trim();

  if (!bypassReason.startsWith(PARENT_BYPASS_PREFIX)) {
    return false;
  }

  const documentedReason = bypassReason
    .slice(PARENT_BYPASS_PREFIX.length)
    .trim();

  if (documentedReason.length < 10) {
    return false;
  }

  if (acknowledgement?.parentStatusAtApproval !== "PENDING") {
    return false;
  }

  if (!sameId(acknowledgement.acknowledgedBy, outpass.approvedByFaculty)) {
    return false;
  }

  if (
    normalize(acknowledgement.acknowledgedRole) !==
    normalize(outpass.approvedAuthorityRole)
  ) {
    return false;
  }

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

  // Explicit rejection has highest priority.

  if (
    parentStatus === "REJECTED" ||
    outpass.parentDecision?.callOutcome === "REJECTED"
  ) {
    return {
      valid: false,
      message: "Parent rejected this outpass. QR access is blocked.",
    };
  }

  // Verified parent consent.

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

  // Documented faculty parent bypass.

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
  // --------------------------------------------------------
  // STEP 1: CACHE PROTECTION
  // --------------------------------------------------------

  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  res.set("Vary", "Authorization");

  // --------------------------------------------------------
  // STEP 2: AUTHENTICATION
  // --------------------------------------------------------

  const studentId = req.user?._id || req.user?.id;

  const outpassId =
    typeof req.params.outpassId === "string" ? req.params.outpassId.trim() : "";

  if (!studentId || !mongoose.isValidObjectId(studentId)) {
    return failure(res, 401, "Valid student login required.");
  }

  if (!outpassId || outpassId.length > 120) {
    return failure(res, 400, "Valid outpass ID is required.");
  }

  // --------------------------------------------------------
  // STEP 3: LOAD STUDENT OWNED OUTPASS
  // --------------------------------------------------------

  const lookup = mongoose.isValidObjectId(outpassId)
    ? {
        $or: [{ _id: outpassId }, { outpassId }],
      }
    : {
        outpassId,
      };

  const outpass = await Outpass.findOne({
    ...lookup,
    student: studentId,
    isDeleted: false,
  }).select("+qrToken");

  if (!outpass) {
    return failure(res, 404, "Outpass not found.");
  }

  // --------------------------------------------------------
  // STEP 4: OUTPASS STATUS
  // --------------------------------------------------------

  const allowedStatuses = new Set(["APPROVED", "EXITED"]);

  if (!allowedStatuses.has(outpass.status)) {
    return failure(res, 403, "QR is unavailable for this outpass status.");
  }

  // --------------------------------------------------------
  // STEP 5: VERIFIED UNIVERSITY APPROVAL
  // --------------------------------------------------------

  const approvedRole = normalize(outpass.approvedAuthorityRole);

  if (
    !outpass.approvedByFaculty ||
    !outpass.approvedAt ||
    !AUTHORIZED_ROLES.has(approvedRole)
  ) {
    return failure(res, 403, "Valid university faculty approval is required.");
  }

  // --------------------------------------------------------
  // STEP 6: PARENT CONSENT OR AUDITED BYPASS
  // --------------------------------------------------------

  const parentCheck = validateParentAuthorization(outpass);

  if (!parentCheck.valid) {
    return failure(res, 403, parentCheck.message);
  }

  // --------------------------------------------------------
  // STEP 7: QR MUST ALREADY EXIST
  //
  // No QR recovery/generation in GET endpoint.
  // Missing QR needs authorized server-side repair.
  // --------------------------------------------------------

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

  // --------------------------------------------------------
  // STEP 8: QR REVOCATION
  // --------------------------------------------------------

  if (outpass.qrRevokedAt) {
    return failure(res, 403, "This digital QR has been revoked.");
  }

  // --------------------------------------------------------
  // STEP 9: QR VALIDITY WINDOW
  // --------------------------------------------------------

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

  // --------------------------------------------------------
  // STEP 10: VERIFY OFFICIAL AMIOUT QR WINDOW
  // --------------------------------------------------------

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

  // --------------------------------------------------------
  // STEP 11: VERIFY SIGNED QR
  // --------------------------------------------------------

  const verification = verifyQRSignature(outpass.qrToken, now);

  if (
    !verification.valid ||
    verification.payload?.outpassId !== String(outpass._id) ||
    verification.payload?.expiresAt !== Math.floor(expiresAt.getTime() / 1000)
  ) {
    return failure(res, 403, "QR integrity verification failed.");
  }

  // --------------------------------------------------------
  // STEP 12: SUCCESS
  //
  // Only the authenticated student receives the
  // currently issued QR token.
  // --------------------------------------------------------

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

// ============================================================
// EXPORT
// ============================================================

module.exports = Object.freeze({
  getStudentQR,
});
