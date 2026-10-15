"use strict";

const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");
const Mentor = require("../../auth/models/Mentor");
const StudentMaster = require("../../academic/models/StudentMaster");

const { approvedEvent } = require("../utils/timelineHelper");
const { OUTPASS_STATUS } = require("../constants/outpassStatus");

const { createQRToken, getISTDay } = require("./qrService");

const { resolveOutpassAuthority } = require("./outpassEscalationService");

const {
  sendNotification,
} = require("../../notification/service/notificationService");

const {
  NOTIFICATION_TYPES,
} = require("../../../shared/types/notificationTypes");

const {
  NOTIFICATION_ROLES,
} = require("../../notification/constants/notificationConstants");

const { sendEmail } = require("../../auth/utils/email");

const outpassApprovedTemplate = require("../templates/outpassApprovedTemplate");

// ============================================================
// CONSTANTS
// ============================================================

const ALLOWED_APPROVAL_ROLES = new Set([
  "MENTOR",
  "BACKUP_MENTOR",
  "COORDINATOR",
  "HOD",
  "HOI",
]);

const ROLE_HIERARCHY = Object.freeze({
  MENTOR: "MENTOR",
  BACKUP_MENTOR: "MENTOR",
  COORDINATOR: "COORDINATOR",
  HOD: "HOD",
  HOI: "HOI",
});

// ============================================================
// HELPERS
// ============================================================

const failure = (message) => ({
  success: false,
  message,
});

const getId = (value) => String(value?._id || value || "");

const sameId = (a, b) => Boolean(getId(a)) && getId(a) === getId(b);

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const equalNumber = (a, b) => Number(a) === Number(b);

const isFacultyAuthorized = (faculty, assignedRole, now) => {
  if (
    !faculty ||
    faculty.isActive !== true ||
    faculty.isVerified !== true ||
    faculty.availabilityStatus !== "AVAILABLE"
  ) {
    return false;
  }

  const requiredRole = ROLE_HIERARCHY[assignedRole];

  if (!requiredRole) {
    return false;
  }

  if (!faculty.hasRole(requiredRole)) {
    return false;
  }

  const expectedScopeType = {
    MENTOR: "GROUP",
    COORDINATOR: "SECTION",
    HOD: "DEPARTMENT",
    HOI: "INSTITUTE",
  }[requiredRole];

  return faculty
    .getActiveRoleAssignments(now)
    .some(
      (assignment) =>
        assignment.role === requiredRole &&
        assignment.scopeType === expectedScopeType,
    );
};

// ============================================================
// IST DATE RANGE
// ============================================================

const getISTDateRange = (date) => {
  const dayKey = getISTDay(date);

  if (typeof dayKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return null;
  }

  const start = new Date(`${dayKey}T00:00:00+05:30`);

  if (Number.isNaN(start.getTime())) {
    return null;
  }

  return {
    dayKey,
    start,
    end: new Date(start.getTime() + 86400000),
  };
};

// ============================================================
// PREVIOUS APPROVED OUTPASSES
//
// Includes historic records with outpassDayIST missing.
// An approved/used trip continues to count even after
// the student returns to campus.
// ============================================================

const getPreviousApprovedTrips = async ({
  studentId,
  currentOutpassId,
  dayKey,
  dayStart,
  dayEnd,
  session,
}) => {
  return Outpass.find({
    student: studentId,

    _id: {
      $ne: currentOutpassId,
    },

    isDeleted: false,

    $and: [
      {
        $or: [
          {
            outpassDayIST: dayKey,
          },
          {
            outDate: {
              $gte: dayStart,
              $lt: dayEnd,
            },
            $or: [
              { outpassDayIST: "" },
              { outpassDayIST: null },
              {
                outpassDayIST: {
                  $exists: false,
                },
              },
            ],
          },
        ],
      },
      {
        $or: [
          {
            approvedAt: {
              $type: "date",
            },
          },
          {
            dailyTripNumber: {
              $in: [1, 2],
            },
          },
          {
            exitVerified: true,
          },
        ],
      },
    ],
  })
    .select(
      "_id approvedAt dailyTripNumber " +
        "exitVerified entryVerified " +
        "exitVerifiedAt entryVerifiedAt",
    )
    .sort({
      approvedAt: 1,
    })
    .session(session);
};

// ============================================================
// CHECK COMPLETED EXIT / ENTRY CYCLE
// ============================================================

const isTripCycleCompleted = (trip) => {
  if (
    trip.exitVerified !== true ||
    trip.entryVerified !== true ||
    !trip.exitVerifiedAt ||
    !trip.entryVerifiedAt
  ) {
    return false;
  }

  const exitTime = new Date(trip.exitVerifiedAt).getTime();

  const entryTime = new Date(trip.entryVerifiedAt).getTime();

  return (
    Number.isFinite(exitTime) &&
    Number.isFinite(entryTime) &&
    entryTime > exitTime
  );
};

// ============================================================
// MAIN APPROVAL SERVICE
// Supports:
// MENTOR -> BACKUP_MENTOR -> COORDINATOR -> HOD -> HOI
// ============================================================

const approveOutpass = async (facultyId, outpassId, remark = "") => {
  // ==========================================================
  // STEP 1 - VALIDATE INPUT
  // ==========================================================

  if (
    !mongoose.isValidObjectId(facultyId) ||
    !mongoose.isValidObjectId(outpassId)
  ) {
    return failure("Invalid faculty or outpass ID.");
  }

  const cleanRemark = typeof remark === "string" ? remark.trim() : "";

  if (cleanRemark.length > 500) {
    return failure("Remark cannot exceed 500 characters.");
  }

  const session = await mongoose.startSession();

  let approvedId = null;
  let errorMessage = null;

  try {
    await session.withTransaction(async () => {
      // Reset on transaction retry.
      approvedId = null;
      errorMessage = null;

      const now = new Date();

      // ======================================================
      // STEP 2 - LOAD OUTPASS
      // ======================================================

      const outpass = await Outpass.findOne({
        _id: outpassId,
        isDeleted: false,
      }).session(session);

      if (!outpass) {
        errorMessage = "Outpass not found.";
        return;
      }

      if (outpass.status !== OUTPASS_STATUS.PENDING) {
        errorMessage = "Only pending outpasses can be approved.";
        return;
      }

      // ======================================================
      // STEP 3 - CHECK ASSIGNED FACULTY AND ROLE
      // ======================================================

      if (!ALLOWED_APPROVAL_ROLES.has(outpass.assignedRole)) {
        errorMessage = "Invalid assigned approval authority.";
        return;
      }

      if (!sameId(outpass.assignedFaculty, facultyId)) {
        errorMessage = "This outpass is not assigned to your account.";
        return;
      }

      // ======================================================
      // STEP 4 - PARENT APPROVAL
      // ======================================================

      if (outpass.isParentRejected()) {
        errorMessage = "Parent has rejected this outpass.";
        return;
      }

      if (!outpass.hasParentConsent()) {
        errorMessage = "Verified parent consent is required before approval.";
        return;
      }

      // ======================================================
      // STEP 5 - FACULTY ACCOUNT
      // ======================================================

      const faculty = await Mentor.findById(facultyId).session(session);

      if (!isFacultyAuthorized(faculty, outpass.assignedRole, now)) {
        errorMessage =
          "Faculty is unavailable or does not have an active authorized role.";
        return;
      }

      // ======================================================
      // STEP 6 - STUDENT MASTER
      // ======================================================

      const studentMaster = await StudentMaster.findOne({
        enrollmentNumber: normalize(outpass.enrollmentNumber),
        isActive: true,
        isDeleted: false,
      }).session(session);

      if (!studentMaster) {
        errorMessage = "Active StudentMaster record not found.";
        return;
      }

      // ======================================================
      // STEP 7 - VALIDATE STUDENT SNAPSHOT
      // ======================================================

      if (
        !equalNumber(studentMaster.semester, outpass.semester) ||
        normalize(studentMaster.section) !== normalize(outpass.section) ||
        normalize(studentMaster.group) !== normalize(outpass.group)
      ) {
        errorMessage =
          "Student academic details changed. Reassignment required.";
        return;
      }

      if (
        (outpass.academicInstitute &&
          !sameId(studentMaster.institute, outpass.academicInstitute)) ||
        (outpass.academicProgram &&
          !sameId(studentMaster.program, outpass.academicProgram))
      ) {
        errorMessage = "Student institute or program mapping mismatch.";
        return;
      }

      // ======================================================
      // STEP 8 - RESOLVE CURRENT APPROVAL AUTHORITY
      //
      // This re-checks:
      // - Primary Mentor availability
      // - Backup Mentor availability
      // - Coordinator availability and SECTION scope
      // - HOD availability and DEPARTMENT scope
      // - HOI availability and INSTITUTE scope
      //
      // Important: Resolve inside approval flow.
      // A higher authority cannot bypass an available
      // lower authority.
      // ======================================================

      const authorityResult = await resolveOutpassAuthority({
        studentMaster,
        now,
      });

      if (!authorityResult.success) {
        errorMessage =
          authorityResult.message || "Unable to verify approval hierarchy.";
        return;
      }

      // ======================================================
      // STEP 9 - VERIFY CORRECT FACULTY
      // ======================================================

      if (!sameId(authorityResult.faculty?._id, facultyId)) {
        errorMessage =
          "This faculty is no longer the current authorized authority. Request reassignment is required.";
        return;
      }

      // ======================================================
      // STEP 10 - VERIFY CORRECT AUTHORITY LEVEL
      // ======================================================

      if (authorityResult.assignedRole !== outpass.assignedRole) {
        errorMessage =
          "Approval authority has changed. Refresh and reassign this outpass.";
        return;
      }

      // ======================================================
      // STEP 11 - CHECK DAILY IST OUTPASS LIMIT
      // ======================================================

      const dateRange = getISTDateRange(outpass.outDate);

      if (!dateRange) {
        errorMessage = "Invalid outpass date.";
        return;
      }

      const { dayKey, start: dayStart, end: dayEnd } = dateRange;

      const previousApproved = await getPreviousApprovedTrips({
        studentId: outpass.student,
        currentOutpassId: outpass._id,
        dayKey,
        dayStart,
        dayEnd,
        session,
      });

      if (previousApproved.length >= 2) {
        errorMessage = "Maximum 2 approved outpasses allowed per IST day.";
        return;
      }

      const tripNumber = previousApproved.length + 1;

      if (tripNumber === 2 && !previousApproved.every(isTripCycleCompleted)) {
        errorMessage =
          "Complete EXIT and ENTRY of the first trip before second approval.";
        return;
      }

      // ======================================================
      // STEP 12 - GENERATE SECURE QR TOKEN
      // ======================================================

      let qr;

      try {
        qr = createQRToken(outpass, now);
      } catch (error) {
        errorMessage = error.message || "Unable to generate QR token.";
        return;
      }

      // ======================================================
      // STEP 13 - PARENT CONSENT CONDITIONAL FILTER
      // ======================================================

      const parentDecision = outpass.parentDecision;

      const filter = {
        _id: outpass._id,

        status: OUTPASS_STATUS.PENDING,

        isDeleted: false,

        assignedFaculty: facultyId,

        assignedRole: outpass.assignedRole,

        "parentDecision.status": "APPROVED",

        "parentDecision.method": parentDecision.method,

        "parentDecision.decidedAt": parentDecision.decidedAt,

        qrGenerated: false,

        dailyTripNumber: null,
      };

      if (parentDecision.method === "SMS_LINK") {
        filter["parentDecision.tokenUsedAt"] = parentDecision.tokenUsedAt;
      } else if (parentDecision.method === "PHONE_CALL") {
        filter["parentDecision.callOutcome"] = "CONSENT";

        filter["parentDecision.verifiedByFaculty"] =
          parentDecision.verifiedByFaculty;

        filter["parentDecision.verifiedByRole"] = parentDecision.verifiedByRole;

        filter["parentDecision.callVerifiedAt"] = parentDecision.callVerifiedAt;
      } else {
        errorMessage = "Invalid parent approval method.";
        return;
      }

      // ======================================================
      // STEP 14 - ATOMIC APPROVAL
      // ======================================================

      const approved = await Outpass.findOneAndUpdate(
        filter,

        {
          $set: {
            // Outpass approval
            status: OUTPASS_STATUS.APPROVED,

            approvedByFaculty: facultyId,

            approvedAuthorityRole: outpass.assignedRole,

            approvedAt: now,

            approvalRemark: cleanRemark,

            // Daily quota
            outpassDayIST: dayKey,

            dailyTripNumber: tripNumber,

            // Secure QR
            qrGenerated: true,

            qrGeneratedAt: qr.qrGeneratedAt,

            qrToken: qr.token,

            qrValidFrom: qr.qrValidFrom,

            qrExpiresAt: qr.qrExpiresAt,

            qrRevokedAt: null,
          },

          $push: {
            timeline: approvedEvent(facultyId, cleanRemark),
          },
        },

        {
          new: true,
          runValidators: true,
          session,
        },
      );

      if (!approved) {
        errorMessage = "Outpass changed during approval. Refresh and retry.";
        return;
      }

      approvedId = approved._id;
    });
  } catch (error) {
    if (
      error.code === 11000 ||
      error.code === 112 ||
      error.hasErrorLabel?.("TransientTransactionError")
    ) {
      return failure("Another approval was processed. Refresh and retry.");
    }

    console.error("Approve Outpass Error:", error);

    throw error;
  } finally {
    await session.endSession();
  }

  // ============================================================
  // STEP 15 - VERIFY COMMITTED APPROVAL
  // ============================================================

  if (!approvedId) {
    return failure(errorMessage || "Outpass approval failed.");
  }

  const updatedOutpass = await Outpass.findById(approvedId);

  if (!updatedOutpass) {
    return failure("Approved outpass could not be retrieved.");
  }

  // ============================================================
  // STEP 16 - STUDENT NOTIFICATION
  // ============================================================

  try {
    await sendNotification({
      title: "Outpass Approved",

      message:
        "Your outpass has been approved. " + "Your digital QR pass is ready.",

      type: NOTIFICATION_TYPES.OUTPASS_APPROVED,

      sender: facultyId,

      receiver: updatedOutpass.student,

      role: NOTIFICATION_ROLES.STUDENT,

      relatedOutpass: updatedOutpass._id,
    });
  } catch (error) {
    console.error("Outpass Notification Error:", error.message);
  }

  // ============================================================
  // STEP 17 - OPTIONAL PARENT EMAIL
  // ============================================================

  try {
    if (updatedOutpass.parentEmail?.trim()) {
      const html = outpassApprovedTemplate({
        parentName: updatedOutpass.parentName,

        studentName: updatedOutpass.studentName,

        outpassId: updatedOutpass.outpassId,

        destination: updatedOutpass.destination,

        outDate: updatedOutpass.outDate,

        outTime: updatedOutpass.outTime,

        expectedReturn: updatedOutpass.expectedReturn,
      });

      await sendEmail({
        to: updatedOutpass.parentEmail.trim(),

        subject: "AMIOUT - Outpass Approved",

        html,
      });
    }
  } catch (error) {
    console.error("Parent Approval Email Error:", error.message);
  }

  // ============================================================
  // STEP 18 - SUCCESS
  // ============================================================

  return {
    success: true,

    message: "Outpass approved successfully. " + "Digital QR pass is ready.",

    data: updatedOutpass,
  };
};

module.exports = Object.freeze({
  approveOutpass,
});
