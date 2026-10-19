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

const { exitVerifiedEvent } = require("../utils/timelineHelper");
const { createActivity } = require("../../student/services/activityService");
const { buildSecurityResponse } = require("../utils/securityResponse");

// ============================================================
// AMIOUT ENTERPRISE - SECURITY CONFIRM EXIT
//
// Scan QR -> Student Details -> Confirm EXIT
//
// Preserves:
// - Official gate time
// - Signed QR verification
// - Verified institutional approval
// - Parent consent / documented faculty bypass
// - Explicit parent rejection protection
// - Atomic EXIT update
// - Duplicate EXIT prevention
// - Student timeline and activity
// ============================================================

const AUTHORIZED_ROLES = new Set([
  "MENTOR",
  "BACKUP_MENTOR",
  "COORDINATOR",
  "HOD",
  "HOI",
]);

const PARENT_BYPASS_PREFIX = "PARENT_PENDING_BYPASS:";

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

const tokensMatch = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const first = crypto.createHash("sha256").update(a).digest();

  const second = crypto.createHash("sha256").update(b).digest();

  return crypto.timingSafeEqual(first, second);
};

// ============================================================
// OFFICIAL GATE WINDOW: 09:15 AM - 06:00 PM IST
// ============================================================

const isWithinGateWindow = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const value = (type) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  const minutes = value("hour") * 60 + value("minute");

  return minutes >= 555 && minutes < 1080;
};

// ============================================================
// FACULTY-AUTHORIZED PARENT BYPASS
//
// Current approval format:
// approvalBypass.reason = plain text reason
// parentConsentAcknowledgement.remark = same reason
//
// Legacy prefixed reasons are also recognized.
//
// Neither a blank reason nor mismatched audit is accepted.
// ============================================================

const hasValidParentBypass = (outpass) => {
  const bypass = outpass.approvalBypass;
  const acknowledgement = outpass.parentConsentAcknowledgement;

  if (
    normalize(outpass.parentDecision?.status) !== "PENDING" ||
    normalize(outpass.parentDecision?.callOutcome) === "REJECTED"
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

  const approvedRole = normalize(outpass.approvedAuthorityRole);

  if (!AUTHORIZED_ROLES.has(approvedRole)) {
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

  if (normalize(bypass.authorityRole) !== approvedRole) {
    return false;
  }

  // Accept saved plain-text reason and legacy prefixed reason.
  const storedReason = String(bypass.reason || "").trim();

  const documentedReason = storedReason.startsWith(PARENT_BYPASS_PREFIX)
    ? storedReason.slice(PARENT_BYPASS_PREFIX.length).trim()
    : storedReason;

  if (documentedReason.length < 10 || documentedReason.length > 500) {
    return false;
  }

  if (normalize(acknowledgement?.parentStatusAtApproval) !== "PENDING") {
    return false;
  }

  if (!sameId(acknowledgement.acknowledgedBy, outpass.approvedByFaculty)) {
    return false;
  }

  if (normalize(acknowledgement.acknowledgedRole) !== approvedRole) {
    return false;
  }

  if (!acknowledgement.acknowledgedAt) {
    return false;
  }

  const acknowledgedReason = String(acknowledgement.remark || "").trim();

  if (!acknowledgedReason || acknowledgedReason !== documentedReason) {
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

  if (
    parentStatus === "REJECTED" ||
    normalize(outpass.parentDecision?.callOutcome) === "REJECTED"
  ) {
    return fail("Parent rejected this outpass. EXIT is blocked.");
  }

  if (parentStatus === "APPROVED") {
    if (
      typeof outpass.hasParentConsent !== "function" ||
      outpass.hasParentConsent() !== true
    ) {
      return fail("Verified parent consent record is incomplete.");
    }

    return {
      success: true,
      type: "PARENT_APPROVED",
      parentStatus,
    };
  }

  if (parentStatus !== "PENDING") {
    return fail("Invalid parent decision status.");
  }

  if (!hasValidParentBypass(outpass)) {
    return fail(
      "Parent approval is pending and no valid faculty-authorized bypass is recorded.",
    );
  }

  return {
    success: true,
    type: "FACULTY_AUTHORIZED_PARENT_BYPASS",
    parentStatus,
  };
};

// ============================================================
// POPULATE SECURITY DETAILS
// ============================================================

const populateSecurityDetails = async (outpass) => {
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
    console.error("Security EXIT detail population failed:", error.message);
  }

  return outpass;
};

// ============================================================
// VERIFY STUDENT EXIT
// ============================================================

const verifyExit = async (outpassId, qrToken, securityGuardId) => {
  // STEP 1: Input validation

  if (
    !mongoose.isValidObjectId(outpassId) ||
    !mongoose.isValidObjectId(securityGuardId)
  ) {
    return fail("Invalid outpass or security guard ID.");
  }

  if (typeof qrToken !== "string" || !qrToken.trim() || qrToken.length > 4096) {
    return fail("Valid QR token is required.");
  }

  const now = new Date();

  // STEP 2: Official gate window

  if (!isWithinGateWindow(now)) {
    return fail(
      "Security verification is allowed only between 09:15 AM and 06:00 PM IST.",
    );
  }

  // STEP 3: Signed QR validation

  const verification = verifyQRSignature(qrToken, now);

  if (!verification.valid) {
    return fail(verification.message || "Invalid QR token.");
  }

  if (verification.payload?.outpassId !== String(outpassId)) {
    return fail("QR token does not belong to this outpass.");
  }

  // STEP 4: Load outpass

  const outpass = await Outpass.findOne({
    _id: outpassId,
    isDeleted: false,
  }).select("+qrToken");

  if (!outpass) {
    return fail("Outpass not found.");
  }

  // STEP 5: Approval status and duplicate protection

  if (outpass.status !== OUTPASS_STATUS.APPROVED) {
    return fail("Only approved outpasses can be used for EXIT.");
  }

  if (outpass.exitVerified === true || outpass.exitVerifiedAt) {
    return fail("EXIT is already verified.");
  }

  // STEP 6: University approval

  const approvedRole = normalize(outpass.approvedAuthorityRole);

  if (
    !outpass.approvedByFaculty ||
    !outpass.approvedAt ||
    !AUTHORIZED_ROLES.has(approvedRole)
  ) {
    return fail("Valid university approval is required before EXIT.");
  }

  // STEP 7: Parent authorization

  const parentCheck = validateParentAuthorization(outpass);

  if (!parentCheck.success) {
    return parentCheck;
  }

  // STEP 8: Stored QR validation

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

  // STEP 9: QR date and validity

  if (!isWithinQRValidityWindow(outpass.outDate, now)) {
    return fail("QR is outside its approved date or time window.");
  }

  let validity;

  try {
    validity = getValidityWindow(outpass.outDate);
  } catch (error) {
    return fail("Invalid outpass QR validity window.");
  }

  const savedValidFrom = outpass.qrValidFrom
    ? new Date(outpass.qrValidFrom)
    : null;

  const savedExpiresAt = outpass.qrExpiresAt
    ? new Date(outpass.qrExpiresAt)
    : null;

  if (
    !savedValidFrom ||
    !savedExpiresAt ||
    !Number.isFinite(savedValidFrom.getTime()) ||
    !Number.isFinite(savedExpiresAt.getTime()) ||
    now < savedValidFrom ||
    now >= savedExpiresAt ||
    now < validity.validFrom ||
    now >= validity.expiresAt
  ) {
    return fail("QR pass is outside its permitted validity window.");
  }

  if (
    savedValidFrom.getTime() !== validity.validFrom.getTime() ||
    savedExpiresAt.getTime() !== validity.expiresAt.getTime()
  ) {
    return fail("QR validity does not match university policy.");
  }

  if (
    verification.payload?.expiresAt !==
    Math.floor(savedExpiresAt.getTime() / 1000)
  ) {
    return fail("QR token expiry does not match the issued pass.");
  }

  // STEP 10: Final time check

  const verificationTime = new Date();

  if (
    !isWithinGateWindow(verificationTime) ||
    !isWithinQRValidityWindow(outpass.outDate, verificationTime) ||
    verificationTime < savedValidFrom ||
    verificationTime >= savedExpiresAt
  ) {
    return fail("Security gate verification window has closed.");
  }

  // STEP 11: Atomic EXIT filter

  const filter = {
    _id: outpass._id,
    isDeleted: false,
    status: OUTPASS_STATUS.APPROVED,

    exitVerified: false,
    exitVerifiedAt: null,

    approvedByFaculty: outpass.approvedByFaculty,
    approvedAt: outpass.approvedAt,
    approvedAuthorityRole: outpass.approvedAuthorityRole,

    "parentDecision.status": parentCheck.parentStatus,
    "parentDecision.callOutcome": outpass.parentDecision?.callOutcome ?? null,

    qrGenerated: true,
    qrToken,
    qrRevokedAt: null,

    qrValidFrom: {
      $lte: verificationTime,
    },
    qrExpiresAt: {
      $gt: verificationTime,
    },
  };

  // STEP 12: Keep parent/audit state consistent
  // between QR inspection and atomic EXIT update.

  if (parentCheck.parentStatus === "PENDING") {
    filter["parentDecision.decidedAt"] = null;

    filter["approvalBypass.used"] = true;
    filter["approvalBypass.performedBy"] = outpass.approvalBypass.performedBy;
    filter["approvalBypass.authorityRole"] =
      outpass.approvalBypass.authorityRole;
    filter["approvalBypass.performedAt"] = outpass.approvalBypass.performedAt;
    filter["approvalBypass.reason"] = outpass.approvalBypass.reason;

    filter["parentConsentAcknowledgement.parentStatusAtApproval"] = "PENDING";

    filter["parentConsentAcknowledgement.acknowledgedBy"] =
      outpass.parentConsentAcknowledgement.acknowledgedBy;

    filter["parentConsentAcknowledgement.acknowledgedRole"] =
      outpass.parentConsentAcknowledgement.acknowledgedRole;

    filter["parentConsentAcknowledgement.acknowledgedAt"] =
      outpass.parentConsentAcknowledgement.acknowledgedAt;

    filter["parentConsentAcknowledgement.remark"] =
      outpass.parentConsentAcknowledgement.remark;
  } else {
    filter["parentDecision.decidedAt"] = outpass.parentDecision.decidedAt;

    filter["parentDecision.method"] = outpass.parentDecision.method;

    if (outpass.parentDecision.method === "SMS_LINK") {
      filter["parentDecision.tokenUsedAt"] = outpass.parentDecision.tokenUsedAt;
    }

    if (outpass.parentDecision.method === "PHONE_CALL") {
      filter["parentDecision.callVerifiedAt"] =
        outpass.parentDecision.callVerifiedAt;

      filter["parentDecision.callOutcome"] = "CONSENT";
    }
  }

  // STEP 13: Atomically confirm EXIT

  const updatedOutpass = await Outpass.findOneAndUpdate(
    filter,
    {
      $set: {
        status: OUTPASS_STATUS.EXITED,

        exitVerified: true,
        exitVerifiedAt: verificationTime,
        exitVerifiedBy: securityGuardId,
      },

      $push: {
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
      "EXIT verification failed. Outpass, parent decision or QR status may have changed. Refresh and retry.",
    );
  }

  // STEP 14: Student activity

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
    console.error("EXIT activity failed:", error.message);
  }

  // STEP 15: Security response

  await populateSecurityDetails(updatedOutpass);

  return {
    success: true,
    message: "Student EXIT verified successfully.",
    data: buildSecurityResponse(updatedOutpass),
  };
};

module.exports = Object.freeze({
  verifyExit,
});
