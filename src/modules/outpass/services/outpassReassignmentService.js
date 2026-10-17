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
// CONFIGURATION
// ============================================================

const BATCH_SIZE = 24;
const CONCURRENT_REASSIGNMENTS = 3;
const QUERY_TIMEOUT_MS = 10000;

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
// VERIFY STUDENT ACADEMIC SNAPSHOT
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
  const outpassId = outpass?.outpassId || "UNKNOWN";

  // ----------------------------------------------------------
  // 1. CURRENT ASSIGNMENT VALIDATION
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // 2. STUDENTMASTER LOOKUP
  // ----------------------------------------------------------

  const studentMaster = await StudentMaster.findOne({
    enrollmentNumber: normalize(outpass.enrollmentNumber),
    isActive: true,
    isDeleted: false,
  }).maxTimeMS(QUERY_TIMEOUT_MS);

  if (!studentMaster) {
    return {
      status: "UNRESOLVED",
      reason: "Active StudentMaster not found.",
    };
  }

  // ----------------------------------------------------------
  // 3. ACADEMIC SCOPE VERIFICATION
  // ----------------------------------------------------------

  if (!matchesStudentSnapshot(studentMaster, outpass)) {
    return {
      status: "UNRESOLVED",
      reason: "Student academic mapping mismatch.",
    };
  }

  // ----------------------------------------------------------
  // 4. RESOLVE NEXT ELIGIBLE AUTHORITY
  // ----------------------------------------------------------

  const authority = await resolveOutpassAuthority({
    studentMaster,
    now: new Date(),
  });

  if (!authority?.success) {
    return {
      status: "UNRESOLVED",
      reason: authority?.message || "No authorized authority available.",
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
      reason: "Resolver returned unavailable faculty.",
    };
  }

  // ----------------------------------------------------------
  // 5. ATOMIC CONDITIONAL REASSIGNMENT
  // ----------------------------------------------------------

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

        // Legacy compatibility
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

          // System-initiated reassignment
          transferredBy: null,
          transferredAt: now,

          remarks:
            "Automatic availability-based " +
            "faculty reassignment. " +
            `Authority: ${authority.reason || nextRole}.`,
        },
      },
    },
    {
      new: true,
      runValidators: true,
    },
  ).maxTimeMS(QUERY_TIMEOUT_MS);

  if (!updated) {
    return {
      status: "SKIPPED",
      reason: "Outpass was modified concurrently.",
    };
  }

  // ----------------------------------------------------------
  // 6. NOTIFY NEW AUTHORITY
  // Database reassignment has already committed.
  // ----------------------------------------------------------

  let notificationSent = false;
  let notificationError = null;

  const notificationRole = getNotificationRole(nextRole);

  if (notificationRole) {
    try {
      await sendNotification({
        title: "Outpass Reassigned",

        message:
          `Outpass ${updated.outpassId} ` +
          "has been assigned to you for review.",

        type: NOTIFICATION_TYPES.OUTPASS_SUBMITTED,

        sender: null,
        receiver: nextFaculty._id,
        role: notificationRole,
        relatedOutpass: updated._id,
      });

      notificationSent = true;
    } catch (error) {
      notificationError = error.message || "Notification failed.";

      console.error(`[REASSIGN] ${outpassId} | Notification ERROR`, error);
    }
  } else {
    notificationError = "Notification role is not configured.";
  }

  // ----------------------------------------------------------
  // 7. RESULT
  // ----------------------------------------------------------

  return {
    status: "REASSIGNED",
    outpassId: updated.outpassId,
    assignedRole: nextRole,
    assignedFaculty: getId(nextFaculty._id),
    notificationSent,
    notificationError,
  };
};

// ============================================================
// REASSIGN ALL PENDING REQUESTS
// Batched pagination avoids a long-lived MongoDB cursor.
// Bounded concurrency improves throughput.
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

  let lastId = null;

  const baseQuery = {
    assignedFaculty: facultyId,
    status: "PENDING",
    isDeleted: false,
  };

  // ----------------------------------------------------------
  // PAGE THROUGH REQUESTS
  // ----------------------------------------------------------

  while (true) {
    const query = {
      ...baseQuery,
    };

    if (lastId) {
      query._id = {
        $gt: lastId,
      };
    }

    const batch = await Outpass.find(query)
      .select(
        "_id outpassId enrollmentNumber " +
          "academicInstitute academicProgram " +
          "semester section group " +
          "status assignedFaculty assignedRole",
      )
      .sort({
        _id: 1,
      })
      .limit(BATCH_SIZE)
      .maxTimeMS(QUERY_TIMEOUT_MS)
      .lean();

    if (!batch.length) {
      break;
    }

    lastId = batch[batch.length - 1]._id;

    // --------------------------------------------------------
    // PROCESS IN SMALL CONCURRENT GROUPS
    // --------------------------------------------------------

    for (
      let index = 0;
      index < batch.length;
      index += CONCURRENT_REASSIGNMENTS
    ) {
      const group = batch.slice(index, index + CONCURRENT_REASSIGNMENTS);

      const results = await Promise.allSettled(
        group.map((outpass) =>
          reassignOnePendingOutpass({
            outpass,
            unavailableFacultyId: facultyId,
          }),
        ),
      );

      for (let i = 0; i < results.length; i += 1) {
        const outpass = group[i];
        const outcome = results[i];

        summary.scanned += 1;

        if (outcome.status === "rejected") {
          summary.unresolved += 1;

          summary.errors.push({
            outpassId: outpass.outpassId,
            reason: outcome.reason?.message || "Reassignment failed.",
          });

          console.error(
            "[REASSIGN] Request failed:",
            outpass.outpassId,
            outcome.reason,
          );

          continue;
        }

        const result = outcome.value;

        if (result?.status === "REASSIGNED") {
          summary.reassigned += 1;

          if (!result.notificationSent) {
            summary.notificationFailures += 1;
          }
        } else if (result?.status === "SKIPPED") {
          summary.skipped += 1;
        } else {
          summary.unresolved += 1;

          summary.errors.push({
            outpassId: outpass.outpassId,
            reason: result?.reason || "Unable to find eligible faculty.",
          });
        }
      }
    }

    // Query the next page after the current batch
    // finishes to avoid overlapping updates.
  }

  return summary;
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  reassignOnePendingOutpass,
  reassignPendingOutpasses,
});
