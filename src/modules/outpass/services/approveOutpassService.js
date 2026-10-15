"use strict";

const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");
const Mentor = require("../../auth/models/Mentor");
const MentorMaster = require("../../academic/models/MentorMaster");
const StudentMaster = require("../../academic/models/StudentMaster");
const Group = require("../../academic/models/Group");

const { approvedEvent } = require("../utils/timelineHelper");
const { OUTPASS_STATUS } = require("../constants/outpassStatus");
const { createQRToken, getISTDay } = require("./qrService");

const {
  sendNotification,
} = require("../../notification/service/notificationService");

const {
  NOTIFICATION_TYPES: SHARED_NOTIFICATION_TYPES,
} = require("../../../shared/types/notificationTypes");

const {
  NOTIFICATION_ROLES,
} = require("../../notification/constants/notificationConstants");

const { sendEmail } = require("../../auth/utils/email");
const outpassApprovedTemplate = require("../templates/outpassApprovedTemplate");

// ============================================================
// HELPERS
// ============================================================

const ALLOWED_ROLES = new Set(["MENTOR", "BACKUP_MENTOR"]);

const failure = (message) => ({
  success: false,
  message,
});

const getId = (value) => String(value?._id || value || "");

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const normalizeScope = (value) => normalize(value).replace(/\s+/g, "");

// Scope example:
// ASET/B.TECH-CSE/7/C/C2
const matchesFacultyScope = (assignments, master) => {
  const expected = [
    normalizeScope(master.institute),
    normalizeScope(master.program),
    String(master.semester),
    normalizeScope(master.section),
    normalizeScope(master.group),
  ].join("/");

  // Fail closed if institute or program is missing.
  if (!master.institute || !master.program) {
    return false;
  }

  return assignments.some(
    (assignment) =>
      assignment.role === "MENTOR" &&
      assignment.scopeType === "GROUP" &&
      normalizeScope(assignment.scopeId) === expected,
  );
};

// ============================================================
// APPROVE OUTPASS
// ============================================================

const approveOutpass = async (facultyId, outpassId, remark = "") => {
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
      // Reset values if MongoDB retries the transaction.
      approvedId = null;
      errorMessage = null;

      const now = new Date();

      // ======================================================
      // 1. FIND OUTPASS
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
      // 2. CURRENT FACULTY AUTHORIZATION
      // ======================================================

      if (getId(outpass.assignedFaculty) !== String(facultyId)) {
        errorMessage = "This outpass is not assigned to your account.";
        return;
      }

      if (!ALLOWED_ROLES.has(outpass.assignedRole)) {
        errorMessage = "This authority role requires separate authorization.";
        return;
      }

      // ======================================================
      // 3. PARENT CONSENT
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
      // 4. FACULTY ACCOUNT
      // ======================================================

      const faculty = await Mentor.findById(facultyId).session(session);

      if (
        !faculty ||
        faculty.isActive !== true ||
        faculty.isVerified !== true ||
        faculty.availabilityStatus !== "AVAILABLE"
      ) {
        errorMessage = "Faculty is inactive, unverified or unavailable.";
        return;
      }

      if (!faculty.hasRole("MENTOR")) {
        errorMessage = "Faculty does not have the Mentor role.";
        return;
      }

      const activeAssignments = faculty
        .getActiveRoleAssignments(now)
        .filter(
          (assignment) =>
            assignment.role === "MENTOR" && assignment.scopeType === "GROUP",
        );

      if (!activeAssignments.length) {
        errorMessage = "Faculty has no active Mentor group authorization.";
        return;
      }

      // ======================================================
      // 5. STUDENT MASTER
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

      if (
        studentMaster.semester !== outpass.semester ||
        normalize(studentMaster.section) !== normalize(outpass.section) ||
        normalize(studentMaster.group) !== normalize(outpass.group)
      ) {
        errorMessage =
          "Student academic details changed. Reassignment required.";
        return;
      }

      if (
        (outpass.academicInstitute &&
          getId(studentMaster.institute) !==
            getId(outpass.academicInstitute)) ||
        (outpass.academicProgram &&
          getId(studentMaster.program) !== getId(outpass.academicProgram))
      ) {
        errorMessage = "Student institute or program mapping mismatch.";
        return;
      }

      // ======================================================
      // 6. STUDENT GROUP
      // ======================================================

      if (!studentMaster.mentorGroup) {
        errorMessage = "Student group mapping is missing.";
        return;
      }

      const studentGroup = await Group.findOne({
        _id: studentMaster.mentorGroup,
        isActive: true,
        isDeleted: false,
      }).session(session);

      if (!studentGroup) {
        errorMessage = "Student group is inactive or missing.";
        return;
      }

      if (
        getId(studentGroup.institute) !== getId(studentMaster.institute) ||
        getId(studentGroup.program) !== getId(studentMaster.program) ||
        normalize(studentGroup.batch) !== normalize(studentMaster.batch) ||
        studentGroup.semester !== studentMaster.semester ||
        normalize(studentGroup.section) !== normalize(studentMaster.section) ||
        normalize(studentGroup.groupName) !== normalize(studentMaster.group)
      ) {
        errorMessage = "Student group academic mapping mismatch.";
        return;
      }

      // ======================================================
      // 7. OFFICIAL MENTOR MAPPING
      // ======================================================

      const isBackup = outpass.assignedRole === "BACKUP_MENTOR";

      const expectedMasterId = isBackup
        ? studentGroup.backupMentor
        : studentGroup.primaryMentor;

      const mappedMasterId = isBackup
        ? studentMaster.backupMentor
        : studentMaster.primaryMentor;

      if (
        !expectedMasterId ||
        !mappedMasterId ||
        getId(expectedMasterId) !== getId(mappedMasterId)
      ) {
        errorMessage = "Student and Group mentor mappings are inconsistent.";
        return;
      }

      const mappedMentor = await MentorMaster.findOne({
        _id: mappedMasterId,
        mentorUser: faculty._id,
        isActive: true,
        isDeleted: false,
        availabilityStatus: "AVAILABLE",
        roles: "MENTOR",
      }).session(session);

      if (!mappedMentor) {
        errorMessage = "Faculty does not match the authorized MentorMaster.";
        return;
      }

      if (
        mappedMentor.semester !== studentMaster.semester ||
        normalize(mappedMentor.section) !== normalize(studentMaster.section) ||
        normalize(mappedMentor.course) !== normalize(outpass.course)
      ) {
        errorMessage = "Mentor academic details mismatch.";
        return;
      }

      if (
        !isBackup &&
        normalize(mappedMentor.group) !== normalize(studentMaster.group)
      ) {
        errorMessage = "Primary mentor group mismatch.";
        return;
      }

      if (
        isBackup &&
        normalize(mappedMentor.group) === normalize(studentMaster.group)
      ) {
        errorMessage = "Backup mentor must belong to a different group.";
        return;
      }

      // ======================================================
      // 8. VALIDATE FULL FACULTY SCOPE
      // ======================================================

      if (!matchesFacultyScope(activeAssignments, mappedMentor)) {
        errorMessage =
          "Faculty's active academic scope does not match MentorMaster.";
        return;
      }

      // ======================================================
      // 9. BACKUP MENTOR FALLBACK VALIDATION
      // ======================================================

      if (isBackup) {
        if (!studentMaster.primaryMentor) {
          errorMessage = "Primary mentor mapping is missing.";
          return;
        }

        const primaryMaster = await MentorMaster.findById(
          studentMaster.primaryMentor,
        ).session(session);

        if (!primaryMaster) {
          errorMessage = "Primary MentorMaster not found.";
          return;
        }

        const primaryFaculty = primaryMaster.mentorUser
          ? await Mentor.findById(primaryMaster.mentorUser).session(session)
          : null;

        const primaryHasActiveScope =
          primaryFaculty?.isActive === true &&
          primaryFaculty?.isVerified === true &&
          primaryFaculty?.hasRole("MENTOR") &&
          primaryFaculty
            .getActiveRoleAssignments(now)
            .some(
              (assignment) =>
                assignment.role === "MENTOR" &&
                assignment.scopeType === "GROUP" &&
                normalizeScope(assignment.scopeId) ===
                  [
                    normalizeScope(primaryMaster.institute),
                    normalizeScope(primaryMaster.program),
                    String(primaryMaster.semester),
                    normalizeScope(primaryMaster.section),
                    normalizeScope(primaryMaster.group),
                  ].join("/"),
            );

        const primaryAvailable =
          primaryMaster.isActive === true &&
          primaryMaster.isDeleted !== true &&
          primaryMaster.availabilityStatus === "AVAILABLE" &&
          primaryFaculty?.availabilityStatus === "AVAILABLE" &&
          Boolean(primaryHasActiveScope);

        if (primaryAvailable) {
          errorMessage = "Primary mentor is available. Backup cannot approve.";
          return;
        }
      }

      // ======================================================
      // 10. IST DAILY QUOTA
      // ======================================================

      const dayKey = getISTDay(outpass.outDate);

      const dayStart = new Date(`${dayKey}T00:00:00+05:30`);

      const dayEnd = new Date(dayStart.getTime() + 86400000);

      const previousApproved = await Outpass.find({
        student: outpass.student,
        _id: { $ne: outpass._id },
        isDeleted: false,
        outDate: {
          $gte: dayStart,
          $lt: dayEnd,
        },
        approvedAt: { $ne: null },
      })
        .select("_id approvedAt exitVerified entryVerified dailyTripNumber")
        .sort({ approvedAt: 1 })
        .session(session);

      if (previousApproved.length >= 2) {
        errorMessage = "Maximum 2 approved outpasses allowed per IST day.";
        return;
      }

      const tripNumber = previousApproved.length + 1;

      if (
        tripNumber === 2 &&
        !previousApproved.every(
          (previous) =>
            previous.exitVerified === true && previous.entryVerified === true,
        )
      ) {
        errorMessage =
          "Complete EXIT and ENTRY of the first trip before second approval.";
        return;
      }

      // ======================================================
      // 11. GENERATE STATIC SECURE QR TOKEN
      // ======================================================

      let qr;

      try {
        qr = createQRToken(outpass, now);
      } catch (error) {
        errorMessage = error.message || "Unable to generate QR token.";
        return;
      }

      // ======================================================
      // 12. PREPARE CONDITIONAL APPROVAL FILTER
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
      // 13. ATOMIC APPROVAL + QR SAVE
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

  if (!approvedId) {
    return failure(errorMessage || "Outpass approval failed.");
  }

  // Fetch after transaction commits.
  const updatedOutpass = await Outpass.findById(approvedId);

  if (!updatedOutpass) {
    return failure("Approved outpass could not be retrieved.");
  }

  // ==========================================================
  // 14. STUDENT NOTIFICATION
  // ==========================================================

  try {
    await sendNotification({
      title: "Outpass Approved",
      message: "Your outpass has been approved. Your digital QR pass is ready.",
      type: SHARED_NOTIFICATION_TYPES.OUTPASS_APPROVED,
      sender: facultyId,
      receiver: updatedOutpass.student,
      role: NOTIFICATION_ROLES.STUDENT,
      relatedOutpass: updatedOutpass._id,
    });
  } catch (error) {
    console.error("Notification Error:", error);
  }

  // ==========================================================
  // 15. PARENT EMAIL
  // ==========================================================

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
        subject: "Outpass Approved",
        html,
      });
    }
  } catch (error) {
    console.error("Email Error:", error);
  }

  return {
    success: true,
    message: "Outpass approved successfully. Digital QR pass is ready.",
    data: updatedOutpass,
  };
};

module.exports = Object.freeze({
  approveOutpass,
});
