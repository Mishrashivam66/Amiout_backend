"use strict";

const mongoose = require("mongoose");

const Mentor = require("../../auth/models/Mentor");
const Institute = require("../../academic/models/Institute");
const Program = require("../../academic/models/Program");
const StudentMaster = require("../../academic/models/StudentMaster");

// Register MentorMaster for StudentMaster.populate().
require("../../academic/models/MentorMaster");

// ============================================================
// AMIOUT ENTERPRISE - HOI SERVICE
//
// HOI = Head of Institute
//
// Access:
// - Only authenticated, verified, active HOI
// - Active HOI / INSTITUTE role assignment required
// - Every student query restricted to assigned institutes
// - Read-only institute student directory and profile
// ============================================================

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const fail = (message, statusCode = 403) => ({
  success: false,
  statusCode,
  message,
});

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isActiveAssignment = (assignment, now) => {
  if (
    !assignment ||
    String(assignment.role).toUpperCase() !== "HOI" ||
    String(assignment.scopeType).toUpperCase() !== "INSTITUTE" ||
    assignment.isActive !== true ||
    !assignment.scopeId
  ) {
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
// SECURE HOI SCOPE RESOLUTION
// ============================================================

const resolveHOIScope = async (facultyId) => {
  if (!mongoose.isValidObjectId(facultyId)) {
    return {
      error: fail("Invalid faculty account.", 401),
    };
  }

  const faculty = await Mentor.findById(facultyId).select(
    "name email employeeId facultyId designation " +
      "mobileNumber phone role roles roleAssignments " +
      "availabilityStatus availabilityUpdatedAt " +
      "isActive isVerified lastLogin",
  );

  if (!faculty) {
    return {
      error: fail("Faculty account not found.", 404),
    };
  }

  if (faculty.isActive !== true || faculty.isVerified !== true) {
    return {
      error: fail("Faculty account is not active or verified."),
    };
  }

  if (typeof faculty.hasRole !== "function" || !faculty.hasRole("HOI")) {
    return {
      error: fail("HOI role authorization required."),
    };
  }

  const now = new Date();

  const assignments = (faculty.roleAssignments || []).filter((assignment) =>
    isActiveAssignment(assignment, now),
  );

  if (!assignments.length) {
    return {
      error: fail("No active HOI institute assignment found."),
    };
  }

  const instituteScopeKeys = new Set(
    assignments.map((assignment) => normalize(assignment.scopeId)),
  );

  const institutes = await Institute.find({
    isActive: true,
    isDeleted: false,
  })
    .select("_id name code")
    .lean();

  const authorizedInstitutes = institutes.filter(
    (institute) =>
      instituteScopeKeys.has(normalize(institute.code)) ||
      instituteScopeKeys.has(normalize(String(institute._id))),
  );

  if (!authorizedInstitutes.length) {
    return {
      error: fail(
        "HOI institute assignment does not match any active Institute. Check Admin faculty scope mapping.",
      ),
    };
  }

  const instituteIds = authorizedInstitutes.map((item) => item._id);

  const programs = await Program.find({
    institute: { $in: instituteIds },
    isActive: true,
    isDeleted: false,
  })
    .select("_id institute code name degree department")
    .lean();

  return {
    faculty,
    scope: {
      institutes: authorizedInstitutes,
      instituteIds,
      programs,
      programIds: programs.map((item) => item._id),
    },
  };
};

// ============================================================
// AUTHORIZED STUDENT QUERY
// ============================================================

const studentFilter = (scope) => ({
  institute: {
    $in: scope.instituteIds,
  },
  program: {
    $in: scope.programIds,
  },
  isActive: true,
  isDeleted: false,
});

const studentFields = [
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
  "primaryMentor",
  "backupMentor",
  "mentorGroup",
  "isRegistered",
  "isActive",
].join(" ");

const populateStudent = (query) =>
  query
    .populate("institute", "name code")
    .populate("program", "name code degree department")
    .populate("primaryMentor", "name email mentorEmail designation facultyId")
    .populate("backupMentor", "name email mentorEmail designation facultyId");

// ============================================================
// GET ALL INSTITUTE STUDENTS
//
// GET /api/v1/hoi/students
// ?page=1&limit=10&search=&semester=&program=
// ============================================================

const getInstituteStudents = async (facultyId, query = {}) => {
  const result = await resolveHOIScope(facultyId);

  if (result.error) {
    return result.error;
  }

  const { scope } = result;

  const baseFilter = studentFilter(scope);

  const filter = {
    ...baseFilter,
  };

  const parsedPage = Number.parseInt(query.page, 10);

  const parsedLimit = Number.parseInt(query.limit, 10);

  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;

  const limit = Number.isFinite(parsedLimit)
    ? Math.min(50, Math.max(1, parsedLimit))
    : 10;

  const search = String(query.search || "").trim();

  if (search.length > 100) {
    return fail("Search cannot exceed 100 characters.", 400);
  }

  if (search) {
    const keyword = escapeRegex(search);

    filter.$or = [
      {
        name: {
          $regex: keyword,
          $options: "i",
        },
      },
      {
        enrollmentNumber: {
          $regex: keyword,
          $options: "i",
        },
      },
      {
        rollNumber: {
          $regex: keyword,
          $options: "i",
        },
      },
      {
        email: {
          $regex: keyword,
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
      return fail("Invalid semester.", 400);
    }

    filter.semester = semester;
  }

  if (query.program && query.program !== "ALL") {
    const requestedProgram = String(query.program);

    if (!mongoose.isValidObjectId(requestedProgram)) {
      return fail("Invalid program ID.", 400);
    }

    const authorized = scope.programIds.some(
      (id) => String(id) === requestedProgram,
    );

    if (!authorized) {
      return fail("Program is outside your authorized institute.");
    }

    filter.program = new mongoose.Types.ObjectId(requestedProgram);
  }

  const [totalStudents, total, students] = await Promise.all([
    StudentMaster.countDocuments(baseFilter),

    StudentMaster.countDocuments(filter),

    populateStudent(
      StudentMaster.find(filter)
        .select(studentFields)
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
    message: "Institute students loaded successfully.",
    data: {
      students,
      totalStudents,
      institutes: scope.institutes,
      programs: scope.programs,
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
// GET SINGLE STUDENT IN AUTHORIZED INSTITUTE
// ============================================================

const getInstituteStudentDetails = async (facultyId, studentId) => {
  if (!mongoose.isValidObjectId(studentId)) {
    return fail("Invalid student ID.", 400);
  }

  const result = await resolveHOIScope(facultyId);

  if (result.error) {
    return result.error;
  }

  const student = await populateStudent(
    StudentMaster.findOne({
      _id: studentId,
      ...studentFilter(result.scope),
    }).select(studentFields),
  ).lean();

  if (!student) {
    return fail("Student not found in your authorized institute.", 404);
  }

  return {
    success: true,
    data: student,
  };
};

// ============================================================
// HOI PROFILE
// ============================================================

const getHOIProfile = async (facultyId) => {
  const result = await resolveHOIScope(facultyId);

  if (result.error) {
    return result.error;
  }

  const { faculty, scope } = result;

  return {
    success: true,
    data: {
      _id: faculty._id,
      name: faculty.name,
      email: faculty.email,
      employeeId: faculty.employeeId || faculty.facultyId,
      designation: faculty.designation,
      mobileNumber: faculty.mobileNumber || faculty.phone,
      role: "HOI",
      roles: faculty.roles,
      isActive: faculty.isActive,
      isVerified: faculty.isVerified,
      availabilityStatus: faculty.availabilityStatus,
      availabilityUpdatedAt: faculty.availabilityUpdatedAt,
      lastLogin: faculty.lastLogin,
      academicScope: {
        institutes: scope.institutes,
        programs: scope.programs,
        totalPrograms: scope.programs.length,
      },
    },
  };
};

module.exports = Object.freeze({
  resolveHOIScope,
  getInstituteStudents,
  getInstituteStudentDetails,
  getHOIProfile,
});
