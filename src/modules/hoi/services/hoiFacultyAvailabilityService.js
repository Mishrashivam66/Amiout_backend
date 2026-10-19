"use strict";

const mongoose = require("mongoose");

const Mentor = require("../../auth/models/Mentor");
const StudentMaster = require("../../academic/models/StudentMaster");
const Outpass = require("../../outpass/models/Outpass");

const { resolveHOIScope } = require("./hoi.service");

const ROLE_TYPES = Object.freeze({
  MENTOR: "GROUP",
  COORDINATOR: "SECTION",
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
});

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const compact = (value) => normalize(value).replace(/\s+/g, "");

const getId = (value) => String(value?._id || value || "");

const activeAssignment = (assignment, now) => {
  if (!assignment || assignment.isActive !== true) {
    return false;
  }

  const role = normalize(assignment.role);

  if (
    !ROLE_TYPES[role] ||
    normalize(assignment.scopeType) !== ROLE_TYPES[role]
  ) {
    return false;
  }

  const start = assignment.startsAt
    ? new Date(assignment.startsAt).getTime()
    : null;

  const expiry = assignment.expiresAt
    ? new Date(assignment.expiresAt).getTime()
    : null;

  if (start !== null && (!Number.isFinite(start) || start > now.getTime())) {
    return false;
  }

  if (
    expiry !== null &&
    (!Number.isFinite(expiry) || expiry <= now.getTime())
  ) {
    return false;
  }

  return true;
};

const matchesInstitute = (assignment, instituteCodes) => {
  const role = normalize(assignment.role);
  const scope = compact(assignment.scopeId);
  const parts = scope.split("/");

  if (!instituteCodes.has(parts[0])) {
    return false;
  }

  if (role === "HOI") {
    return parts.length === 1;
  }

  if (role === "HOD") {
    return parts.length === 2 && Boolean(parts[1]);
  }

  if (role === "COORDINATOR") {
    return (
      parts.length === 4 &&
      Boolean(parts[1]) &&
      Number.isInteger(Number(parts[2])) &&
      Number(parts[2]) > 0 &&
      Boolean(parts[3])
    );
  }

  if (role === "MENTOR") {
    return (
      parts.length === 5 &&
      Boolean(parts[1]) &&
      Number.isInteger(Number(parts[2])) &&
      Number(parts[2]) > 0 &&
      Boolean(parts[3]) &&
      Boolean(parts[4])
    );
  }

  return false;
};

const getStatus = (faculty) => {
  if (faculty.isActive !== true || faculty.isVerified !== true) {
    return "DISABLED";
  }

  return normalize(faculty.availabilityStatus) === "AVAILABLE"
    ? "AVAILABLE"
    : "UNAVAILABLE";
};

async function getHOIFacultyAvailability(facultyId) {
  if (!mongoose.isValidObjectId(facultyId)) {
    return {
      success: false,
      statusCode: 401,
      message: "Invalid HOI account.",
    };
  }

  const access = await resolveHOIScope(facultyId);

  if (access.error) {
    return access.error;
  }

  const scope = access.scope;
  const instituteCodes = new Set(
    scope.institutes.map((item) => compact(item.code)),
  );

  const now = new Date();

  // Candidate narrowing. Each role assignment receives
  // a separate exact academic-scope check below.
  const candidates = await Mentor.find({
    "roleAssignments.isActive": true,
  })
    .select(
      "name email employeeId designation roles roleAssignments " +
        "isActive isVerified availabilityStatus availabilityUpdatedAt",
    )
    .lean();

  const faculty = [];

  for (const person of candidates) {
    const authorizedRoles = new Set((person.roles || []).map(normalize));

    const assignments = (person.roleAssignments || []).filter(
      (assignment) =>
        activeAssignment(assignment, now) &&
        authorizedRoles.has(normalize(assignment.role)) &&
        matchesInstitute(assignment, instituteCodes),
    );

    if (!assignments.length) continue;

    faculty.push({
      _id: person._id,
      name: person.name,
      email: person.email,
      employeeId: person.employeeId,
      designation: person.designation,
      roles: [...new Set(assignments.map((item) => normalize(item.role)))],
      scopes: [...new Set(assignments.map((item) => String(item.scopeId)))],
      status: getStatus(person),
      availabilityUpdatedAt: person.availabilityUpdatedAt || null,
      pendingAssigned: 0,
    });
  }

  // Query only the official, active students belonging
  // to the logged-in HOI's authorized institute.
  const enrollmentNumbers = await StudentMaster.distinct("enrollmentNumber", {
    institute: { $in: scope.instituteIds },
    program: { $in: scope.programIds },
    isActive: true,
    isDeleted: false,
  });

  const scopedPendingFilter = {
    status: "PENDING",
    isDeleted: false,
    enrollmentNumber: {
      $in: enrollmentNumbers.map(normalize),
    },
  };

  const facultyIds = faculty.map((item) => item._id);

  const counts = facultyIds.length
    ? await Outpass.aggregate([
        {
          $match: {
            ...scopedPendingFilter,
            assignedFaculty: { $in: facultyIds },
          },
        },
        {
          $group: {
            _id: "$assignedFaculty",
            count: { $sum: 1 },
          },
        },
      ])
    : [];

  const countMap = new Map(counts.map((item) => [getId(item._id), item.count]));

  for (const person of faculty) {
    person.pendingAssigned = countMap.get(getId(person._id)) || 0;
  }

  faculty.sort((a, b) => {
    const rank = {
      UNAVAILABLE: 0,
      DISABLED: 1,
      AVAILABLE: 2,
    };

    return (
      (rank[a.status] ?? 3) - (rank[b.status] ?? 3) ||
      String(a.name || "").localeCompare(String(b.name || ""))
    );
  });

  const hoiPendingCount = await Outpass.countDocuments({
    ...scopedPendingFilter,
    assignedFaculty: facultyId,
    assignedRole: "HOI",
  });

  const hoiRequests = await Outpass.find({
    ...scopedPendingFilter,
    assignedFaculty: facultyId,
    assignedRole: "HOI",
  })
    .select(
      "outpassId studentName enrollmentNumber createdAt " +
        "assignedRole assignmentHistory",
    )
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const nameMap = new Map(faculty.map((item) => [getId(item._id), item.name]));

  // IMPORTANT:
  // INITIAL_ASSIGNMENT must NOT be marked as transfer.
  const assignedRequests = hoiRequests.map((item) => {
    const transfer = (item.assignmentHistory || [])
      .filter((event) => {
        const reason = normalize(event.reason);

        return (
          getId(event.toFaculty) === getId(facultyId) &&
          normalize(event.toRole) === "HOI" &&
          reason !== "INITIAL_ASSIGNMENT" &&
          Boolean(event.fromFaculty) &&
          getId(event.fromFaculty) !== getId(facultyId)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.transferredAt || 0).getTime() -
          new Date(a.transferredAt || 0).getTime(),
      )[0];

    return {
      _id: item._id,
      outpassId: item.outpassId,
      studentName: item.studentName,
      enrollmentNumber: item.enrollmentNumber,
      createdAt: item.createdAt,
      isTransferred: Boolean(transfer),
      transfer: transfer
        ? {
            fromRole: transfer.fromRole,
            fromFacultyName:
              nameMap.get(getId(transfer.fromFaculty)) || "Previous authority",
            reason: transfer.reason,
            transferredAt: transfer.transferredAt,
          }
        : null,
    };
  });

  const attentionFaculty = faculty.filter(
    (item) => item.status !== "AVAILABLE" && item.pendingAssigned > 0,
  );

  return {
    success: true,
    data: {
      institutes: scope.institutes,
      faculty,
      assignedRequests,
      attentionFaculty,
      stats: {
        totalFaculty: faculty.length,
        available: faculty.filter((item) => item.status === "AVAILABLE").length,
        unavailable: faculty.filter((item) => item.status === "UNAVAILABLE")
          .length,
        disabled: faculty.filter((item) => item.status === "DISABLED").length,
        pendingAssignedToHOI: hoiPendingCount,
        attentionRequired: attentionFaculty.length,
      },
      generatedAt: now,
    },
  };
}

module.exports = Object.freeze({
  getHOIFacultyAvailability,
});
