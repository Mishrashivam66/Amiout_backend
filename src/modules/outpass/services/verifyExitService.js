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
// HELPERS
// ============================================================

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
// IST GATE WINDOW: 09:15 AM TO 05:15 PM
// ============================================================

const isWithinGateWindow = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  const minutes = get("hour") * 60 + get("minute");

  return minutes >= 555 && minutes < 1035;
};

// ============================================================
// PARENT DECISION VALIDATION
//
// Parent consent is optional.
// Parent status must remain truthful.
//
// Explicit REJECTED requires a later authorized
// acknowledgement with an audit remark.
// ============================================================

const validateParentDecision = (outpass) => {
  const parentStatus = outpass.parentDecision?.status || "PENDING";

  if (!["PENDING", "APPROVED", "REJECTED"].includes(parentStatus)) {
    return fail("Invalid parent decision status.");
  }

  if (parentStatus !== "REJECTED") {
    return {
      success: true,
      status: parentStatus,
    };
  }

  const decision = outpass.parentDecision;
  const acknowledgement = outpass.parentConsentAcknowledgement;

  if (
    !decision?.decidedAt ||
    !acknowledgement ||
    acknowledgement.parentStatusAtApproval !== "REJECTED" ||
    !acknowledgement.acknowledgedBy ||
    !acknowledgement.acknowledgedRole ||
    !acknowledgement.acknowledgedAt ||
    String(acknowledgement.remark || "").trim().length < 10
  ) {
    return fail(
      "Parent rejection has not been formally " +
        "acknowledged by an authorized faculty.",
    );
  }

  if (
    !sameId(acknowledgement.acknowledgedBy, outpass.approvedByFaculty) ||
    acknowledgement.acknowledgedRole !== outpass.approvedAuthorityRole
  ) {
    return fail(
      "Parent rejection acknowledgement does not " +
        "match the approving faculty.",
    );
  }

  const parentDecisionTime = new Date(decision.decidedAt).getTime();

  const acknowledgementTime = new Date(
    acknowledgement.acknowledgedAt,
  ).getTime();

  if (
    !Number.isFinite(parentDecisionTime) ||
    !Number.isFinite(acknowledgementTime) ||
    acknowledgementTime < parentDecisionTime
  ) {
    return fail("Parent rejection requires a new faculty review.");
  }

  return {
    success: true,
    status: "REJECTED",
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
    console.error("EXIT detail population failed:", error.message);
  }

  return outpass;
};

// ============================================================
// VERIFY STUDENT EXIT
// ============================================================

const verifyExit = async (outpassId, qrToken, securityGuardId) => {
  // ==========================================================
  // STEP 1: VALIDATE INPUT
  // ==========================================================

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

  // ==========================================================
  // STEP 2: OFFICIAL GATE WINDOW
  // ==========================================================

  if (!isWithinGateWindow(now)) {
    return fail(
      "Security verification is permitted only " +
        "between 09:15 AM and 05:15 PM IST.",
    );
  }

  // ==========================================================
  // STEP 3: VERIFY QR SIGNATURE
  // ==========================================================

  const verification = verifyQRSignature(qrToken, now);

  if (!verification.valid) {
    return fail(verification.message || "Invalid QR signature.");
  }

  if (verification.payload?.outpassId !== String(outpassId)) {
    return fail("QR token does not belong to this outpass.");
  }

  // ==========================================================
  // STEP 4: LOAD OUTPASS
  // ==========================================================

  const outpass = await Outpass.findOne({
    _id: outpassId,
    isDeleted: false,
  }).select("+qrToken");

  if (!outpass) {
    return fail("Outpass not found.");
  }

  // ==========================================================
  // STEP 5: APPROVED STATUS
  // ==========================================================

  if (outpass.status !== OUTPASS_STATUS.APPROVED) {
    return fail("Only approved outpasses can be used for EXIT.");
  }

  if (outpass.exitVerified === true || outpass.exitVerifiedAt) {
    return fail("EXIT is already verified.");
  }

  // ==========================================================
  // STEP 6: UNIVERSITY APPROVAL MANDATORY
  // ==========================================================

  if (
    !outpass.approvedByFaculty ||
    !outpass.approvedAt ||
    !outpass.approvedAuthorityRole
  ) {
    return fail("Verified university approval is required before EXIT.");
  }

  // ==========================================================
  // STEP 7: PARENT DECISION
  //
  // PENDING  -> allowed
  // APPROVED -> allowed
  // REJECTED -> audited acknowledgement required
  // ==========================================================

  const parentCheck = validateParentDecision(outpass);

  if (!parentCheck.success) {
    return parentCheck;
  }

  const parentStatus = parentCheck.status;

  // ==========================================================
  // STEP 8: VERIFY STORED QR
  // ==========================================================

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

  // ==========================================================
  // STEP 9: VERIFY OFFICIAL DATE AND TIME
  // ==========================================================

  if (!isWithinQRValidityWindow(outpass.outDate, now)) {
    return fail(
      "QR verification is not allowed outside " +
        "the outpass date and 09:15 AM–05:15 PM window.",
    );
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

  // ==========================================================
  // STEP 10: FINAL VERIFICATION TIME
  // ==========================================================

  const verificationTime = new Date();

  if (
    !isWithinGateWindow(verificationTime) ||
    !isWithinQRValidityWindow(outpass.outDate, verificationTime)
  ) {
    return fail("Security gate verification window has closed.");
  }

  // ==========================================================
  // STEP 11: ATOMIC EXIT FILTER
  //
  // Prevent:
  // - double EXIT
  // - cancelled/revoked QR
  // - approval changes
  // - parent status changing between read and write
  // ==========================================================

  const filter = {
    _id: outpass._id,
    isDeleted: false,

    status: OUTPASS_STATUS.APPROVED,

    exitVerified: false,
    exitVerifiedAt: null,

    approvedByFaculty: outpass.approvedByFaculty,
    approvedAt: outpass.approvedAt,
    approvedAuthorityRole: outpass.approvedAuthorityRole,

    "parentDecision.status": parentStatus,

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

  // Capture the parent decision state read above.
  if (parentStatus === "PENDING") {
    filter["parentDecision.decidedAt"] = null;
  } else {
    filter["parentDecision.decidedAt"] = outpass.parentDecision.decidedAt;

    filter["parentDecision.method"] = outpass.parentDecision.method;
  }

  // Rejection must match the audited acknowledgement.
  if (parentStatus === "REJECTED") {
    const acknowledgement = outpass.parentConsentAcknowledgement;

    filter["parentConsentAcknowledgement.parentStatusAtApproval"] = "REJECTED";

    filter["parentConsentAcknowledgement.acknowledgedBy"] =
      acknowledgement.acknowledgedBy;

    filter["parentConsentAcknowledgement.acknowledgedRole"] =
      acknowledgement.acknowledgedRole;

    filter["parentConsentAcknowledgement.acknowledgedAt"] =
      acknowledgement.acknowledgedAt;
  }

  // ==========================================================
  // STEP 12: ATOMIC EXIT UPDATE
  // ==========================================================

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
      "EXIT verification failed. The pass may " +
        "have changed or was already scanned. " +
        "Refresh and retry.",
    );
  }

  // ==========================================================
  // STEP 13: STUDENT ACTIVITY
  // ==========================================================

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

  // ==========================================================
  // STEP 14: SECURITY RESPONSE
  // ==========================================================

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
