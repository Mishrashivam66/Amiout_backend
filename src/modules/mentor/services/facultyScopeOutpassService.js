"use strict";

const mongoose = require("mongoose");

const Mentor = require("../../auth/models/Mentor");
const Outpass = require("../../outpass/models/Outpass");
const StudentMaster = require("../../academic/models/StudentMaster");
const Institute = require("../../academic/models/Institute");
const Program = require("../../academic/models/Program");

// ============================================================
// AMIOUT ENTERPRISE
// FACULTY ACADEMIC SCOPE OUTPASS SERVICE
//
// HOD -> Assigned institute + department
// HOI -> Assigned institute
//
// Never grant access merely because role is present.
// An active and valid role assignment is required.
// ============================================================

const ROLE_SCOPE_TYPES = Object.freeze({
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
});

const ALLOWED_STATUSES = new Set([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
  "EXITED",
  "RETURNED",
  "COMPLETED",
]);

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const normalizeScope = (value) => normalize(value).replace(/\s+/g, "");

const failure = (message, code = "SCOPE_ERROR") => ({
  success: false,
  code,
  message,
});

// ============================================================
// VALIDATE FACULTY ROLE ASSIGNMENT
// ============================================================

const validAssignment = (assignment, role, now) => {
  if (!assignment) return false;

  if (assignment.isActive !== true) {
    return false;
  }

  if (normalize(assignment.role) !== role) {
    return false;
  }

  if (normalize(assignment.scopeType) !== ROLE_SCOPE_TYPES[role]) {
    return false;
  }

  if (!normalizeScope(assignment.scopeId)) {
    return false;
  }

  if (assignment.startsAt && new Date(assignment.startsAt) > now) {
    return false;
  }

  if (assignment.expiresAt && new Date(assignment.expiresAt) <= now) {
    return false;
  }

  return true;
};

// ============================================================
// RESOLVE FACULTY SCOPE
//
// Resolve only explicitly assigned academic scopes.
//
// Supported scopeId examples:
//
// HOD: ASET/CSE
// HOD: <InstituteObjectId>/CSE
//
// HOI: ASET
// HOI: <InstituteObjectId>
//
// Department codes must match official Program data.
// ============================================================

const resolveFacultyScope = async (facultyId, role) => {
  const activeRole = normalize(role);

  if (!mongoose.isValidObjectId(facultyId) || !ROLE_SCOPE_TYPES[activeRole]) {
    return {
      scope: null,
      error: failure(
        "Invalid faculty account or authority role.",
        "INVALID_FACULTY_ROLE",
      ),
    };
  }

  const faculty = await Mentor.findById(facultyId)
    .select("role roles roleAssignments isActive isVerified")
    .lean();

  if (!faculty) {
    return {
      scope: null,
      error: failure("Faculty account not found.", "FACULTY_NOT_FOUND"),
    };
  }

  if (faculty.isActive !== true) {
    return {
      scope: null,
      error: failure("Faculty account is inactive.", "FACULTY_INACTIVE"),
    };
  }

  if (faculty.isVerified !== true) {
    return {
      scope: null,
      error: failure(
        "Faculty account verification is incomplete.",
        "FACULTY_NOT_VERIFIED",
      ),
    };
  }

  const roles = [
    faculty.role,
    ...(Array.isArray(faculty.roles) ? faculty.roles : []),
  ].map(normalize);

  if (!roles.includes(activeRole)) {
    return {
      scope: null,
      error: failure(
        `${activeRole} role is not assigned to this faculty account.`,
        "ROLE_NOT_ASSIGNED",
      ),
    };
  }

  const now = new Date();

  const assignments = (
    Array.isArray(faculty.roleAssignments) ? faculty.roleAssignments : []
  ).filter((assignment) => validAssignment(assignment, activeRole, now));

  if (!assignments.length) {
    return {
      scope: null,
      error: failure(
        `No active ${activeRole} ${ROLE_SCOPE_TYPES[activeRole]} assignment found. Contact Admin to verify your academic role mapping.`,
        "ROLE_SCOPE_ASSIGNMENT_MISSING",
      ),
    };
  }

  // ==========================================================
  // ACTIVE UNIVERSITY INSTITUTES
  // ==========================================================

  const institutes = await Institute.find({
    isActive: true,
    isDeleted: false,
  })
    .select("_id code")
    .lean();

  if (!institutes.length) {
    return {
      scope: null,
      error: failure(
        "No active academic institutes found.",
        "INSTITUTE_MASTER_EMPTY",
      ),
    };
  }

  const instituteById = new Map();

  const instituteByCode = new Map();

  for (const institute of institutes) {
    const id = String(institute._id);

    instituteById.set(id, institute);

    if (normalizeScope(institute.code)) {
      instituteByCode.set(normalizeScope(institute.code), institute);
    }
  }

  // ==========================================================
  // HOI: INSTITUTE SCOPE
  // ==========================================================

  if (activeRole === "HOI") {
    const authorizedInstituteIds = new Map();

    for (const assignment of assignments) {
      const scopeId = normalizeScope(assignment.scopeId);

      const institute =
        instituteByCode.get(scopeId) ||
        instituteById.get(String(assignment.scopeId).trim());

      if (!institute) continue;

      authorizedInstituteIds.set(String(institute._id), institute._id);
    }

    if (!authorizedInstituteIds.size) {
      return {
        scope: null,
        error: failure(
          "HOI institute assignment does not match an active Institute master record.",
          "INSTITUTE_SCOPE_MISMATCH",
        ),
      };
    }

    return {
      scope: {
        role: "HOI",
        instituteIds: [...authorizedInstituteIds.values()],
        programIds: [],
      },
      error: null,
    };
  }

  // ==========================================================
  // HOD: INSTITUTE + DEPARTMENT SCOPE
  //
  // An assignment must match both institute
  // and the department of an official program.
  // ==========================================================

  const programs = await Program.find({
    isActive: true,
    isDeleted: false,
    institute: {
      $in: institutes.map((item) => item._id),
    },
  })
    .select("_id institute department")
    .lean();

  if (!programs.length) {
    return {
      scope: null,
      error: failure(
        "No active programs are available for HOD department mapping.",
        "PROGRAM_MASTER_EMPTY",
      ),
    };
  }

  const assignmentScopes = new Set(
    assignments.map((assignment) => normalizeScope(assignment.scopeId)),
  );

  const authorizedProgramIds = new Map();

  for (const program of programs) {
    const institute = instituteById.get(String(program.institute));

    if (!institute || !program.department) {
      continue;
    }

    const department = normalizeScope(program.department);

    if (!department) continue;

    // Match only exact institute + department.
    // No department-only or university-wide fallback.
    const officialCodeScope = normalizeScope(`${institute.code}/${department}`);

    const officialIdScope = normalizeScope(`${institute._id}/${department}`);

    const authorized =
      assignmentScopes.has(officialCodeScope) ||
      assignmentScopes.has(officialIdScope);

    if (!authorized) continue;

    authorizedProgramIds.set(String(program._id), program._id);
  }

  if (!authorizedProgramIds.size) {
    return {
      scope: null,
      error: failure(
        "HOD department assignment does not match any active Program. Verify the institute code, department code and roleAssignments.scopeId in Admin faculty mapping.",
        "DEPARTMENT_SCOPE_MISMATCH",
      ),
    };
  }

  return {
    scope: {
      role: "HOD",
      instituteIds: [],
      programIds: [...authorizedProgramIds.values()],
    },
    error: null,
  };
};

// ============================================================
// BUILD OUTPASS FILTER USING STUDENT MASTER
//
// Students must belong to officially mapped scope.
//
// No fallback to unscoped outpass queries.
// ============================================================

const buildOutpassFilter = async (scope) => {
  const studentFilter =
    scope.role === "HOI"
      ? {
          institute: {
            $in: scope.instituteIds,
          },
        }
      : {
          program: {
            $in: scope.programIds,
          },
        };

  const students = await StudentMaster.find({
    ...studentFilter,
    isActive: true,
    isDeleted: false,
  })
    .select("enrollmentNumber")
    .lean();

  const enrollmentNumbers = [
    ...new Set(
      students
        .map((student) => String(student.enrollmentNumber ?? "").trim())
        .filter(Boolean),
    ),
  ];

  if (!enrollmentNumbers.length) {
    return {
      _id: { $in: [] },
    };
  }

  return {
    isDeleted: false,
    enrollmentNumber: {
      $in: enrollmentNumbers,
    },
  };
};

// ============================================================
// VALIDATE PAGINATION
// ============================================================

const parsePagination = (query = {}) => {
  const pageNumber = Number.parseInt(query.page, 10);

  const limitNumber = Number.parseInt(query.limit, 10);

  return {
    page: Math.max(1, Number.isFinite(pageNumber) ? pageNumber : 1),
    limit: Math.min(
      50,
      Math.max(1, Number.isFinite(limitNumber) ? limitNumber : 10),
    ),
  };
};

// ============================================================
// ESCAPE REGEX SEARCH
// ============================================================

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ============================================================
// LIST OUTPASSES
// ============================================================

const listOutpasses = async (facultyId, role, query = {}) => {
  const resolution = await resolveFacultyScope(facultyId, role);

  if (!resolution.scope) {
    return resolution.error;
  }

  const scope = resolution.scope;

  const { page, limit } = parsePagination(query);

  const filter = await buildOutpassFilter(scope);

  const status = normalize(query.status);

  if (status && status !== "ALL") {
    if (!ALLOWED_STATUSES.has(status)) {
      return failure("Invalid outpass status.", "INVALID_STATUS");
    }

    filter.status = status;
  }

  const search = String(query.search || "").trim();

  if (search) {
    if (search.length > 100) {
      return failure("Search cannot exceed 100 characters.", "INVALID_SEARCH");
    }

    const escaped = escapeRegExp(search);

    filter.$or = [
      {
        enrollmentNumber: {
          $regex: escaped,
          $options: "i",
        },
      },
      {
        outpassNumber: {
          $regex: escaped,
          $options: "i",
        },
      },
      {
        outpassId: {
          $regex: escaped,
          $options: "i",
        },
      },
    ];
  }

  const [total, outpasses] = await Promise.all([
    Outpass.countDocuments(filter),

    Outpass.find(filter)
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return {
    success: true,
    data: outpasses,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ============================================================
// GET AUTHORIZED OUTPASS DETAILS
// ============================================================

const getOutpassDetails = async (facultyId, role, outpassId) => {
  if (!mongoose.isValidObjectId(outpassId)) {
    return failure("Invalid outpass ID.", "INVALID_OUTPASS_ID");
  }

  const resolution = await resolveFacultyScope(facultyId, role);

  if (!resolution.scope) {
    return resolution.error;
  }

  const filter = await buildOutpassFilter(resolution.scope);

  const outpass = await Outpass.findOne({
    ...filter,
    _id: outpassId,
  }).lean();

  if (!outpass) {
    return failure(
      "Outpass not found or access denied.",
      "OUTPASS_ACCESS_DENIED",
    );
  }

  return {
    success: true,
    data: outpass,
  };
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  listOutpasses,
  getOutpassDetails,
});
