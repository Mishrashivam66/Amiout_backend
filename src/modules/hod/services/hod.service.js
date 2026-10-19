"use strict";

const mongoose = require("mongoose");

const Mentor = require("../../auth/models/Mentor");
const StudentMaster = require("../../academic/models/StudentMaster");
const Institute = require("../../academic/models/Institute");
const Program = require("../../academic/models/Program");

// ============================================================
// AMIOUT ENTERPRISE - HOD SERVICE
//
// Department Students:
// - Source: StudentMaster
// - Only active, non-deleted students
// - All semesters, batches, sections and groups
// - Strict institute + department scope
//
// HOD Profile:
// - Source: authenticated Mentor account
// - Read-only
// ============================================================

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const normalizeScope = (value) => normalize(value).replace(/\s+/g, "");

const failed = (message, statusCode = 403) => ({
  success: false,
  statusCode,
  message,
});

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const activeAssignment = (assignment) => {
  if (
    !assignment ||
    normalize(assignment.role) !== "HOD" ||
    normalize(assignment.scopeType) !== "DEPARTMENT" ||
    assignment.isActive !== true ||
    !String(assignment.scopeId || "").trim()
  ) {
    return false;
  }

  const now = Date.now();

  if (assignment.startsAt) {
    const start = new Date(assignment.startsAt).getTime();

    if (!Number.isFinite(start) || start > now) {
      return false;
    }
  }

  if (assignment.expiresAt) {
    const expiry = new Date(assignment.expiresAt).getTime();

    if (!Number.isFinite(expiry) || expiry <= now) {
      return false;
    }
  }

  return true;
};

// ============================================================
// RESOLVE AUTHENTICATED HOD ACADEMIC SCOPE
// ============================================================

const getHODScope = async (facultyId) => {
  if (!mongoose.isValidObjectId(facultyId)) {
    return {
      error: failed("Invalid faculty account.", 401),
    };
  }

  const faculty = await Mentor.findById(facultyId)
    .select(
      "name email employeeId designation phone " +
        "department profilePhoto role roles roleAssignments " +
        "isActive isVerified availabilityStatus lastLogin",
    )
    .lean();

  if (!faculty) {
    return {
      error: failed("Faculty account not found.", 404),
    };
  }

  if (faculty.isActive !== true || faculty.isVerified !== true) {
    return {
      error: failed("Faculty account is inactive or not verified."),
    };
  }

  const roles = [faculty.role, ...(faculty.roles || [])].map(normalize);

  if (!roles.includes("HOD")) {
    return {
      error: failed("HOD authority is required."),
    };
  }

  const assignments = (faculty.roleAssignments || []).filter(activeAssignment);

  if (!assignments.length) {
    return {
      error: failed("No active HOD department assignment found."),
    };
  }

  const institutes = await Institute.find({
    isActive: true,
    isDeleted: false,
  })
    .select("_id code name")
    .lean();

  const instituteMap = new Map(
    institutes.map((item) => [String(item._id), item]),
  );

  const programs = await Program.find({
    institute: {
      $in: institutes.map((item) => item._id),
    },
    isActive: true,
    isDeleted: false,
  })
    .select("_id code name department institute")
    .lean();

  const scopeKeys = new Set(
    assignments.map((item) => normalizeScope(item.scopeId)),
  );

  const matchedPrograms = programs.filter((program) => {
    const institute = instituteMap.get(String(program.institute));

    if (!institute || !program.department) {
      return false;
    }

    const department = normalizeScope(program.department);

    const byCode = normalizeScope(`${institute.code}/${department}`);

    const byId = normalizeScope(`${institute._id}/${department}`);

    return scopeKeys.has(byCode) || scopeKeys.has(byId);
  });

  if (!matchedPrograms.length) {
    return {
      error: failed(
        "HOD academic scope does not match any active department program.",
      ),
    };
  }

  const matchedInstituteIds = [
    ...new Set(matchedPrograms.map((program) => String(program.institute))),
  ];

  const authorizedInstitutes = matchedInstituteIds
    .map((id) => instituteMap.get(id))
    .filter(Boolean)
    .map((item) => ({
      _id: item._id,
      code: item.code,
      name: item.name,
    }));

  return {
    faculty,
    scope: {
      programIds: matchedPrograms.map((item) => item._id),
      instituteIds: authorizedInstitutes.map((item) => item._id),
      institutes: authorizedInstitutes,
      departments: [...new Set(matchedPrograms.map((item) => item.department))],
      programs: matchedPrograms.map((item) => ({
        _id: item._id,
        code: item.code,
        name: item.name,
        department: item.department,
      })),
    },
  };
};

const buildStudentFilter = (scope) => ({
  institute: {
    $in: scope.instituteIds,
  },
  program: {
    $in: scope.programIds,
  },
  isActive: true,
  isDeleted: false,
});

// ============================================================
// STUDENT PUBLIC ACADEMIC VIEW
//
// Avoid returning parent contacts, login credentials,
// reset tokens or unrelated sensitive data.
// ============================================================

const studentProjection = [
  "name",
  "enrollmentNumber",
  "rollNumber",
  "email",
  "mobileNumber",
  "institute",
  "program",
  "batch",
  "admissionYear",
  "passingYear",
  "semester",
  "section",
  "group",
  "mentorGroup",
  "primaryMentor",
  "backupMentor",
  "isRegistered",
  "isActive",
  "createdAt",
].join(" ");

const populateStudent = (query) =>
  query
    .populate("institute", "name code")
    .populate("program", "name code degree department")
    .populate("primaryMentor", "name email mentorEmail designation facultyId")
    .populate("backupMentor", "name email mentorEmail designation facultyId");

// ============================================================
// LIST ALL DEPARTMENT STUDENTS
// ============================================================

const getDepartmentStudents = async (facultyId, query = {}) => {
  const result = await getHODScope(facultyId);

  if (result.error) return result.error;

  const baseFilter = buildStudentFilter(result.scope);

  const filter = {
    ...baseFilter,
  };

  const rawPage = Number.parseInt(query.page, 10);

  const rawLimit = Number.parseInt(query.limit, 10);

  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;

  const limit = Number.isFinite(rawLimit)
    ? Math.min(50, Math.max(1, rawLimit))
    : 10;

  const search = String(query.search || "").trim();

  if (search.length > 100) {
    return failed("Search cannot exceed 100 characters.", 400);
  }

  if (search) {
    const escaped = escapeRegex(search);

    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      {
        enrollmentNumber: {
          $regex: escaped,
          $options: "i",
        },
      },
      {
        rollNumber: {
          $regex: escaped,
          $options: "i",
        },
      },
      {
        email: {
          $regex: escaped,
          $options: "i",
        },
      },
    ];
  }

  if (
    query.semester !== undefined &&
    query.semester !== "" &&
    query.semester !== "ALL"
  ) {
    const semester = Number(query.semester);

    if (!Number.isInteger(semester) || semester < 1 || semester > 20) {
      return failed("Invalid semester.", 400);
    }

    filter.semester = semester;
  }

  const [totalStudents, total, students] = await Promise.all([
    StudentMaster.countDocuments(baseFilter),

    StudentMaster.countDocuments(filter),

    populateStudent(
      StudentMaster.find(filter)
        .select(studentProjection)
        .sort({
          name: 1,
          enrollmentNumber: 1,
        })
        .skip((page - 1) * limit)
        .limit(limit),
    ).lean(),
  ]);

  return {
    success: true,
    message: "Department students loaded.",
    data: {
      students,
      totalStudents,
      department: result.scope.departments,
      institutes: result.scope.institutes,
    },
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ============================================================
// SINGLE AUTHORIZED STUDENT DETAILS
// ============================================================

const getDepartmentStudentDetails = async (facultyId, studentId) => {
  if (!mongoose.isValidObjectId(studentId)) {
    return failed("Invalid student ID.", 400);
  }

  const result = await getHODScope(facultyId);

  if (result.error) return result.error;

  const student = await populateStudent(
    StudentMaster.findOne({
      _id: studentId,
      ...buildStudentFilter(result.scope),
    }).select(studentProjection),
  ).lean();

  if (!student) {
    return failed("Student not found in your authorized department.", 404);
  }

  return {
    success: true,
    data: student,
  };
};

// ============================================================
// HOD READ-ONLY PROFILE
// ============================================================

const getHODProfile = async (facultyId) => {
  const result = await getHODScope(facultyId);

  if (result.error) return result.error;

  const { faculty, scope } = result;

  return {
    success: true,
    data: {
      _id: faculty._id,
      name: faculty.name,
      email: faculty.email,
      employeeId: faculty.employeeId,
      designation: faculty.designation,
      phone: faculty.phone,
      profilePhoto: faculty.profilePhoto,
      department: faculty.department,
      role: "HOD",
      roles: faculty.roles,
      isActive: faculty.isActive,
      isVerified: faculty.isVerified,
      availabilityStatus: faculty.availabilityStatus,
      lastLogin: faculty.lastLogin,
      academicScope: {
        institutes: scope.institutes,
        departments: scope.departments,
        programs: scope.programs,
      },
    },
  };
};

module.exports = Object.freeze({
  getDepartmentStudents,
  getDepartmentStudentDetails,
  getHODProfile,
});
