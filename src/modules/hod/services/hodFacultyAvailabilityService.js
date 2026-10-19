"use strict";

const mongoose = require("mongoose");

const Mentor = require("../../auth/models/Mentor");
const StudentMaster = require("../../academic/models/StudentMaster");
const Program = require("../../academic/models/Program");
const Outpass = require("../../outpass/models/Outpass");

const hodService = require("./hod.service");

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const compact = (value) => normalize(value).replace(/\s+/g, "");

const getId = (value) => String(value?._id || value || "");

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isValidAssignment = (assignment, now) => {
  if (!assignment || assignment.isActive !== true) {
    return false;
  }

  const role = normalize(assignment.role);
  const scopeType = normalize(assignment.scopeType);

  if (
    (role === "MENTOR" && scopeType !== "GROUP") ||
    (role === "COORDINATOR" && scopeType !== "SECTION")
  ) {
    return false;
  }

  if (!["MENTOR", "COORDINATOR"].includes(role)) {
    return false;
  }

  if (!assignment.scopeId) return false;

  if (assignment.startsAt) {
    const start = new Date(assignment.startsAt);

    if (!Number.isFinite(start.getTime()) || start > now) {
      return false;
    }
  }

  if (assignment.expiresAt) {
    const expiry = new Date(assignment.expiresAt);

    if (!Number.isFinite(expiry.getTime()) || expiry <= now) {
      return false;
    }
  }

  return true;
};

const getFacultyStatus = (faculty) => {
  if (faculty.isActive !== true || faculty.isVerified !== true) {
    return "DISABLED";
  }

  return normalize(faculty.availabilityStatus) === "AVAILABLE"
    ? "AVAILABLE"
    : "UNAVAILABLE";
};

// ============================================================
// READ-ONLY HOD FACULTY MONITORING
// ============================================================

const getFacultyAvailability = async (hodId) => {
  if (!mongoose.isValidObjectId(hodId)) {
    return {
      success: false,
      message: "Invalid HOD account.",
    };
  }

  // Reuse the existing HOD academic authorization.
  const profileResult = await hodService.getHODProfile(hodId);

  if (!profileResult?.success) {
    return profileResult;
  }

  const academicScope = profileResult.data?.academicScope || {};

  const institutes = Array.isArray(academicScope.institutes)
    ? academicScope.institutes
    : [];

  const authorizedPrograms = Array.isArray(academicScope.programs)
    ? academicScope.programs
    : [];

  if (!institutes.length || !authorizedPrograms.length) {
    return {
      success: false,
      message: "No authorized HOD department scope found.",
    };
  }

  // Fetch official Program references for exact matching.
  const instituteIds = institutes
    .map((item) => item._id)
    .filter((id) => mongoose.isValidObjectId(id));

  const programIds = authorizedPrograms
    .map((item) => item._id)
    .filter((id) => mongoose.isValidObjectId(id));

  const programs = await Program.find({
    _id: { $in: programIds },
    institute: { $in: instituteIds },
    isActive: true,
    isDeleted: false,
  })
    .select("_id institute code department")
    .lean();

  const instituteById = new Map(
    institutes.map((item) => [getId(item._id), item]),
  );

  const prefixes = programs
    .map((program) => {
      const institute = instituteById.get(getId(program.institute));

      if (!institute?.code || !program.code) {
        return null;
      }

      return compact(`${institute.code}/${program.code}`);
    })
    .filter(Boolean);

  if (!prefixes.length) {
    return {
      success: false,
      message: "HOD faculty monitoring could not resolve department programs.",
    };
  }

  // Restrict candidate faculty at DB query level.
  // Actual role assignments are revalidated below.
  const scopedRegexes = prefixes.map((prefix) => {
    const [instituteCode, programCode] = prefix.split("/");

    return new RegExp(
      `^\\s*${escapeRegex(instituteCode)}\\s*\\/\\s*` +
        `${escapeRegex(programCode)}\\s*\\/`,
      "i",
    );
  });

  const facultyCandidates = await Mentor.find({
    roles: { $in: ["MENTOR", "COORDINATOR"] },
    $or: scopedRegexes.map((regex) => ({
      roleAssignments: {
        $elemMatch: {
          role: { $in: ["MENTOR", "COORDINATOR"] },
          isActive: true,
          scopeId: { $regex: regex },
        },
      },
    })),
  })
    .select(
      "name email employeeId designation department " +
        "roles roleAssignments isActive isVerified " +
        "availabilityStatus availabilityUpdatedAt",
    )
    .lean();

  const now = new Date();

  const facultyList = [];

  for (const faculty of facultyCandidates) {
    const declaredRoles = new Set((faculty.roles || []).map(normalize));

    const allowedAssignments = (faculty.roleAssignments || []).filter(
      (assignment) => {
        if (!isValidAssignment(assignment, now)) {
          return false;
        }

        const role = normalize(assignment.role);

        if (!declaredRoles.has(role)) {
          return false;
        }

        const scopeId = compact(assignment.scopeId);

        // Canonical format:
        // MENTOR: INSTITUTE/PROGRAM/SEM/SECTION/GROUP
        // COORDINATOR: INSTITUTE/PROGRAM/SEM/SECTION
        const segments = scopeId.split("/");

        if (
          (role === "MENTOR" && segments.length !== 5) ||
          (role === "COORDINATOR" && segments.length !== 4)
        ) {
          return false;
        }

        if (
          !Number.isInteger(Number(segments[2])) ||
          Number(segments[2]) < 1 ||
          !segments[3] ||
          (role === "MENTOR" && !segments[4])
        ) {
          return false;
        }

        return prefixes.some((prefix) => scopeId.startsWith(`${prefix}/`));
      },
    );

    if (!allowedAssignments.length) {
      continue;
    }

    facultyList.push({
      _id: faculty._id,
      name: faculty.name,
      email: faculty.email,
      employeeId: faculty.employeeId,
      designation: faculty.designation,
      roles: [
        ...new Set(allowedAssignments.map((item) => normalize(item.role))),
      ],
      status: getFacultyStatus(faculty),
      availabilityStatus: normalize(faculty.availabilityStatus),
      availabilityUpdatedAt: faculty.availabilityUpdatedAt || null,
      scopes: [
        ...new Set(allowedAssignments.map((item) => String(item.scopeId))),
      ],
      pendingAssigned: 0,
    });
  }

  const facultyIds = facultyList.map((faculty) => faculty._id);

  // Official StudentMaster mapping is authoritative.
  const enrollmentNumbers = await StudentMaster.distinct("enrollmentNumber", {
    institute: { $in: instituteIds },
    program: { $in: programs.map((p) => p._id) },
    isActive: true,
    isDeleted: false,
  });

  const scopedEnrollmentNumbers = enrollmentNumbers
    .map(normalize)
    .filter(Boolean);

  const scopedPendingFilter = {
    status: "PENDING",
    isDeleted: false,
    enrollmentNumber: {
      $in: scopedEnrollmentNumbers,
    },
  };

  const pendingCounts = facultyIds.length
    ? await Outpass.aggregate([
        {
          $match: {
            ...scopedPendingFilter,
            assignedFaculty: {
              $in: facultyIds,
            },
          },
        },
        {
          $group: {
            _id: "$assignedFaculty",
            total: { $sum: 1 },
          },
        },
      ])
    : [];

  const countMap = new Map(
    pendingCounts.map((item) => [getId(item._id), item.total]),
  );

  for (const faculty of facultyList) {
    faculty.pendingAssigned = countMap.get(getId(faculty._id)) || 0;
  }

  facultyList.sort((a, b) => {
    const priority = {
      UNAVAILABLE: 0,
      DISABLED: 1,
      AVAILABLE: 2,
    };

    const difference = (priority[a.status] ?? 3) - (priority[b.status] ?? 3);

    return difference || a.name.localeCompare(b.name);
  });

  // Pending requests CURRENTLY assigned to this HOD.
  // These are actual database assignments, not predictions.
  const hodRequests = await Outpass.find({
    ...scopedPendingFilter,
    assignedFaculty: hodId,
    assignedRole: "HOD",
  })
    .select(
      "outpassId studentName enrollmentNumber " +
        "createdAt assignedRole assignedFaculty assignmentHistory",
    )
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const facultyNameMap = new Map(
    facultyList.map((faculty) => [getId(faculty._id), faculty.name]),
  );

  const escalations = hodRequests.map((outpass) => {
    const transfersToHOD = (outpass.assignmentHistory || [])
      .filter(
        (event) =>
          getId(event.toFaculty) === getId(hodId) &&
          normalize(event.toRole) === "HOD",
      )
      .sort(
        (a, b) =>
          new Date(b.transferredAt || 0) - new Date(a.transferredAt || 0),
      );

    const transfer = transfersToHOD[0] || null;

    return {
      _id: outpass._id,
      outpassId: outpass.outpassId,
      studentName: outpass.studentName,
      enrollmentNumber: outpass.enrollmentNumber,
      createdAt: outpass.createdAt,
      assignedRole: outpass.assignedRole,
      isTransferred: Boolean(transfer),
      transfer: transfer
        ? {
            fromRole: transfer.fromRole,
            toRole: transfer.toRole,
            reason: transfer.reason,
            transferredAt: transfer.transferredAt,
            fromFacultyName:
              facultyNameMap.get(getId(transfer.fromFaculty)) ||
              "Previous authority",
          }
        : null,
    };
  });

  // Detect pending requests still assigned to an
  // unavailable/disabled faculty member.
  const attentionFaculty = facultyList.filter(
    (faculty) => faculty.status !== "AVAILABLE" && faculty.pendingAssigned > 0,
  );

  return {
    success: true,
    data: {
      faculty: facultyList,
      escalations,
      stats: {
        totalFaculty: facultyList.length,
        available: facultyList.filter((item) => item.status === "AVAILABLE")
          .length,
        unavailable: facultyList.filter((item) => item.status === "UNAVAILABLE")
          .length,
        disabled: facultyList.filter((item) => item.status === "DISABLED")
          .length,
        pendingAssignedToFaculty: facultyList.reduce(
          (total, faculty) => total + faculty.pendingAssigned,
          0,
        ),
        pendingAssignedToHOD: await Outpass.countDocuments({
          ...scopedPendingFilter,
          assignedFaculty: hodId,
          assignedRole: "HOD",
        }),
        attentionRequired: attentionFaculty.length,
      },
      attentionFaculty: attentionFaculty.map((faculty) => ({
        _id: faculty._id,
        name: faculty.name,
        status: faculty.status,
        pendingAssigned: faculty.pendingAssigned,
      })),
      generatedAt: new Date(),
    },
  };
};

module.exports = Object.freeze({
  getFacultyAvailability,
});
