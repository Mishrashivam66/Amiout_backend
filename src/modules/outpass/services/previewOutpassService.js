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

// ============================================================
// AMIOUT ENTERPRISE - SECURITY QR PREVIEW SERVICE
//
// WORKFLOW:
// SCAN QR -> VALIDATE -> SHOW DETAILS -> CONFIRM EXIT/ENTRY
//
// IMPORTANT:
// This service NEVER marks EXIT or ENTRY.
// ============================================================

const AUTHORIZED_ROLES = new Set([
  "MENTOR",
  "BACKUP_MENTOR",
  "COORDINATOR",
  "HOD",
  "HOI",
]);

// Old approval audit format.
// New approval service saves the reason without this prefix.
const PARENT_BYPASS_PREFIX = "PARENT_PENDING_BYPASS:";

// ============================================================
// HELPERS
// ============================================================

const fail = (message) => ({
  success: false,
  message,
});

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const getId = (value) => String(value?._id || value || "");

const sameId = (a, b) => Boolean(getId(a)) && getId(a) === getId(b);

// ============================================================
// SAFE QR TOKEN COMPARISON
// ============================================================

const tokensMatch = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const hashA = crypto.createHash("sha256").update(a).digest();

  const hashB = crypto.createHash("sha256").update(b).digest();

  return crypto.timingSafeEqual(hashA, hashB);
};

// ============================================================
// VERIFIED PARENT APPROVAL
// ============================================================

const hasVerifiedParentConsent = (outpass) => {
  return (
    normalize(outpass.parentDecision?.status) === "APPROVED" &&
    typeof outpass.hasParentConsent === "function" &&
    outpass.hasParentConsent() === true
  );
};

// ============================================================
// FACULTY-AUTHORIZED PARENT BYPASS
//
// Supports both:
// 1. Legacy prefixed audit reason
// 2. Current plain-text audit reason
//
// Matches the Student QR controller's updated checks.
// ============================================================

const hasValidParentBypass = (outpass) => {
  const bypass = outpass.approvalBypass;

  const acknowledgement = outpass.parentConsentAcknowledgement;

  const parentStatus = normalize(outpass.parentDecision?.status);

  const callOutcome = normalize(outpass.parentDecision?.callOutcome);

  // Parent must still be pending.
  if (parentStatus !== "PENDING") {
    return false;
  }

  // Explicit parent rejection cannot be bypassed.
  if (callOutcome === "REJECTED") {
    return false;
  }

  // University approval must exist.
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

  // A saved faculty bypass must exist.
  if (
    bypass?.used !== true ||
    !bypass.performedBy ||
    !bypass.performedAt ||
    !bypass.authorityRole
  ) {
    return false;
  }

  // Same approving faculty.
  if (!sameId(bypass.performedBy, outpass.approvedByFaculty)) {
    return false;
  }

  // Same approved authority role.
  if (normalize(bypass.authorityRole) !== approvedRole) {
    return false;
  }

  // ==========================================================
  // FIX: CURRENT APPROVAL SERVICE SAVES PLAIN-TEXT REASON
  // ==========================================================

  const storedReason = String(bypass.reason || "").trim();

  const documentedReason = storedReason.startsWith(PARENT_BYPASS_PREFIX)
    ? storedReason.slice(PARENT_BYPASS_PREFIX.length).trim()
    : storedReason;

  if (documentedReason.length < 10 || documentedReason.length > 500) {
    return false;
  }

  // Approval-time parent status must be PENDING.
  if (normalize(acknowledgement?.parentStatusAtApproval) !== "PENDING") {
    return false;
  }

  // Same faculty acknowledgement.
  if (!sameId(acknowledgement.acknowledgedBy, outpass.approvedByFaculty)) {
    return false;
  }

  // Same approved role.
  if (normalize(acknowledgement.acknowledgedRole) !== approvedRole) {
    return false;
  }

  if (!acknowledgement.acknowledgedAt) {
    return false;
  }

  // Both audit records must describe the same reason.
  const acknowledgedReason = String(acknowledgement.remark || "").trim();

  if (!acknowledgedReason || acknowledgedReason !== documentedReason) {
    return false;
  }

  // Verify audit timestamps.
  const approvalTime = new Date(outpass.approvedAt).getTime();

  const bypassTime = new Date(bypass.performedAt).getTime();

  const acknowledgementTime = new Date(
    acknowledgement.acknowledgedAt,
  ).getTime();

  if (
    !Number.isFinite(approvalTime) ||
    !Number.isFinite(bypassTime) ||
    !Number.isFinite(acknowledgementTime)
  ) {
    return false;
  }

  if (approvalTime !== bypassTime || approvalTime !== acknowledgementTime) {
    return false;
  }

  return true;
};

// ============================================================
// PARENT AUTHORIZATION
// ============================================================

const validateParentAuthorization = (outpass) => {
  const parentStatus = normalize(outpass.parentDecision?.status || "PENDING");

  // Explicit rejection always blocks new EXIT.
  if (
    parentStatus === "REJECTED" ||
    normalize(outpass.parentDecision?.callOutcome) === "REJECTED"
  ) {
    return fail("Parent rejected this outpass. EXIT is blocked.");
  }

  // Verified parent approval.
  if (parentStatus === "APPROVED") {
    if (!hasVerifiedParentConsent(outpass)) {
      return fail("Verified parent consent is incomplete.");
    }

    return {
      success: true,
      parentStatus,
      authorizationType: "PARENT_APPROVED",
    };
  }

  // Documented faculty-authorized bypass.
  if (parentStatus === "PENDING") {
    if (!hasValidParentBypass(outpass)) {
      return fail(
        "Parent decision is pending and no valid faculty-authorized bypass is recorded.",
      );
    }

    return {
      success: true,
      parentStatus,
      authorizationType: "FACULTY_AUTHORIZED_PARENT_BYPASS",
    };
  }

  return fail("Invalid parent decision status.");
};

// ============================================================
// VALIDATE UNIVERSITY APPROVAL
// ============================================================

const validateUniversityApproval = (outpass) => {
  const role = normalize(outpass.approvedAuthorityRole);

  if (
    !outpass.approvedByFaculty ||
    !outpass.approvedAt ||
    !AUTHORIZED_ROLES.has(role)
  ) {
    return fail("Authorized university faculty approval is required.");
  }

  return {
    success: true,
    approvedRole: role,
  };
};

// ============================================================
// SECURITY QR PREVIEW
//
// Read-only verification. Never mark movement here.
// ============================================================

const previewOutpass = async (outpassId, qrToken, securityGuardId, mode) => {
  // ==========================================================
  // STEP 1: INPUT VALIDATION
  // ==========================================================

  if (
    !mongoose.isValidObjectId(outpassId) ||
    !mongoose.isValidObjectId(securityGuardId)
  ) {
    return fail("Invalid outpass or security guard ID.");
  }

  if (typeof qrToken !== "string" || !qrToken.trim() || qrToken.length > 4096) {
    return fail("Valid QR token is required.");
  }

  const verificationMode = normalize(mode);

  if (!["EXIT", "ENTRY"].includes(verificationMode)) {
    return fail("Verification mode must be EXIT or ENTRY.");
  }

  const now = new Date();

  // ==========================================================
  // STEP 2: VERIFY SIGNED QR
  // ==========================================================

  const verification = verifyQRSignature(qrToken, now);

  if (!verification.valid) {
    return fail(verification.message || "Invalid QR signature.");
  }

  if (verification.payload?.outpassId !== String(outpassId)) {
    return fail("QR token does not belong to this outpass.");
  }

  // ==========================================================
  // STEP 3: LOAD OUTPASS
  // ==========================================================

  const outpass = await Outpass.findOne({
    _id: outpassId,
    isDeleted: false,
  }).select("+qrToken");

  if (!outpass) {
    return fail("Outpass not found.");
  }

  // ==========================================================
  // STEP 4: UNIVERSITY APPROVAL
  // ==========================================================

  const universityApproval = validateUniversityApproval(outpass);

  if (!universityApproval.success) {
    return universityApproval;
  }

  // ==========================================================
  // STEP 5: VERIFY CURRENT QR TOKEN
  // ==========================================================

  if (
    outpass.qrGenerated !== true ||
    !outpass.qrToken ||
    !tokensMatch(qrToken, outpass.qrToken)
  ) {
    return fail("QR token is invalid or no longer current.");
  }

  if (outpass.qrRevokedAt) {
    return fail("This digital QR has been revoked.");
  }

  // ==========================================================
  // STEP 6: OFFICIAL QR WINDOW
  // ==========================================================

  if (!isWithinQRValidityWindow(outpass.outDate, now)) {
    return fail(
      "QR verification is allowed only on the outpass date between 09:15 AM and 06:00 PM IST.",
    );
  }

  let officialWindow;

  try {
    officialWindow = getValidityWindow(outpass.outDate);
  } catch {
    return fail("Invalid outpass QR validity window.");
  }

  if (!outpass.qrValidFrom || !outpass.qrExpiresAt) {
    return fail("QR validity information is missing.");
  }

  const storedValidFrom = new Date(outpass.qrValidFrom);

  const storedExpiresAt = new Date(outpass.qrExpiresAt);

  if (
    !Number.isFinite(storedValidFrom.getTime()) ||
    !Number.isFinite(storedExpiresAt.getTime())
  ) {
    return fail("Stored QR validity is invalid.");
  }

  if (
    now < storedValidFrom ||
    now >= storedExpiresAt ||
    now < officialWindow.validFrom ||
    now >= officialWindow.expiresAt
  ) {
    return fail("QR is outside its validity window.");
  }

  if (
    storedValidFrom.getTime() !== officialWindow.validFrom.getTime() ||
    storedExpiresAt.getTime() !== officialWindow.expiresAt.getTime()
  ) {
    return fail("QR validity does not match university policy.");
  }

  if (
    verification.payload?.expiresAt !==
    Math.floor(storedExpiresAt.getTime() / 1000)
  ) {
    return fail("QR token expiry does not match the issued pass.");
  }

  // ==========================================================
  // STEP 7: VERIFY EXIT / ENTRY MODE
  // ==========================================================

  let parentAuthorizationType = null;

  let parentStatus = normalize(outpass.parentDecision?.status || "PENDING");

  // ==========================================================
  // EXIT PREVIEW
  // ==========================================================

  if (verificationMode === "EXIT") {
    if (outpass.status !== OUTPASS_STATUS.APPROVED) {
      return fail("Only approved outpasses can be used for EXIT.");
    }

    if (outpass.exitVerified === true || outpass.exitVerifiedAt) {
      return fail("EXIT is already verified.");
    }

    // Parent authorization must be valid before EXIT.
    const parentCheck = validateParentAuthorization(outpass);

    if (!parentCheck.success) {
      return parentCheck;
    }

    parentStatus = parentCheck.parentStatus;

    parentAuthorizationType = parentCheck.authorizationType;
  }

  // ==========================================================
  // ENTRY PREVIEW
  // ==========================================================

  if (verificationMode === "ENTRY") {
    if (
      outpass.status !== OUTPASS_STATUS.EXITED ||
      outpass.exitVerified !== true ||
      !outpass.exitVerifiedAt
    ) {
      return fail("Verified EXIT is required before ENTRY.");
    }

    if (outpass.entryVerified === true || outpass.entryVerifiedAt) {
      return fail("ENTRY is already verified.");
    }

    const exitTime = new Date(outpass.exitVerifiedAt).getTime();

    if (!Number.isFinite(exitTime) || now.getTime() <= exitTime) {
      return fail("ENTRY time must be after EXIT time.");
    }

    // Parent authorization was already checked at EXIT.
    parentAuthorizationType = "ORIGINAL_EXIT_ALREADY_VERIFIED";
  }

  // ==========================================================
  // STEP 8: LOAD STUDENT DISPLAY INFORMATION
  // ==========================================================

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
    console.error("Security preview population failed:", error.message);
  }

  // ==========================================================
  // STEP 9: RETURN VERIFIED STUDENT DETAILS
  //
  // NO database writes or movement confirmation.
  // ==========================================================

  return {
    success: true,

    message: `QR verified. Review student details before confirming ${verificationMode}.`,

    data: {
      ...buildSecurityResponse(outpass),

      verificationMode,

      parentStatus,

      parentAuthorizationType,

      approvedAuthorityRole: universityApproval.approvedRole,

      requiresConfirmation: true,
    },
  };
};

module.exports = Object.freeze({
  previewOutpass,
});
