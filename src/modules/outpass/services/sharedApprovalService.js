"use strict";

const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");
const Mentor = require("../../auth/models/Mentor");
const MentorMaster = require("../../academic/models/MentorMaster");
const StudentMaster = require("../../academic/models/StudentMaster");

const { getAcademicContext } = require("./outpassEscalationService");

const { getISTDay, getValidityWindow, createQRToken } = require("./qrService");

const { OUTPASS_STATUS } = require("../constants/outpassStatus");

const { approvedEvent } = require("../utils/timelineHelper");

const {
  sendNotification,
} = require("../../notification/service/notificationService");

const {
  NOTIFICATION_TYPES,
} = require("../../../shared/types/notificationTypes");

const {
  NOTIFICATION_ROLES,
} = require("../../notification/constants/notificationConstants");

// ============================================================
// AMIOUT ENTERPRISE - SHARED FACULTY APPROVAL SERVICE
//
// Parent APPROVED:
//   Normal institutional approval. No reason mandatory.
//
// Parent PENDING:
//   Faculty-authorized bypass with mandatory audit reason.
//
// Parent REJECTED:
//   Cannot approve under any circumstances.
//
// Higher authority direct approval remains audited.
// QR, daily limits, transactions and scope checks preserved.
// ============================================================

const ROLE_SCOPES = Object.freeze({
  MENTOR: "GROUP",
  COORDINATOR: "SECTION",
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
});

const NORMAL_ROLES = ["MENTOR", "COORDINATOR", "HOD", "HOI"];

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const scopeKey = (value) => normalize(value).replace(/\s+/g, "");

const getId = (value) => String(value?._id || value || "");

const sameId = (a, b) => Boolean(getId(a)) && getId(a) === getId(b);

const fail = (message) => ({
  success: false,
  message,
});

// ============================================================
// ACTIVE ROLE AND ACADEMIC SCOPE VERIFICATION
// ============================================================

function hasScope(faculty, role, scope, now) {
  if (
    !faculty ||
    faculty.isActive !== true ||
    faculty.isVerified !== true ||
    !scope
  ) {
    return false;
  }

  if (!faculty.hasRole(role)) {
    return false;
  }

  return faculty.getActiveRoleAssignments(now).some((assignment) => {
    return (
      normalize(assignment.role) === role &&
      normalize(assignment.scopeType) === ROLE_SCOPES[role] &&
      scopeKey(assignment.scopeId) === scopeKey(scope)
    );
  });
}

// ============================================================
// CHECK FACULTY AUTHORITY
//
// Mentor:
//   Own mapped group and assigned outpass.
//
// Coordinator:
//   Authorized section.
//
// HOD:
//   Authorized department.
//
// HOI:
//   Authorized institute.
//
// Higher authorities retain existing direct approval.
// ============================================================

async function checkAuthority({
  faculty,
  role,
  outpass,
  studentMaster,
  context,
  now,
  session,
}) {
  if (!faculty || faculty.isActive !== true || faculty.isVerified !== true) {
    return false;
  }

  // ----------------------------------------------------------
  // COORDINATOR
  // ----------------------------------------------------------

  if (role === "COORDINATOR") {
    return hasScope(faculty, "COORDINATOR", context.scopes.coordinator, now);
  }

  // ----------------------------------------------------------
  // HOD
  // ----------------------------------------------------------

  if (role === "HOD") {
    return hasScope(faculty, "HOD", context.scopes.hod, now);
  }

  // ----------------------------------------------------------
  // HOI
  // ----------------------------------------------------------

  if (role === "HOI") {
    return hasScope(faculty, "HOI", context.scopes.hoi, now);
  }

  // ----------------------------------------------------------
  // MENTOR / BACKUP MENTOR
  // ----------------------------------------------------------

  if (faculty.availabilityStatus !== "AVAILABLE") {
    return false;
  }

  if (!sameId(outpass.assignedFaculty, faculty._id)) {
    return false;
  }

  if (!["MENTOR", "BACKUP_MENTOR"].includes(outpass.assignedRole)) {
    return false;
  }

  const isBackup = outpass.assignedRole === "BACKUP_MENTOR";

  const mentorMasterId = isBackup
    ? studentMaster.backupMentor
    : studentMaster.primaryMentor;

  if (!mentorMasterId) {
    return false;
  }

  const mentorMaster = await MentorMaster.findOne({
    _id: mentorMasterId,
    isActive: true,
    isDeleted: false,
    roles: "MENTOR",
  }).session(session);

  if (!mentorMaster) {
    return false;
  }

  if (!sameId(mentorMaster.mentorUser, faculty._id)) {
    return false;
  }

  if (normalize(mentorMaster.mentorEmail) !== normalize(faculty.email)) {
    return false;
  }

  // Official academic mapping validation.
  if (
    normalize(mentorMaster.section) !== normalize(studentMaster.section) ||
    Number(mentorMaster.semester) !== Number(studentMaster.semester) ||
    scopeKey(mentorMaster.institute) !== scopeKey(context.institute.code) ||
    scopeKey(mentorMaster.program) !== scopeKey(context.program.code)
  ) {
    return false;
  }

  if (
    !isBackup &&
    normalize(mentorMaster.group) !== normalize(studentMaster.group)
  ) {
    return false;
  }

  const mentorScope = [
    scopeKey(mentorMaster.institute),
    scopeKey(mentorMaster.program),
    Number(mentorMaster.semester),
    scopeKey(mentorMaster.section),
    scopeKey(mentorMaster.group),
  ].join("/");

  return hasScope(faculty, "MENTOR", mentorScope, now);
}

// ============================================================
// INSTITUTIONAL HIGHER-ROLE AUDIT
//
// These roles are NOT parent-consent bypasses.
//
// HOD/HOI direct approval may still record the
// lower institutional roles not used.
// ============================================================

function getBypassedRoles(role) {
  switch (role) {
    case "COORDINATOR":
      return ["MENTOR"];

    case "HOD":
      return ["MENTOR", "COORDINATOR"];

    case "HOI":
      return ["MENTOR", "COORDINATOR", "HOD"];

    default:
      return [];
  }
}

// ============================================================
// PREVIOUS EXIT / ENTRY CHECK
// ============================================================

function isTripCompleted(trip) {
  return (
    trip.exitVerified === true &&
    trip.entryVerified === true &&
    Boolean(trip.exitVerifiedAt) &&
    Boolean(trip.entryVerifiedAt) &&
    new Date(trip.entryVerifiedAt).getTime() >
      new Date(trip.exitVerifiedAt).getTime()
  );
}

// ============================================================
// APPROVED TRIPS FOR IST DATE
// ============================================================

async function getPreviousTrips(outpass, dayKey, session) {
  const start = new Date(`${dayKey}T00:00:00+05:30`);

  const end = new Date(start.getTime() + 86400000);

  return Outpass.find({
    student: outpass.student,

    _id: {
      $ne: outpass._id,
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
              $gte: start,
              $lt: end,
            },

            $or: [
              {
                outpassDayIST: "",
              },
              {
                outpassDayIST: null,
              },
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
    .select("exitVerified entryVerified " + "exitVerifiedAt entryVerifiedAt")
    .sort({
      approvedAt: 1,
    })
    .session(session);
}

// ============================================================
// MAIN UNIFIED APPROVAL SERVICE
//
// Trusted role comes from protected controller.
// Never accept the approval role from request body.
// ============================================================

async function approveOutpassForRole(
  facultyId,
  outpassId,
  remark = "",
  trustedRole,
) {
  const activeRole = normalize(trustedRole);

  const role = activeRole === "BACKUP_MENTOR" ? "MENTOR" : activeRole;

  // ----------------------------------------------------------
  // STEP 1: INPUT VALIDATION
  // ----------------------------------------------------------

  if (!NORMAL_ROLES.includes(role)) {
    return fail("Invalid trusted faculty role.");
  }

  if (
    !mongoose.isValidObjectId(facultyId) ||
    !mongoose.isValidObjectId(outpassId)
  ) {
    return fail("Invalid faculty or outpass ID.");
  }

  if (typeof remark !== "string" || remark.trim().length > 500) {
    return fail("Approval remark must be text of at most 500 characters.");
  }

  const reason = remark.trim();

  const session = await mongoose.startSession();

  let approvedId = null;
  let errorMessage = null;

  try {
    // --------------------------------------------------------
    // STEP 2: DATABASE TRANSACTION
    // --------------------------------------------------------

    await session.withTransaction(async () => {
      approvedId = null;
      errorMessage = null;

      const now = new Date();

      // ----------------------------------------------------
      // STEP 3: LOAD OUTPASS
      // ----------------------------------------------------

      const outpass = await Outpass.findOne({
        _id: outpassId,
        isDeleted: false,
      }).session(session);

      if (!outpass) {
        errorMessage = "Outpass not found.";
        return;
      }

      // ----------------------------------------------------
      // STEP 4: OUTPASS STATUS
      // ----------------------------------------------------

      if (outpass.status !== OUTPASS_STATUS.PENDING) {
        errorMessage = "Only pending outpasses can be approved.";
        return;
      }

      // ----------------------------------------------------
      // STEP 5: PARENT CONSENT VALIDATION
      // ----------------------------------------------------

      const parentStatus = outpass.parentDecision?.status || "PENDING";

      // Explicit parent rejection always blocks.
      if (
        parentStatus === "REJECTED" ||
        outpass.parentDecision?.callOutcome === "REJECTED"
      ) {
        errorMessage = "Parent rejected this outpass. Approval is blocked.";
        return;
      }

      if (!["APPROVED", "PENDING"].includes(parentStatus)) {
        errorMessage = "Invalid parent status.";
        return;
      }

      const verifiedConsent =
        parentStatus === "APPROVED" && outpass.hasParentConsent();

      if (parentStatus === "APPROVED" && !verifiedConsent) {
        errorMessage = "Parent approval record is not verified.";
        return;
      }

      // ====================================================
      // IMPORTANT FIX
      //
      // Parent PENDING:
      //   Requires an official written bypass reason.
      //
      // Parent APPROVED:
      //   Does not require any bypass reason.
      //
      // Higher authority institutional approvals:
      //   Recorded separately in audit metadata.
      // ====================================================

      const parentBypassed = parentStatus === "PENDING";

      const bypassedRoles = getBypassedRoles(role);

      const usedBypass = parentBypassed || bypassedRoles.length > 0;

      // FIX: Reason validation depends on
      // parent consent, not institutional role.
      if (parentBypassed && reason.length < 10) {
        errorMessage =
          "Parent-pending bypass requires a reason of at least 10 characters.";
        return;
      }

      // Automatically document normal approval
      // so direct HOD/HOI decisions remain audited.
      // Do not falsely mark the parent as pending.

      const verifiedParentNote =
        bypassedRoles.length > 0
          ? `Direct ${role} approval under authorized academic scope; parent consent verified.`
          : "Parent consent verified.";

      const approvalNote = reason || (parentBypassed ? "" : verifiedParentNote);

      // ----------------------------------------------------
      // STEP 6: FETCH FACULTY AND STUDENT
      // ----------------------------------------------------

      const [faculty, studentMaster] = await Promise.all([
        Mentor.findById(facultyId).session(session),

        StudentMaster.findOne({
          enrollmentNumber: normalize(outpass.enrollmentNumber),
          isActive: true,
          isDeleted: false,
        }).session(session),
      ]);

      if (!faculty) {
        errorMessage = "Faculty account not found.";
        return;
      }

      if (!studentMaster) {
        errorMessage = "Active StudentMaster not found.";
        return;
      }

      // ----------------------------------------------------
      // STEP 7: ACADEMIC MAPPING
      // ----------------------------------------------------

      if (
        Number(studentMaster.semester) !== Number(outpass.semester) ||
        normalize(studentMaster.section) !== normalize(outpass.section) ||
        normalize(studentMaster.group) !== normalize(outpass.group) ||
        !sameId(studentMaster.institute, outpass.academicInstitute) ||
        !sameId(studentMaster.program, outpass.academicProgram)
      ) {
        errorMessage = "Student academic mapping mismatch.";
        return;
      }

      // ----------------------------------------------------
      // STEP 8: ACADEMIC SCOPES
      // ----------------------------------------------------

      const context = await getAcademicContext(studentMaster);

      if (!context?.scopes) {
        errorMessage = "Unable to verify academic scope.";
        return;
      }

      // ----------------------------------------------------
      // STEP 9: AUTHORITY VERIFICATION
      // ----------------------------------------------------

      const authorized = await checkAuthority({
        faculty,
        role,
        outpass,
        studentMaster,
        context,
        now,
        session,
      });

      if (!authorized) {
        errorMessage = `Not authorized to approve this student's outpass as ${role}.`;
        return;
      }

      // ----------------------------------------------------
      // STEP 10: DAILY OUTPASS QUOTA
      // ----------------------------------------------------

      const dayKey = getISTDay(outpass.outDate);

      const previousTrips = await getPreviousTrips(outpass, dayKey, session);

      if (previousTrips.length >= 2) {
        errorMessage = "Maximum two approved outpasses per IST day.";
        return;
      }

      if (previousTrips.length === 1 && !isTripCompleted(previousTrips[0])) {
        errorMessage = "Previous EXIT and ENTRY must be completed first.";
        return;
      }

      const tripNumber = previousTrips.length + 1;

      // ----------------------------------------------------
      // STEP 11: QR VALIDITY & GENERATION
      // ----------------------------------------------------

      let qr;

      try {
        const validity = getValidityWindow(outpass.outDate);

        if (now >= validity.expiresAt) {
          errorMessage = "Outpass QR validity window has expired.";
          return;
        }

        // Existing signed QR mechanism preserved.
        // Parent consent is already verified OR
        // faculty-authorized pending bypass is audited.

        qr = createQRToken(outpass, now);
      } catch (error) {
        errorMessage = error.message || "Unable to generate QR.";
        return;
      }

      // ----------------------------------------------------
      // STEP 12: CURRENT ASSIGNMENT SNAPSHOT
      // ----------------------------------------------------

      const currentAssignedRole = outpass.assignedRole || null;

      // ----------------------------------------------------
      // STEP 13: ATOMIC APPROVAL FILTER
      // ----------------------------------------------------

      const filter = {
        _id: outpass._id,

        status: OUTPASS_STATUS.PENDING,

        isDeleted: false,

        "parentDecision.status": parentStatus,

        "parentDecision.callOutcome":
          outpass.parentDecision?.callOutcome ?? null,

        approvedAt: null,

        qrGenerated: false,

        dailyTripNumber: null,

        assignedFaculty: outpass.assignedFaculty || null,

        assignedRole: currentAssignedRole,
      };

      if (parentStatus === "PENDING") {
        filter["parentDecision.decidedAt"] = null;
      } else {
        filter["parentDecision.decidedAt"] = outpass.parentDecision.decidedAt;

        filter["parentDecision.method"] = outpass.parentDecision.method;
      }

      // ----------------------------------------------------
      // STEP 14: APPROVAL + AUDIT + QR
      // ----------------------------------------------------

      const approved = await Outpass.findOneAndUpdate(
        filter,
        {
          $set: {
            status: OUTPASS_STATUS.APPROVED,

            approvedByFaculty: faculty._id,

            approvedAuthorityRole: role,

            approvedAt: now,

            // Reason optional when parent
            // consent was verified.
            approvalRemark: approvalNote,

            // This field always records the
            // REAL parent status.
            parentConsentAcknowledgement: {
              parentStatusAtApproval: parentStatus,

              acknowledgedBy: faculty._id,

              acknowledgedRole: role,

              // Store original text without
              // a prefix, respecting the
              // schema's 500-character limit.
              remark: parentBypassed ? reason : "Parent consent verified.",

              acknowledgedAt: now,
            },

            // Higher institutional authority
            // actions remain audited.
            //
            // This does NOT change
            // parentDecision.status.
            approvalBypass: {
              used: usedBypass,

              performedBy: usedBypass ? faculty._id : null,

              authorityRole: usedBypass ? role : null,

              bypassedRoles,

              reason: parentBypassed ? reason : usedBypass ? approvalNote : "",

              performedAt: usedBypass ? now : null,
            },

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
            timeline: approvedEvent(
              faculty._id,

              parentBypassed
                ? `Parent bypass by ${role}. ${reason}`
                : approvalNote,
            ),
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
    // --------------------------------------------------------
    // CONCURRENT APPROVAL PROTECTION
    // --------------------------------------------------------

    if (
      error.code === 11000 ||
      error.code === 112 ||
      error.hasErrorLabel?.("TransientTransactionError")
    ) {
      return fail("Another approval was processed. Refresh and retry.");
    }

    throw error;
  } finally {
    await session.endSession();
  }

  // ==========================================================
  // STEP 15: CHECK COMMITTED APPROVAL
  // ==========================================================

  if (!approvedId) {
    return fail(errorMessage || "Approval failed.");
  }

  const updatedOutpass = await Outpass.findById(approvedId);

  if (!updatedOutpass) {
    return fail("Approved outpass could not be retrieved.");
  }

  const qrReady =
    updatedOutpass.qrGenerated === true &&
    Boolean(updatedOutpass.qrValidFrom) &&
    Boolean(updatedOutpass.qrExpiresAt) &&
    !updatedOutpass.qrRevokedAt;

  // ==========================================================
  // STEP 16: STUDENT NOTIFICATION
  // ==========================================================

  try {
    await sendNotification({
      title: "Outpass Approved",

      message: qrReady
        ? `Your outpass was approved by ${role}. QR is ready.`
        : `Your outpass was approved by ${role}. QR requires review.`,

      type: NOTIFICATION_TYPES.OUTPASS_APPROVED,

      sender: facultyId,

      receiver: updatedOutpass.student,

      role: NOTIFICATION_ROLES.STUDENT,

      relatedOutpass: updatedOutpass._id,
    });
  } catch (error) {
    console.error("Approval notification failed:", error.message);
  }

  // ==========================================================
  // STEP 17: RESPONSE
  // ==========================================================

  return {
    success: true,

    message: qrReady
      ? `${role} approval successful. QR ready.`
      : `${role} approval successful. QR requires review.`,

    data: updatedOutpass,
  };
}

module.exports = Object.freeze({
  approveOutpassForRole,
});
