"use strict";

const crypto = require("node:crypto");
const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");

const { OUTPASS_STATUS } = require("../constants/outpassStatus");

const { verifyQRSignature } = require("./qrService");

const { exitVerifiedEvent } = require("../utils/timelineHelper");

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
// IST GATE WINDOW: 09:15 AM - 05:15 PM
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
// MASK PARENT MOBILE FOR SECURITY DASHBOARD
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
// ACTUAL APPROVING FACULTY
// Never substitute assigned mentor's name.
// ============================================================

const getApprovingFaculty = (outpass) => {
  const faculty = outpass?.approvedByFaculty;

  if (!faculty) return null;

  const populated =
    typeof faculty === "object" && typeof faculty.name === "string";

  return {
    id: String(faculty._id || faculty),

    name: populated ? faculty.name : null,

    designation: populated ? faculty.designation || null : null,
  };
};

// ============================================================
// BUILD SECURITY RESPONSE
// ============================================================

const buildSecurityResponse = (outpass) => {
  const dto = outpassDTO(outpass) || {};

  const faculty = getApprovingFaculty(outpass);

  const facultyStatus =
    outpass.approvedByFaculty && outpass.approvedAt ? "APPROVED" : "PENDING";

  return {
    ...dto,

    // ========================================================
    // STUDENT DETAILS
    // ========================================================

    studentName: outpass.studentName || null,

    enrollmentNumber: outpass.enrollmentNumber || null,

    branch: outpass.branch || null,

    course: outpass.course || null,

    semester: outpass.semester ?? null,

    section: outpass.section || null,

    group: outpass.group || null,

    student: {
      ...(dto.student || {}),

      name: outpass.studentName || null,

      enrollmentNumber: outpass.enrollmentNumber || null,

      branch: outpass.branch || null,

      course: outpass.course || null,

      semester: outpass.semester ?? null,

      section: outpass.section || null,

      group: outpass.group || null,
    },

    academic: {
      institute: outpass.academicInstitute?.name || null,

      program: outpass.academicProgram?.name || null,

      department: outpass.academicDepartment || null,

      batch: outpass.academicBatch || null,
    },

    // ========================================================
    // PARENT DETAILS
    // ========================================================

    parent: {
      name: outpass.parentName || null,

      mobileNumber: maskMobile(outpass.parentMobileNumber),
    },

    parentDecision: {
      status: outpass.parentDecision?.status || "PENDING",

      method: outpass.parentDecision?.method || null,

      decidedAt: outpass.parentDecision?.decidedAt || null,
    },

    // ========================================================
    // UNIVERSITY APPROVAL
    // Only the faculty who actually approved.
    // ========================================================

    facultyApproval: {
      status: facultyStatus,

      approvedBy: faculty,

      approvedAuthorityRole: outpass.approvedAuthorityRole || null,

      approvedAt: outpass.approvedAt || null,

      remark: outpass.approvalRemark || "",
    },

    approvedByFaculty: faculty,

    approvedAuthorityRole: outpass.approvedAuthorityRole || null,

    approvedAt: outpass.approvedAt || null,

    // ========================================================
    // OUTPASS DETAILS
    // ========================================================

    outpassId: outpass.outpassId,

    status: outpass.status,

    reason: outpass.reason || null,

    destination: outpass.destination || null,

    outDate: outpass.outDate || null,

    outTime: outpass.outTime || null,

    inTime: outpass.inTime ?? null,

    // ========================================================
    // QR VALIDITY
    // ========================================================

    qrGenerated: outpass.qrGenerated === true,

    qrValidFrom: outpass.qrValidFrom || null,

    qrExpiresAt: outpass.qrExpiresAt || null,

    // ========================================================
    // SECURITY MOVEMENT
    // ========================================================

    exitVerified: outpass.exitVerified === true,

    exitVerifiedAt: outpass.exitVerifiedAt || null,

    entryVerified: outpass.entryVerified === true,

    entryVerifiedAt: outpass.entryVerifiedAt || null,
  };
};

// ============================================================
// VERIFY STUDENT EXIT
// ============================================================

const verifyExit = async (outpassId, qrToken, securityGuardId) => {
  // ==========================================================
  // 1. IDENTIFIER VALIDATION
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
  // 2. GATE TIME WINDOW
  // ==========================================================

  if (!isWithinGateWindow(now)) {
    return fail(
      "QR verification is permitted only between 09:15 AM and 05:15 PM IST.",
    );
  }

  // ==========================================================
  // 3. QR SIGNATURE
  // ==========================================================

  const verification = verifyQRSignature(qrToken, now);

  if (!verification.valid) {
    return fail(verification.message || "Invalid QR signature.");
  }

  if (verification.payload.outpassId !== String(outpassId)) {
    return fail("QR token does not belong to this outpass.");
  }

  // ==========================================================
  // 4. LOAD OUTPASS
  // ==========================================================

  const outpass = await Outpass.findOne({
    _id: outpassId,
    isDeleted: false,
  }).select("+qrToken");

  if (!outpass) {
    return fail("Outpass not found.");
  }

  // ==========================================================
  // 5. APPROVED STATUS
  // ==========================================================

  if (outpass.status !== OUTPASS_STATUS.APPROVED) {
    return fail("Only approved outpasses can be used for EXIT.");
  }

  if (outpass.exitVerified === true || outpass.exitVerifiedAt) {
    return fail("EXIT is already verified.");
  }

  // ==========================================================
  // 6. STORED QR TOKEN
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
  // 7. QR VALIDITY
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
  // 8. CAPTURE VERIFICATION TIME
  // ==========================================================

  const verificationTime = new Date();

  if (!isWithinGateWindow(verificationTime)) {
    return fail("Gate verification window has closed at 05:15 PM IST.");
  }

  // ==========================================================
  // 9. ATOMIC EXIT UPDATE
  // ==========================================================

  const updatedOutpass = await Outpass.findOneAndUpdate(
    {
      _id: outpass._id,

      isDeleted: false,

      status: OUTPASS_STATUS.APPROVED,

      exitVerified: false,

      exitVerifiedAt: null,

      qrGenerated: true,

      qrToken,

      qrRevokedAt: null,

      qrValidFrom: {
        $lte: verificationTime,
      },

      qrExpiresAt: {
        $gt: verificationTime,
      },
    },
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
      "EXIT could not be verified. Pass state changed or it was already scanned.",
    );
  }

  // ==========================================================
  // 10. ACTIVITY (BEST EFFORT)
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
    console.error("EXIT activity error:", error.message);
  }

  // ==========================================================
  // 11. POPULATE ACTUAL APPROVING FACULTY
  // ==========================================================

  let detailedOutpass = updatedOutpass;

  try {
    await updatedOutpass.populate([
      {
        path: "approvedByFaculty",
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

    detailedOutpass = updatedOutpass;
  } catch (error) {
    // EXIT is already committed successfully.
    // A populate error must not trigger another EXIT attempt.
    console.error("EXIT detail population error:", error.message);
  }

  // ==========================================================
  // 12. RESPONSE
  // ==========================================================

  return {
    success: true,

    message: "Student EXIT verified successfully.",

    data: buildSecurityResponse(detailedOutpass),
  };
};

module.exports = Object.freeze({
  verifyExit,
});
