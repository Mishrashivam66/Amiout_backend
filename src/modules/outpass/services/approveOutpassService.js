"use strict";

const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");
const Mentor = require("../../auth/models/Mentor");
const StudentMaster = require("../../academic/models/StudentMaster");

const authRepository = require("../../auth/repositories/auth.repository");

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

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return replacements[char];
  });

// ============================================================
// FACULTY AUTHORIZATION
// ============================================================

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
// Includes historic records with missing IST day key.
// An approved trip counts even after student returns.
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
// VERIFY PREVIOUS EXIT + ENTRY CYCLE
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
// NEW: FORMAT OUTPASS DATE FOR STUDENT EMAIL
// ============================================================

const formatOutpassDate = (date) => {
  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
};

// ============================================================
// NEW: STUDENT APPROVAL EMAIL
// Called only after successful database commit.
// ============================================================

const notifyStudentByEmail = async ({ outpass, approvedRole }) => {
  const student = await authRepository.findUserById(outpass.student);

  if (!student) {
    console.warn("AMIOUT: Student account not found:", outpass.outpassId);

    return {
      sent: false,
      reason: "STUDENT_NOT_FOUND",
    };
  }

  const studentEmail = String(student.email || "")
    .trim()
    .toLowerCase();

  if (!studentEmail) {
    console.warn("AMIOUT: Student email missing:", outpass.outpassId);

    return {
      sent: false,
      reason: "EMAIL_NOT_FOUND",
    };
  }

  const studentName = escapeHtml(
    outpass.studentName || student.name || "Student",
  );

  const outpassId = escapeHtml(outpass.outpassId);

  const destination = escapeHtml(outpass.destination || "-");

  const outDate = escapeHtml(formatOutpassDate(outpass.outDate));

  const outTime = escapeHtml(outpass.outTime || "-");

  const expectedInTime = escapeHtml(outpass.inTime || "Not specified");

  const authority = escapeHtml(
    approvedRole === "BACKUP_MENTOR"
      ? "Backup Mentor"
      : approvedRole || "Faculty",
  );

  const dashboardURL = String(
    process.env.CLIENT_URL || process.env.FRONTEND_URL || "",
  ).trim();

  let dashboardSection = "";

  if (dashboardURL) {
    try {
      const safeURL = new URL(dashboardURL);

      if (
        safeURL.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" && safeURL.protocol === "http:")
      ) {
        const link = escapeHtml(safeURL.toString());

        dashboardSection = `
          <p style="margin:24px 0;">
            <a
              href="${link}"
              style="
                display:inline-block;
                padding:12px 20px;
                background:#087f5b;
                color:#ffffff;
                text-decoration:none;
                border-radius:8px;
                font-weight:bold;
              "
            >
              Open AMIOUT Dashboard
            </a>
          </p>
        `;
      }
    } catch (error) {
      console.warn("AMIOUT dashboard email URL is invalid.");
    }
  }

  const html = `
    <div style="
      font-family:Arial,Helvetica,sans-serif;
      max-width:620px;
      margin:0 auto;
      padding:24px;
      color:#172033;
    ">
      <div style="
        background:#0b2340;
        padding:22px;
        border-radius:12px 12px 0 0;
      ">
        <h1 style="
          margin:0;
          font-size:24px;
          color:#ffffff;
        ">
          AMIOUT
        </h1>
        <p style="
          color:#b7e4d5;
          margin:8px 0 0;
        ">
          Smart Outpass Management System
        </p>
      </div>

      <div style="
        padding:24px;
        border:1px solid #e4e9ed;
        border-radius:0 0 12px 12px;
      ">
        <h2 style="
          color:#087f5b;
          margin-top:0;
        ">
          Outpass Approved
        </h2>

        <p>Dear ${studentName},</p>

        <p>
          Your outpass request has been
          approved by the authorized
          university faculty.
        </p>

        <div style="
          padding:16px;
          background:#e9f8f1;
          border:1px solid #b9e8cf;
          border-radius:8px;
          margin:20px 0;
        ">
          <strong style="color:#087f5b;">
            Your Digital QR Pass Is Ready
          </strong>

          <p style="margin-bottom:0;">
            Log in to your AMIOUT Student
            Dashboard to view your QR code.
          </p>
        </div>

        <table style="
          width:100%;
          border-collapse:collapse;
          font-size:14px;
        ">
          <tr>
            <td style="padding:9px 0;">
              <strong>Outpass ID</strong>
            </td>
            <td>${outpassId}</td>
          </tr>

          <tr>
            <td style="padding:9px 0;">
              <strong>Destination</strong>
            </td>
            <td>${destination}</td>
          </tr>

          <tr>
            <td style="padding:9px 0;">
              <strong>Date</strong>
            </td>
            <td>${outDate}</td>
          </tr>

          <tr>
            <td style="padding:9px 0;">
              <strong>Out Time</strong>
            </td>
            <td>${outTime}</td>
          </tr>

          <tr>
            <td style="padding:9px 0;">
              <strong>Expected In Time</strong>
            </td>
            <td>${expectedInTime}</td>
          </tr>

          <tr>
            <td style="padding:9px 0;">
              <strong>Approved By</strong>
            </td>
            <td>${authority}</td>
          </tr>

          <tr>
            <td style="padding:9px 0;">
              <strong>Status</strong>
            </td>
            <td style="color:#087f5b;">
              <strong>APPROVED</strong>
            </td>
          </tr>
        </table>

        ${dashboardSection}

        <p>
          Please present your QR code to
          the Security Guard at the university
          gate for EXIT verification.
        </p>

        <p style="
          font-size:13px;
          color:#687787;
        ">
          Your QR code is available only
          within the permitted verification
          time window.
        </p>

        <p>
          Regards,<br />
          <strong>AMIOUT Team</strong>
        </p>
      </div>
    </div>
  `;

  await sendEmail({
    to: studentEmail,
    subject: `AMIOUT - Outpass Approved (${outpass.outpassId})`,
    html,
  });

  console.log("AMIOUT student approval email accepted:", outpass.outpassId);

  return {
    sent: true,
  };
};

// ============================================================
// MAIN APPROVAL SERVICE
// MENTOR -> BACKUP -> COORDINATOR -> HOD -> HOI
// ============================================================

const approveOutpass = async (facultyId, outpassId, remark = "") => {
  // ==========================================================
  // STEP 1: VALIDATE INPUT
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
      // Reset values if transaction is retried.
      approvedId = null;
      errorMessage = null;

      const now = new Date();

      // ======================================================
      // STEP 2: LOAD OUTPASS
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
      // STEP 3: CHECK ASSIGNED FACULTY
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
      // STEP 4: PARENT APPROVAL VERIFICATION
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
      // STEP 5: FACULTY ACCOUNT
      // ======================================================

      const faculty = await Mentor.findById(facultyId).session(session);

      if (!isFacultyAuthorized(faculty, outpass.assignedRole, now)) {
        errorMessage =
          "Faculty is unavailable or does not have " +
          "an active authorized role.";
        return;
      }

      // ======================================================
      // STEP 6: STUDENT MASTER
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
      // STEP 7: VERIFY ACADEMIC SNAPSHOT
      // ======================================================

      if (
        !equalNumber(studentMaster.semester, outpass.semester) ||
        normalize(studentMaster.section) !== normalize(outpass.section) ||
        normalize(studentMaster.group) !== normalize(outpass.group)
      ) {
        errorMessage =
          "Student academic details changed. " + "Reassignment required.";
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
      // STEP 8: RESOLVE CURRENT AUTHORITY
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
      // STEP 9: VERIFY AUTHORIZED FACULTY
      // ======================================================

      if (!sameId(authorityResult.faculty?._id, facultyId)) {
        errorMessage =
          "This faculty is no longer the current " +
          "authorized authority. Request " +
          "reassignment is required.";
        return;
      }

      // ======================================================
      // STEP 10: VERIFY ROLE LEVEL
      // ======================================================

      if (authorityResult.assignedRole !== outpass.assignedRole) {
        errorMessage =
          "Approval authority has changed. " +
          "Refresh and reassign this outpass.";
        return;
      }

      // ======================================================
      // STEP 11: DAILY IST OUTPASS LIMIT
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
        errorMessage = "Maximum 2 approved outpasses " + "allowed per IST day.";
        return;
      }

      const tripNumber = previousApproved.length + 1;

      if (tripNumber === 2 && !previousApproved.every(isTripCycleCompleted)) {
        errorMessage =
          "Complete EXIT and ENTRY of the " +
          "first trip before second approval.";
        return;
      }

      // ======================================================
      // STEP 12: GENERATE SECURE QR TOKEN
      // ======================================================

      let qr;

      try {
        qr = createQRToken(outpass, now);
      } catch (error) {
        errorMessage = error.message || "Unable to generate QR token.";
        return;
      }

      // ======================================================
      // STEP 13: PARENT CONSENT CONDITIONAL FILTER
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
      // STEP 14: ATOMIC OUTPASS APPROVAL
      // ======================================================

      const approved = await Outpass.findOneAndUpdate(
        filter,
        {
          $set: {
            status: OUTPASS_STATUS.APPROVED,

            approvedByFaculty: facultyId,

            approvedAuthorityRole: outpass.assignedRole,

            approvedAt: now,

            approvalRemark: cleanRemark,

            outpassDayIST: dayKey,

            dailyTripNumber: tripNumber,

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
        errorMessage =
          "Outpass changed during approval. " + "Refresh and retry.";
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
      return failure("Another approval was processed. " + "Refresh and retry.");
    }

    console.error("Approve Outpass Error:", error);

    throw error;
  } finally {
    await session.endSession();
  }

  // ============================================================
  // STEP 15: VERIFY COMMITTED APPROVAL
  // ============================================================

  if (!approvedId) {
    return failure(errorMessage || "Outpass approval failed.");
  }

  const updatedOutpass = await Outpass.findById(approvedId);

  if (!updatedOutpass) {
    return failure("Approved outpass could not be retrieved.");
  }

  // ============================================================
  // STEP 16: STUDENT WEBSITE NOTIFICATION
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
  // STEP 17: NEW - STUDENT EMAIL AFTER FACULTY APPROVAL
  // ============================================================

  try {
    await notifyStudentByEmail({
      outpass: updatedOutpass,

      approvedRole: updatedOutpass.approvedAuthorityRole,
    });
  } catch (error) {
    // Email failure does not undo faculty approval.
    console.error(
      "Student Approval Email Error:",
      updatedOutpass.outpassId,
      error.message,
    );
  }

  // ============================================================
  // STEP 18: OPTIONAL PARENT EMAIL
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
  // STEP 19: SUCCESS RESPONSE
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
