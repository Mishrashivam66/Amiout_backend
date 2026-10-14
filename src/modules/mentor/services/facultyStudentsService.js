"use strict";

const mongoose = require("mongoose");

const Mentor = require("../../auth/models/Mentor");
const MentorMaster = require("../../academic/models/MentorMaster");
const StudentMaster = require("../../academic/models/StudentMaster");

// ============================================================
// HELPERS
// ============================================================

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const getId = (value) => String(value?._id || value || "");

const unique = (values) => [...new Set(values.filter(Boolean))];

const ROLE_SCOPE_TYPES = Object.freeze({
  MENTOR: "GROUP",
  COORDINATOR: "SECTION",
});

const isActiveAssignment = (assignment, expectedRole, now = new Date()) => {
  if (!assignment || assignment.isActive !== true) {
    return false;
  }

  if (normalize(assignment.role) !== expectedRole) {
    return false;
  }

  if (normalize(assignment.scopeType) !== ROLE_SCOPE_TYPES[expectedRole]) {
    return false;
  }

  if (!normalize(assignment.scopeId)) {
    return false;
  }

  if (assignment.startsAt) {
    const start = new Date(assignment.startsAt);

    if (!Number.isFinite(start.getTime()) || start > now) {
      return false;
    }
  }

  if (assignment.expiresAt) {
    const end = new Date(assignment.expiresAt);

    if (!Number.isFinite(end.getTime()) || end <= now) {
      return false;
    }
  }

  return true;
};

// ============================================================
// ACADEMIC SCOPE IDENTIFIERS
// ============================================================

const getSectionKey = (master, separator = "/") =>
  [
    normalize(master.institute),
    normalize(master.program),
    String(master.semester ?? ""),
    normalize(master.section),
  ].join(separator);

const getGroupKey = (master, separator = "/") =>
  [
    normalize(master.institute),
    normalize(master.program),
    String(master.semester ?? ""),
    normalize(master.section),
    normalize(master.group),
  ].join(separator);

const getPossibleScopeIds = (master, role) => {
  const institute = normalize(master.institute);
  const program = normalize(master.program);
  const semester = String(master.semester ?? "");
  const section = normalize(master.section);
  const group = normalize(master.group);

  if (role === "MENTOR") {
    return unique([
      group,
      `GROUP:${group}`,
      normalize(master._id),

      // Actual scope format stored in MongoDB
      getGroupKey(master, "/"),

      // Legacy composite format
      getGroupKey(master, ":"),

      `GROUP:${getGroupKey(master, "/")}`,
      `GROUP:${getGroupKey(master, ":")}`,

      `${institute}:${program}:${semester}:${section}:GROUP:${group}`,
    ]);
  }

  if (role === "COORDINATOR") {
    return unique([
      section,
      `SECTION:${section}`,

      // Actual slash-separated section scope
      getSectionKey(master, "/"),

      // Legacy colon-separated section scope
      getSectionKey(master, ":"),

      `SECTION:${getSectionKey(master, "/")}`,
      `SECTION:${getSectionKey(master, ":")}`,
    ]);
  }

  return [];
};

const matchesScope = (assignment, master, role) => {
  if (!isActiveAssignment(assignment, role)) {
    return false;
  }

  const scopeId = normalize(assignment.scopeId);

  const validIds = getPossibleScopeIds(master, role);

  return validIds.includes(scopeId);
};

// ============================================================
// SAFE STUDENT DTO
// ============================================================

const formatStudent = (student) => ({
  _id: getId(student._id),
  name: student.name || "",
  enrollmentNumber: student.enrollmentNumber || "",
  rollNumber: student.rollNumber || "",
  email: student.email || "",
  program: student.program?.name || student.program?.code || "",
  semester: student.semester ?? null,
  section: student.section || "",
  group: student.group || "",
  batch: student.batch || "",
  isRegistered: student.isRegistered === true,
});

// ============================================================
// DEVELOPMENT DIAGNOSTICS
// Does not expose student/parent personal data.
// ============================================================

const debugScope = (stage, details) => {
  if (process.env.DEBUG_FACULTY_SCOPE !== "true") {
    return;
  }

  console.info("[Faculty Students]", stage, details);
};

// ============================================================
// GET STUDENTS FOR AUTHORIZED FACULTY
// ============================================================

const getStudentsForRole = async (facultyId, requestedRole = "MENTOR") => {
  const role = normalize(requestedRole);

  // ==========================================================
  // 1. VALIDATE ROLE
  // ==========================================================

  if (!Object.hasOwn(ROLE_SCOPE_TYPES, role)) {
    return {
      success: false,
      message: "Unsupported faculty role.",
    };
  }

  if (!mongoose.isValidObjectId(facultyId)) {
    return {
      success: false,
      message: "Invalid faculty account.",
    };
  }

  // ==========================================================
  // 2. GET FACULTY ACCOUNT
  // ==========================================================

  const faculty = await Mentor.findById(facultyId)
    .select(
      "role roles isActive isVerified " + "roleAssignments availabilityStatus",
    )
    .lean();

  if (!faculty || faculty.isActive !== true || faculty.isVerified !== true) {
    return {
      success: false,
      message: "Faculty account is not active or verified.",
    };
  }

  // ==========================================================
  // 3. CHECK DECLARED ROLE
  // ==========================================================

  const declaredRoles = unique([
    normalize(faculty.role),
    ...(Array.isArray(faculty.roles) ? faculty.roles.map(normalize) : []),
  ]);

  if (!declaredRoles.includes(role)) {
    return {
      success: false,
      message: "Faculty role is not authorized.",
    };
  }

  // ==========================================================
  // 4. VALIDATE ACTIVE ROLE ASSIGNMENTS
  // ==========================================================

  const now = new Date();

  const assignments = (faculty.roleAssignments || []).filter((assignment) =>
    isActiveAssignment(assignment, role, now),
  );

  if (assignments.length === 0) {
    return {
      success: true,
      data: [],
      role,
      total: 0,
      message: "No active academic role assignment found.",
    };
  }

  // ==========================================================
  // 5. GET FACULTY'S OWN MENTORMASTER RECORDS
  // ==========================================================

  const ownMasters = await MentorMaster.find({
    mentorUser: faculty._id,
    roles: role,
    isActive: true,
    isDeleted: false,
  })
    .select(
      "_id name roles institute department " +
        "program course semester section group " +
        "coordinatorGroups mentorUser",
    )
    .lean();

  debugScope("Assignment lookup", {
    role,
    activeAssignments: assignments.map((item) => ({
      role: item.role,
      scopeType: item.scopeType,
      scopeId: item.scopeId,
    })),
    linkedMasterCount: ownMasters.length,
    linkedMasterGroups: ownMasters.map((m) => ({
      group: m.group,
      section: m.section,
    })),
  });

  // ==========================================================
  // 6. FILTER VERIFIED ACADEMIC SCOPES
  // ==========================================================

  const authorizedMasters = ownMasters.filter((master) =>
    assignments.some((assignment) => matchesScope(assignment, master, role)),
  );

  if (authorizedMasters.length === 0) {
    debugScope("Scope mismatch", {
      role,
      configuredScopes: assignments.map((assignment) =>
        normalize(assignment.scopeId),
      ),
      acceptedScopeExamples: ownMasters.map((master) => ({
        group: master.group,
        candidates: getPossibleScopeIds(master, role),
      })),
    });

    return {
      success: true,
      data: [],
      role,
      total: 0,
      message: "No matching authorized academic scope.",
    };
  }

  // ==========================================================
  // 7. RESOLVE MENTORMASTER REFERENCES
  // ==========================================================

  let mentorMasterIds = [];

  if (role === "MENTOR") {
    // StudentMaster.primaryMentor contains MentorMaster IDs.
    mentorMasterIds = authorizedMasters.map((master) => master._id);
  }

  if (role === "COORDINATOR") {
    const coordinatorQueries = [];

    for (const master of authorizedMasters) {
      const groups = unique((master.coordinatorGroups || []).map(normalize));

      // Do not grant whole-section access when the
      // authorized coordinator groups are missing.
      if (groups.length === 0) {
        continue;
      }

      coordinatorQueries.push({
        institute: normalize(master.institute),
        program: normalize(master.program),
        semester: master.semester,
        section: normalize(master.section),
        group: {
          $in: groups,
        },
        roles: "MENTOR",
        isActive: true,
        isDeleted: false,
      });
    }

    if (coordinatorQueries.length === 0) {
      return {
        success: true,
        data: [],
        role,
        total: 0,
        message: "Coordinator groups are not configured.",
      };
    }

    const groupMasters = await MentorMaster.find({
      $or: coordinatorQueries,
    })
      .select("_id")
      .lean();

    mentorMasterIds = groupMasters.map((master) => master._id);
  }

  // ==========================================================
  // 8. UNIQUE MENTORMASTER IDS
  // ==========================================================

  const uniqueIds = unique(mentorMasterIds.map(getId));

  if (uniqueIds.length === 0) {
    return {
      success: true,
      data: [],
      role,
      total: 0,
      message: "No MentorMaster records found for the authorized groups.",
    };
  }

  // ==========================================================
  // 9. FETCH STUDENTMASTER RECORDS
  // ==========================================================

  const studentQuery = {
    primaryMentor: {
      $in: uniqueIds,
    },
    isActive: true,
    isDeleted: false,
  };

  const students = await StudentMaster.find(studentQuery)
    .select(
      "name enrollmentNumber rollNumber email " +
        "program semester section group batch " +
        "isRegistered primaryMentor",
    )
    .populate({
      path: "program",
      select: "name code",
    })
    .sort({
      group: 1,
      name: 1,
    })
    .lean();

  // ==========================================================
  // 10. BUILD SAFE RESPONSE
  // ==========================================================

  debugScope("Students resolved", {
    role,
    mentorMasterCount: uniqueIds.length,
    studentCount: students.length,
  });

  return {
    success: true,
    role,
    total: students.length,
    data: students.map(formatStudent),
  };
};

module.exports = {
  getStudentsForRole,
};
