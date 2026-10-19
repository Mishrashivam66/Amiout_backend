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
// AMIOUT ENTERPRISE
// SECURITY QR PREVIEW SERVICE
//
// FINAL WORKFLOW:
//
// SCAN QR
//   ↓
// VERIFY QR + UNIVERSITY APPROVAL
//   ↓
// VERIFY PARENT APPROVAL / AUTHORIZED BYPASS
//   ↓
// SHOW STUDENT DETAILS
//   ↓
// SECURITY GUARD CONFIRMS EXIT / ENTRY
//
// THIS SERVICE NEVER MARKS EXIT OR ENTRY.
// ============================================================

// ============================================================
// CONSTANTS
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
// SECURE QR TOKEN COMPARISON
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
// CHECK VERIFIED PARENT CONSENT
// ============================================================

const hasVerifiedParentConsent = (outpass) => {
  return (
    outpass.parentDecision?.status === "APPROVED" &&
    typeof outpass.hasParentConsent === "function" &&
    outpass.hasParentConsent() === true
  );
};

// ============================================================
// CHECK FACULTY-AUTHORIZED PARENT BYPASS
//
// Parent PENDING is not automatically approved.
//
// Bypass must have:
// - Same approving faculty
// - Same approved authority role
// - Mandatory documented reason
// - Approval timestamp
// - Parent status PENDING at approval
// - Matching acknowledgement
// ============================================================

const hasValidParentBypass = (outpass) => {
  const bypass = outpass.approvalBypass;

  const acknowledgement = outpass.parentConsentAcknowledgement;

  if (
    outpass.parentDecision?.status !== "PENDING" ||
    outpass.parentDecision?.callOutcome === "REJECTED"
  ) {
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

  if (
    !sameId(bypass.performedBy, outpass.approvedByFaculty) ||
    normalize(bypass.authorityRole) !== normalize(outpass.approvedAuthorityRole)
  ) {
    return false;
  }

  const reason = String(bypass.reason || "").trim();

  if (!reason.startsWith(PARENT_BYPASS_PREFIX)) {
    return false;
  }

  const documentedReason = reason.slice(PARENT_BYPASS_PREFIX.length).trim();

  if (documentedReason.length < 10) {
    return false;
  }

  if (acknowledgement?.parentStatusAtApproval !== "PENDING") {
    return false;
  }

  if (
    !sameId(acknowledgement.acknowledgedBy, outpass.approvedByFaculty) ||
    normalize(acknowledgement.acknowledgedRole) !==
      normalize(outpass.approvedAuthorityRole) ||
    !acknowledgement.acknowledgedAt
  ) {
    return false;
  }

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

  return approvalTime === bypassTime && approvalTime === acknowledgementTime;
};

// ============================================================
// PARENT AUTHORIZATION
//
// APPROVED -> Verified parent consent.
//
// PENDING -> Audited faculty authorization bypass.
//
// REJECTED -> Absolutely blocked for new EXIT.
// ============================================================

const validateParentAuthorization = (outpass) => {
  const parentStatus = normalize(outpass.parentDecision?.status || "PENDING");

  if (
    parentStatus === "REJECTED" ||
    outpass.parentDecision?.callOutcome === "REJECTED"
  ) {
    return fail("Parent rejected this outpass. EXIT is blocked.");
  }

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
// VERIFY UNIVERSITY APPROVAL
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
// No database writes.
// ============================================================

const previewOutpass = async (outpassId, qrToken, securityGuardId, mode) => {
  // ----------------------------------------------------------
  // STEP 1: INPUT VALIDATION
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // STEP 2: VERIFY QR SIGNATURE
  // ----------------------------------------------------------

  const verification = verifyQRSignature(qrToken, now);

  if (!verification.valid) {
    return fail(verification.message || "Invalid QR signature.");
  }

  if (verification.payload?.outpassId !== String(outpassId)) {
    return fail("QR token does not belong to this outpass.");
  }

  // ----------------------------------------------------------
  // STEP 3: LOAD OUTPASS
  // ----------------------------------------------------------

  const outpass = await Outpass.findOne({
    _id: outpassId,
    isDeleted: false,
  }).select("+qrToken");

  if (!outpass) {
    return fail("Outpass not found.");
  }

  // ----------------------------------------------------------
  // STEP 4: VERIFY ORIGINAL UNIVERSITY APPROVAL
  // ----------------------------------------------------------

  const universityApproval = validateUniversityApproval(outpass);

  if (!universityApproval.success) {
    return universityApproval;
  }

  // ----------------------------------------------------------
  // STEP 5: VERIFY CURRENT QR
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // STEP 6: OFFICIAL QR DATE AND TIME
  //
  // 09:15 AM - 06:00 PM IST.
  // End time is exclusive.
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // STEP 7: CHECK SELECTED MOVEMENT
  // ----------------------------------------------------------

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

    const parentCheck = validateParentAuthorization(outpass);

    if (!parentCheck.success) {
      return parentCheck;
    }

    parentStatus = parentCheck.parentStatus;

    parentAuthorizationType = parentCheck.authorizationType;
  }

  // ==========================================================
  // ENTRY PREVIEW
  //
  // Parent's new consent isn't required
  // once EXIT was already verified.
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

    parentAuthorizationType = "ORIGINAL_EXIT_ALREADY_VERIFIED";
  }

  // ----------------------------------------------------------
  // STEP 8: POPULATE DISPLAY DETAILS
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // STEP 9: RETURN STUDENT DETAILS
  //
  // Do not call:
  // - save()
  // - updateOne()
  // - findOneAndUpdate()
  //
  // No EXIT/ENTRY is recorded here.
  // ----------------------------------------------------------

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

// ============================================================
// EXPORT
// ============================================================

module.exports = Object.freeze({
  previewOutpass,
});
