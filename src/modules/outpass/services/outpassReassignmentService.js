"use strict";

const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");

const StudentMaster = require("../../academic/models/StudentMaster");

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

// ============================================================
// HELPERS
// ============================================================

const getId = (value) => String(value?._id || value || "");

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const sameId = (a, b) => Boolean(getId(a)) && getId(a) === getId(b);

const getNotificationRole = (role) => {
  const facultyRole = role === "BACKUP_MENTOR" ? "MENTOR" : role;

  return NOTIFICATION_ROLES[facultyRole] || null;
};

// ============================================================
// VERIFY STUDENT SNAPSHOT
// Never route a request using inconsistent academic records.
// ============================================================

const matchesStudentSnapshot = (student, outpass) => {
  if (
    !student ||
    !outpass ||
    !student.institute ||
    !student.program ||
    !outpass.academicInstitute ||
    !outpass.academicProgram
  ) {
    return false;
  }

  return (
    sameId(student.institute, outpass.academicInstitute) &&
    sameId(student.program, outpass.academicProgram) &&
    Number(student.semester) === Number(outpass.semester) &&
    normalize(student.section) === normalize(outpass.section) &&
    normalize(student.group) === normalize(outpass.group)
  );
};

// ============================================================
// REASSIGN ONE PENDING OUTPASS
// ============================================================

const reassignOnePendingOutpass = async ({ outpass, unavailableFacultyId }) => {
  if (!outpass || outpass.status !== "PENDING") {
    return {
      status: "SKIPPED",
      reason: "Outpass is no longer pending.",
    };
  }

  if (!sameId(outpass.assignedFaculty, unavailableFacultyId)) {
    return {
      status: "SKIPPED",
      reason: "Assignment has already changed.",
    };
  }

  // 1. Load official StudentMaster.
  const studentMaster = await StudentMaster.findOne({
    enrollmentNumber: normalize(outpass.enrollmentNumber),
    isActive: true,
    isDeleted: false,
  });

  if (!studentMaster) {
    return {
      status: "UNRESOLVED",
      reason: "Active StudentMaster not found.",
    };
  }

  // 2. Protect academic scope.
  if (!matchesStudentSnapshot(studentMaster, outpass)) {
    return {
      status: "UNRESOLVED",
      reason: "Student academic mapping mismatch.",
    };
  }

  // 3. Find current available, authorized authority.
  const authority = await resolveOutpassAuthority({
    studentMaster,
    now: new Date(),
  });

  if (!authority.success) {
    return {
      status: "UNRESOLVED",
      reason: authority.message || "No authorized authority available.",
    };
  }

  const nextFaculty = authority.faculty;
  const nextRole = authority.assignedRole;

  if (
    !nextFaculty?._id ||
    !["MENTOR", "BACKUP_MENTOR", "COORDINATOR", "HOD", "HOI"].includes(nextRole)
  ) {
    return {
      status: "UNRESOLVED",
      reason: "Invalid escalation result.",
    };
  }

  if (sameId(nextFaculty._id, unavailableFacultyId)) {
    return {
      status: "UNRESOLVED",
      reason: "Resolver returned the unavailable faculty.",
    };
  }

  // 4. Conditional update prevents two workers from
  // transferring the same assignment simultaneously.
  const now = new Date();

  const updated = await Outpass.findOneAndUpdate(
    {
      _id: outpass._id,
      status: "PENDING",
      isDeleted: false,
      assignedFaculty: unavailableFacultyId,
      assignedRole: outpass.assignedRole,
      approvedAt: null,
    },
    {
      $set: {
        assignedFaculty: nextFaculty._id,
        assignedRole: nextRole,

        // Kept in sync for legacy Mentor repository queries.
        mentor: nextFaculty._id,

        facultyAssignmentEmailStatus: "NOT_SENT",
        facultyAssignmentEmailSentAt: null,
      },

      $push: {
        assignmentHistory: {
          fromFaculty: unavailableFacultyId,
          toFaculty: nextFaculty._id,
          fromRole: outpass.assignedRole,
          toRole: nextRole,
          reason: "FACULTY_UNAVAILABLE",
          transferredBy: unavailableFacultyId,
          transferredAt: now,
          remarks:
            `Automatic leave-based reassignment. ` +
            `Hierarchy result: ${authority.reason || nextRole}.`,
        },
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) {
    return {
      status: "SKIPPED",
      reason: "Outpass was modified concurrently.",
    };
  }

  // 5. Notification is best effort. A notification failure
  // must not reverse an already committed reassignment.
  let notificationSent = false;

  try {
    const notificationRole = getNotificationRole(nextRole);

    if (notificationRole) {
      await sendNotification({
        title: "Outpass Reassigned",
        message:
          `Outpass ${updated.outpassId} has been ` +
          `assigned to you for review.`,
        type: NOTIFICATION_TYPES.OUTPASS_SUBMITTED,
        sender: null,
        receiver: nextFaculty._id,
        role: notificationRole,
        relatedOutpass: updated._id,
      });

      notificationSent = true;
    }
  } catch (error) {
    console.error(
      "Outpass reassignment notification failed:",
      updated.outpassId,
      error.message,
    );
  }

  return {
    status: "REASSIGNED",
    outpassId: updated.outpassId,
    assignedRole: nextRole,
    notificationSent,
  };
};

// ============================================================
// REASSIGN ALL PENDING REQUESTS FOR UNAVAILABLE FACULTY
// ============================================================

const reassignPendingOutpasses = async (facultyId) => {
  if (!mongoose.isValidObjectId(facultyId)) {
    throw new Error("Invalid faculty ID.");
  }

  const summary = {
    scanned: 0,
    reassigned: 0,
    skipped: 0,
    unresolved: 0,
    notificationFailures: 0,
    errors: [],
  };

  // A cursor avoids loading all assigned requests into memory.
  const cursor = Outpass.find({
    assignedFaculty: facultyId,
    status: "PENDING",
    isDeleted: false,
  })
    .select(
      "_id outpassId enrollmentNumber " +
        "academicInstitute academicProgram " +
        "semester section group " +
        "status assignedFaculty assignedRole",
    )
    .lean()
    .cursor();

  for await (const outpass of cursor) {
    summary.scanned += 1;

    try {
      const result = await reassignOnePendingOutpass({
        outpass,
        unavailableFacultyId: facultyId,
      });

      if (result.status === "REASSIGNED") {
        summary.reassigned += 1;

        if (!result.notificationSent) {
          summary.notificationFailures += 1;
        }
      } else if (result.status === "SKIPPED") {
        summary.skipped += 1;
      } else {
        summary.unresolved += 1;

        summary.errors.push({
          outpassId: outpass.outpassId,
          reason: result.reason,
        });
      }
    } catch (error) {
      summary.unresolved += 1;

      summary.errors.push({
        outpassId: outpass.outpassId,
        reason: error.message || "Reassignment failed.",
      });

      console.error(
        "Outpass reassignment failed:",
        outpass.outpassId,
        error.message,
      );
    }
  }

  return summary;
};

module.exports = Object.freeze({
  reassignOnePendingOutpass,
  reassignPendingOutpasses,
});
