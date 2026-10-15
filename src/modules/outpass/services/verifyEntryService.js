"use strict";

const crypto = require("node:crypto");
const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");

const { OUTPASS_STATUS } = require("../constants/outpassStatus");

const { verifyQRSignature } = require("./qrService");

const { outpassDTO } = require("../dtos/outpass.dto");

const { createActivity } = require("../../student/services/activityService");

// ============================================================
// HELPERS
// ============================================================

const fail = (message) => ({
  success: false,
  message,
});

const tokensMatch = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const first = crypto.createHash("sha256").update(a).digest();

  const second = crypto.createHash("sha256").update(b).digest();

  return crypto.timingSafeEqual(first, second);
};

// ============================================================
// SECURITY QR TIME WINDOW
// 09:15 AM - 05:15 PM IST
// ============================================================

const getISTMinutes = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return get("hour") * 60 + get("minute");
};

const isWithinGateWindow = (date = new Date()) => {
  const minutes = getISTMinutes(date);

  return minutes >= 9 * 60 + 15 && minutes < 17 * 60 + 15;
};

// ============================================================
// MASK PARENT MOBILE NUMBER
// Security dashboard should not expose full number.
// ============================================================

const maskMobile = (mobile) => {
  if (!mobile) return null;

  const value = String(mobile).trim();

  if (value.length < 4) {
    return "****";
  }

  return "*".repeat(value.length - 4) + value.slice(-4);
};

// ============================================================
// GET VERIFIED RESPONSE DATA
// ============================================================

const buildSecurityResponse = (outpass) => {
  const dto = outpassDTO(outpass) || {};

  const parent = dto.parent || {};

  return {
    ...dto,

    // --------------------------------------------------------
    // STUDENT DETAILS
    // --------------------------------------------------------

    studentName: outpass.studentName || null,

    enrollmentNumber: outpass.enrollmentNumber || null,

    branch: outpass.branch || null,

    course: outpass.course || null,

    semester: outpass.semester ?? null,

    section: outpass.section || null,

    group: outpass.group || null,

    // --------------------------------------------------------
    // PARENT DETAILS
    // --------------------------------------------------------

    parent: {
      ...parent,

      name: outpass.parentName || null,

      mobileNumber: maskMobile(outpass.parentMobileNumber),
    },

    parentDecision: {
      status: outpass.parentDecision?.status || "PENDING",

      method: outpass.parentDecision?.method || null,

      decidedAt: outpass.parentDecision?.decidedAt || null,
    },

    // --------------------------------------------------------
    // ACTUAL APPROVING FACULTY
    // approvedByFaculty is populated before calling this.
    // Never substitute assigned mentor as approver.
    // --------------------------------------------------------

    facultyApproval: {
      status:
        outpass.approvedByFaculty && outpass.approvedAt
          ? "APPROVED"
          : "PENDING",

      approvedBy: dto.approvedByFaculty || null,

      approvedAuthorityRole: outpass.approvedAuthorityRole || null,

      approvedAt: outpass.approvedAt || null,

      remark: outpass.approvalRemark || "",
    },

    // --------------------------------------------------------
    // OUTPASS DETAILS
    // --------------------------------------------------------

    outpassId: outpass.outpassId,

    status: outpass.status,

    destination: outpass.destination || null,

    reason: outpass.reason || null,

    outDate: outpass.outDate,

    outTime: outpass.outTime,

    inTime: outpass.inTime ?? null,

    // --------------------------------------------------------
    // GATE MOVEMENT DETAILS
    // --------------------------------------------------------

    exitVerified: outpass.exitVerified === true,

    exitVerifiedAt: outpass.exitVerifiedAt || null,

    entryVerified: outpass.entryVerified === true,

    entryVerifiedAt: outpass.entryVerifiedAt || null,
  };
};

// ============================================================
// VERIFY STUDENT ENTRY
// ============================================================

const verifyEntry = async (outpassId, qrToken, securityGuardId) => {
  // ==========================================================
  // 1. VALIDATE IDENTIFIERS
  // ==========================================================

  if (
    !mongoose.isValidObjectId(outpassId) ||
    !mongoose.isValidObjectId(securityGuardId)
  ) {
    return fail("Invalid outpass or security guard ID.");
  }

  if (typeof qrToken !== "string" || !qrToken.trim()) {
    return fail("QR token is required. Scan the student QR.");
  }

  const now = new Date();

  // ==========================================================
  // 2. VERIFY SECURITY GATE WINDOW
  // ==========================================================

  if (!isWithinGateWindow(now)) {
    return fail(
      "QR verification is permitted only between 09:15 AM and 05:15 PM IST.",
    );
  }

  // ==========================================================
  // 3. VERIFY SIGNED QR
  // ==========================================================

  const verification = verifyQRSignature(qrToken, now);

  if (!verification.valid) {
    return fail(verification.message || "Invalid QR signature.");
  }

  if (verification.payload.outpassId !== String(outpassId)) {
    return fail("QR token does not belong to this outpass.");
  }

  // ==========================================================
  // 4. FETCH OUTPASS WITH SECURE TOKEN
  // ==========================================================

  const outpass = await Outpass.findOne({
    _id: outpassId,
    isDeleted: false,
  }).select("+qrToken");

  if (!outpass) {
    return fail("Outpass not found.");
  }

  // ==========================================================
  // 5. ENTRY REQUIRES COMPLETED EXIT
  // ==========================================================

  if (outpass.status !== OUTPASS_STATUS.EXITED) {
    return fail("Student must have a verified EXIT before ENTRY.");
  }

  if (outpass.exitVerified !== true || !outpass.exitVerifiedAt) {
    return fail("Verified EXIT record is missing.");
  }

  // ==========================================================
  // 6. PREVENT DUPLICATE ENTRY
  // ==========================================================

  if (outpass.entryVerified === true || outpass.entryVerifiedAt) {
    return fail("ENTRY is already verified.");
  }

  // ==========================================================
  // 7. VERIFY STORED QR
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
  // 8. CHECK QR VALIDITY
  // ==========================================================

  if (
    !outpass.qrValidFrom ||
    !outpass.qrExpiresAt ||
    now < outpass.qrValidFrom ||
    now >= outpass.qrExpiresAt
  ) {
    return fail("QR pass is outside its permitted time window.");
  }

  // ==========================================================
  // 9. ENTRY MUST FOLLOW EXIT TIME
  // ==========================================================

  if (now <= new Date(outpass.exitVerifiedAt)) {
    return fail("ENTRY time must be later than EXIT time.");
  }

  // ==========================================================
  // 10. GET RETURNED STATUS
  // ==========================================================

  const returnedStatus = OUTPASS_STATUS.RETURNED || OUTPASS_STATUS.COMPLETED;

  if (!returnedStatus) {
    return fail("RETURNED or COMPLETED status is not configured.");
  }

  // ==========================================================
  // 11. ATOMIC ENTRY VERIFICATION
  // ==========================================================

  const updatedOutpass = await Outpass.findOneAndUpdate(
    {
      _id: outpass._id,

      isDeleted: false,

      status: OUTPASS_STATUS.EXITED,

      exitVerified: true,

      exitVerifiedAt: {
        $lt: now,
      },

      entryVerified: false,

      entryVerifiedAt: null,

      qrGenerated: true,

      qrToken,

      qrRevokedAt: null,

      qrValidFrom: {
        $lte: now,
      },

      qrExpiresAt: {
        $gt: now,
      },
    },
    {
      $set: {
        status: returnedStatus,

        entryVerified: true,

        entryVerifiedAt: now,

        entryVerifiedBy: securityGuardId,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updatedOutpass) {
    return fail(
      "ENTRY verification failed. Pass state changed or it was already scanned.",
    );
  }

  // ==========================================================
  // 12. STUDENT ACTIVITY
  // ==========================================================

  try {
    await createActivity({
      user: updatedOutpass.student,

      title: "Entry Verified",

      description:
        `Outpass ${updatedOutpass.outpassId} ` +
        "ENTRY verified by campus security.",

      type: "ENTRY_VERIFIED",

      outpass: updatedOutpass._id,

      icon: "shield-check",

      color: "green",
    });
  } catch (error) {
    console.error("ENTRY activity error:", error.message);
  }

  // ==========================================================
  // 13. POPULATE ACTUAL APPROVING FACULTY
  // ==========================================================

  const detailedOutpass = await Outpass.findById(updatedOutpass._id)
    .populate({
      path: "approvedByFaculty",
      select: "name designation email",
    })
    .lean();

  // If the follow-up read fails to find the record,
  // retain a successful movement response.
  const responseOutpass = detailedOutpass || updatedOutpass;

  // ==========================================================
  // 14. SUCCESS RESPONSE
  // ==========================================================

  return {
    success: true,

    message: "Student ENTRY verified successfully.",

    data: buildSecurityResponse(responseOutpass),
  };
};

// ============================================================
// EXPORT
// ============================================================

module.exports = Object.freeze({
  verifyEntry,
});
