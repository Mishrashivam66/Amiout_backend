"use strict";

const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");
const Mentor = require("../../auth/models/Mentor");
const StudentMaster = require("../../academic/models/StudentMaster");

const authRepository = require("../../auth/repositories/auth.repository");

const { approvedEvent } = require("../utils/timelineHelper");
const { OUTPASS_STATUS } = require("../constants/outpassStatus");

const { createQRToken, getISTDay, getValidityWindow } = require("./qrService");

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
// COMMON HELPERS
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
//
// Includes historic records with missing IST day key.
// Approved trips count even after RETURNED.
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
// VERIFY PREVIOUS EXIT / ENTRY CYCLE
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
// FORMAT DATE FOR STUDENT EMAIL
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
// STUDENT APPROVAL EMAIL
//
// Called only AFTER database commit.
// QR readiness is based on verified parent consent.
// ============================================================

const notifyStudentByEmail = async ({ outpass, approvedRole, qrReady }) => {
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
    } catch {
      console.warn("AMIOUT dashboard email URL is invalid.");
    }
  }

  const qrHeading = qrReady
    ? "Your Digital QR Pass Is Ready"
    : "Waiting for Parent Consent";

  const qrDescription = qrReady
    ? "Log in to your AMIOUT Student Dashboard to view your QR code."
    : "Faculty approval is recorded. Your QR will be issued only after verified parent consent.";

  const nextAction = qrReady
    ? "Present your QR at the Security Gate for EXIT verification."
    : "Please wait for valid parent consent and QR issuance before attempting to leave campus.";

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
          Faculty Approval Recorded
        </h2>

        <p>Dear ${studentName},</p>

        <p>
          Your outpass request has been approved
          by the authorized university faculty.
        </p>

        <div style="
          padding:16px;
          background:#e9f8f1;
          border:1px solid #b9e8cf;
          border-radius:8px;
          margin:20px 0;
        ">
          <strong style="color:#087f5b;">
            ${qrHeading}
          </strong>

          <p style="margin-bottom:0;">
            ${qrDescription}
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

        <p>${nextAction}</p>

        <p style="
          font-size:13px;
          color:#687787;
        ">
          Your QR code is available only within
          the permitted verification time window.
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
    subject: `AMIOUT - Faculty Approval (${outpass.outpassId})`,
    html,
  });

  console.log("AMIOUT student approval email accepted:", outpass.outpassId);

  return {
    sent: true,
  };
};

// ============================================================
// MAIN APPROVAL SERVICE
//
// MENTOR -> COORDINATOR -> HOD -> HOI
//
// RULE:
// Parent PENDING  -> Faculty approval allowed, NO QR
// Parent APPROVED -> QR only if consent verified
// Parent REJECTED -> Faculty approval blocked
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
      // Transaction retry safety.
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
      // STEP 4: PARENT DECISION
      //
      // Parent PENDING is allowed for faculty approval.
      // Parent REJECTED is NEVER overridden.
      // ======================================================

      const parentStatus = outpass.parentDecision?.status || "PENDING";

      if (!["PENDING", "APPROVED", "REJECTED"].includes(parentStatus)) {
        errorMessage = "Invalid parent decision status.";
        return;
      }

      if (parentStatus === "REJECTED") {
        errorMessage =
          "Parent has rejected this outpass. " + "Approval is blocked.";
        return;
      }

      // Status APPROVED alone is not sufficient.
      // Verify actual SMS or audited phone consent.

      const parentConsentVerified = outpass.hasParentConsent();

      // ======================================================
      // STEP 5: FACULTY ACCOUNT AUTHORIZATION
      // ======================================================

      const faculty = await Mentor.findById(facultyId).session(session);

      if (!isFacultyAuthorized(faculty, outpass.assignedRole, now)) {
        errorMessage =
          "Faculty is unavailable or does not " +
          "have an active authorized role.";
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
      // STEP 7: ACADEMIC DETAILS
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
        errorMessage = "Student institute or program " + "mapping mismatch.";
        return;
      }

      // ======================================================
      // STEP 8: CURRENT AUTHORITY
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
      // STEP 9: MATCH AUTHORIZED FACULTY
      // ======================================================

      if (!sameId(authorityResult.faculty?._id, facultyId)) {
        errorMessage =
          "This faculty is no longer the " +
          "current authorized authority. " +
          "Request reassignment is required.";
        return;
      }

      // ======================================================
      // STEP 10: CHECK ROLE LEVEL
      // ======================================================

      if (authorityResult.assignedRole !== outpass.assignedRole) {
        errorMessage =
          "Approval authority has changed. " +
          "Refresh and reassign this outpass.";
        return;
      }

      // ======================================================
      // STEP 11: DAILY OUTPASS LIMIT (IST)
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
          "Complete EXIT and ENTRY of " +
          "the first trip before second approval.";
        return;
      }

      // ======================================================
      // STEP 12: CONDITIONAL QR GENERATION
      //
      // Parent PENDING:
      //   Record faculty approval only.
      //
      // Valid parent consent:
      //   Generate signed QR.
      //
      // This prevents premature QR issuance.
      // ======================================================

      let validityWindow;

      try {
        validityWindow = getValidityWindow(outpass.outDate);
      } catch (error) {
        errorMessage = error.message || "Invalid outpass QR validity window.";
        return;
      }

      if (now >= validityWindow.expiresAt) {
        errorMessage = "The outpass QR validity " + "window has expired.";
        return;
      }

      let qr = null;

      if (parentConsentVerified) {
        try {
          qr = createQRToken(outpass, now);
        } catch (error) {
          errorMessage = error.message || "Unable to generate QR token.";
          return;
        }
      }

      // ======================================================
      // STEP 13: ATOMIC FILTER
      //
      // Parent consent state must not change
      // silently during faculty approval.
      // ======================================================

      const filter = {
        _id: outpass._id,
        status: OUTPASS_STATUS.PENDING,
        isDeleted: false,
        assignedFaculty: facultyId,
        assignedRole: outpass.assignedRole,
        "parentDecision.status": parentStatus,
        qrGenerated: false,
        dailyTripNumber: null,
      };

      if (parentStatus === "PENDING") {
        filter["parentDecision.decidedAt"] = null;
      } else {
        filter["parentDecision.decidedAt"] = outpass.parentDecision.decidedAt;

        filter["parentDecision.method"] = outpass.parentDecision.method;

        if (outpass.parentDecision.method === "SMS_LINK") {
          filter["parentDecision.tokenUsedAt"] =
            outpass.parentDecision.tokenUsedAt;
        } else if (outpass.parentDecision.method === "PHONE_CALL") {
          filter["parentDecision.callVerifiedAt"] =
            outpass.parentDecision.callVerifiedAt;

          filter["parentDecision.callOutcome"] =
            outpass.parentDecision.callOutcome;
        }
      }

      // ======================================================
      // PARENT ACKNOWLEDGEMENT AUDIT
      //
      // This is an audit record,
      // NOT parent approval.
      // ======================================================

      const parentAcknowledgement = {
        parentStatusAtApproval: parentStatus,

        acknowledgedBy: facultyId,

        acknowledgedRole: outpass.assignedRole,

        remark: parentConsentVerified
          ? "Parent consent verified before faculty decision."
          : "Faculty decision recorded; valid parent consent still required for QR.",

        acknowledgedAt: now,
      };

      // ======================================================
      // STEP 14: ATOMIC FACULTY APPROVAL
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

            parentConsentAcknowledgement: parentAcknowledgement,

            outpassDayIST: dayKey,

            dailyTripNumber: tripNumber,

            // QR generated only with
            // real verified parent consent.

            qrGenerated: Boolean(qr),

            qrGeneratedAt: qr?.qrGeneratedAt || null,

            qrToken: qr?.token || null,

            qrValidFrom: qr?.qrValidFrom || null,

            qrExpiresAt: qr?.qrExpiresAt || null,

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

  // Parent consent must actually be verified
  // before calling QR ready.

  const qrReady =
    updatedOutpass.qrGenerated === true && updatedOutpass.hasParentConsent();

  // ============================================================
  // STEP 16: STUDENT WEBSITE NOTIFICATION
  // ============================================================

  try {
    await sendNotification({
      title: "Outpass Approved",

      message: qrReady
        ? "Faculty and parent approvals are complete. Your digital QR pass is ready."
        : "Faculty approval recorded. Your QR will be issued after valid parent consent.",

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
  // STEP 17: STUDENT EMAIL
  // ============================================================

  try {
    await notifyStudentByEmail({
      outpass: updatedOutpass,

      approvedRole: updatedOutpass.approvedAuthorityRole,

      qrReady,
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
    if (qrReady && updatedOutpass.parentEmail?.trim()) {
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

    message: qrReady
      ? "Faculty approval recorded. Digital QR pass is ready."
      : "Faculty approval recorded. Awaiting verified parent consent before QR issuance.",

    data: updatedOutpass,
  };
};

// ============================================================
// EXPORT
// ============================================================

module.exports = Object.freeze({
  approveOutpass,
});
