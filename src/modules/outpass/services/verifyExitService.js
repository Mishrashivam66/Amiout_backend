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
// CONSTANTS
// ============================================================

const AUTHORIZED_ROLES = new Set([
  "MENTOR",
  "BACKUP_MENTOR",
  "COORDINATOR",
  "HOD",
  "HOI",
]);

const fail = (message) => ({
  success: false,
  message,
});

const sameId = (a, b) =>
  Boolean(a && b) && String(a?._id || a) === String(b?._id || b);

const tokensMatch = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const first = crypto.createHash("sha256").update(a).digest();

  const second = crypto.createHash("sha256").update(b).digest();

  return crypto.timingSafeEqual(first, second);
};

// ============================================================
// UNIVERSITY GATE TIME
// 09:15 AM TO 06:00 PM IST
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
// PARENT AUTHORIZATION VALIDATION
//
// 1. Parent Approved:
//    Must have verified SMS or phone consent.
//
// 2. Parent Pending:
//    Must have an authorized faculty bypass
//    with matching approver, role and audit.
//
// 3. Parent Rejected:
//    Always blocked.
// ============================================================

const validateParentAuthorization = (outpass) => {
  const parentStatus = outpass.parentDecision?.status || "PENDING";

  if (
    parentStatus === "REJECTED" ||
    outpass.parentDecision?.callOutcome === "REJECTED"
  ) {
    return fail("Parent rejected this outpass. EXIT is blocked.");
  }

  if (parentStatus === "APPROVED") {
    if (!outpass.hasParentConsent()) {
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

  const bypass = outpass.approvalBypass;
  const acknowledgement = outpass.parentConsentAcknowledgement;

  const bypassValid =
    bypass?.used === true &&
    Boolean(bypass.performedBy) &&
    Boolean(bypass.authorityRole) &&
    Boolean(bypass.performedAt) &&
    typeof bypass.reason === "string" &&
    bypass.reason.startsWith("PARENT_PENDING_BYPASS:") &&
    bypass.reason.trim().length > 25 &&
    sameId(bypass.performedBy, outpass.approvedByFaculty) &&
    String(bypass.authorityRole) === String(outpass.approvedAuthorityRole) &&
    acknowledgement?.parentStatusAtApproval === "PENDING" &&
    sameId(acknowledgement.acknowledgedBy, outpass.approvedByFaculty) &&
    String(acknowledgement.acknowledgedRole) ===
      String(outpass.approvedAuthorityRole) &&
    Boolean(acknowledgement.acknowledgedAt);

  if (!bypassValid) {
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
// POPULATE SECURITY RESPONSE
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
    console.error("Security detail population failed:", error.message);
  }

  return outpass;
};

// ============================================================
// VERIFY STUDENT EXIT
// ============================================================

const verifyExit = async (outpassId, qrToken, securityGuardId) => {
  // ----------------------------------------------------------
  // STEP 1: INPUT VALIDATION
  // ----------------------------------------------------------

  if (
    !mongoose.isValidObjectId(outpassId) ||
    !mongoose.isValidObjectId(securityGuardId)
  ) {
    return fail("Invalid outpass or security guard ID.");
  }

  if (typeof qrToken !== "string" || !qrToken.trim()) {
    return fail("QR token is required.");
  }

  const now = new Date();

  // ----------------------------------------------------------
  // STEP 2: GATE WINDOW
  // ----------------------------------------------------------

  if (!isWithinGateWindow(now)) {
    return fail(
      "Security verification is allowed only between 09:15 AM and 06:00 PM IST.",
    );
  }

  // ----------------------------------------------------------
  // STEP 3: VERIFY QR SIGNATURE
  // ----------------------------------------------------------

  const verification = verifyQRSignature(qrToken, now);

  if (!verification.valid) {
    return fail(verification.message || "Invalid QR token.");
  }

  if (verification.payload?.outpassId !== String(outpassId)) {
    return fail("QR token does not belong to this outpass.");
  }

  // ----------------------------------------------------------
  // STEP 4: LOAD OUTPASS WITH PRIVATE QR TOKEN
  // ----------------------------------------------------------

  const outpass = await Outpass.findOne({
    _id: outpassId,
    isDeleted: false,
  }).select("+qrToken");

  if (!outpass) {
    return fail("Outpass not found.");
  }

  // ----------------------------------------------------------
  // STEP 5: OUTPASS APPROVAL STATUS
  // ----------------------------------------------------------

  if (outpass.status !== OUTPASS_STATUS.APPROVED) {
    return fail("Only approved outpasses can be used for EXIT.");
  }

  if (outpass.exitVerified === true || outpass.exitVerifiedAt) {
    return fail("EXIT is already verified.");
  }

  // ----------------------------------------------------------
  // STEP 6: UNIVERSITY APPROVAL
  // ----------------------------------------------------------

  const approvedRole = String(
    outpass.approvedAuthorityRole || "",
  ).toUpperCase();

  if (
    !outpass.approvedByFaculty ||
    !outpass.approvedAt ||
    !AUTHORIZED_ROLES.has(approvedRole)
  ) {
    return fail("Valid university approval is required before EXIT.");
  }

  // ----------------------------------------------------------
  // STEP 7: PARENT APPROVAL OR AUDITED BYPASS
  // ----------------------------------------------------------

  const parentCheck = validateParentAuthorization(outpass);

  if (!parentCheck.success) {
    return parentCheck;
  }

  // ----------------------------------------------------------
  // STEP 8: STORED QR CHECK
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // STEP 9: QR DATE AND VALIDITY
  // ----------------------------------------------------------

  if (!isWithinQRValidityWindow(outpass.outDate, now)) {
    return fail("QR is outside its approved date or time window.");
  }

  const { validFrom, expiresAt } = getValidityWindow(outpass.outDate);

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
    now < validFrom ||
    now >= expiresAt
  ) {
    return fail("QR pass is outside its permitted validity window.");
  }

  if (
    verification.payload.expiresAt !==
    Math.floor(savedExpiresAt.getTime() / 1000)
  ) {
    return fail("QR token expiry does not match the issued pass.");
  }

  // ----------------------------------------------------------
  // STEP 10: FINAL TIME CHECK
  // ----------------------------------------------------------

  const verificationTime = new Date();

  if (
    !isWithinGateWindow(verificationTime) ||
    !isWithinQRValidityWindow(outpass.outDate, verificationTime) ||
    verificationTime < savedValidFrom ||
    verificationTime >= savedExpiresAt
  ) {
    return fail("Security gate verification window has closed.");
  }

  // ----------------------------------------------------------
  // STEP 11: ATOMIC EXIT FILTER
  // ----------------------------------------------------------

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

  // Ensure parent state hasn't changed before EXIT.

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

  // ----------------------------------------------------------
  // STEP 12: CONFIRM EXIT ATOMICALLY
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // STEP 13: STUDENT ACTIVITY
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // STEP 14: SECURITY RESPONSE
  // ----------------------------------------------------------

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
