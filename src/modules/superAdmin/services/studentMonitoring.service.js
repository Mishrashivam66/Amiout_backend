"use strict";

const mongoose = require("mongoose");

const StudentMaster = require("../../academic/models/StudentMaster");

const superAdminRepository = require("../repositories/superAdmin.repository");

// ============================================================
// AMIOUT ENTERPRISE - SUPER ADMIN STUDENT MONITORING
//
// READ ONLY
// No student updates, deletion, activation or password changes.
// ============================================================

const makeError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const clean = (value) => (typeof value === "string" ? value.trim() : "");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getBooleanFilter = (value) => {
  const normalized = clean(value).toUpperCase();

  if (!normalized || normalized === "ALL") return null;
  if (
    normalized === "TRUE" ||
    normalized === "ACTIVE" ||
    normalized === "REGISTERED"
  )
    return true;
  if (
    normalized === "FALSE" ||
    normalized === "INACTIVE" ||
    normalized === "UNREGISTERED"
  )
    return false;

  throw makeError("Invalid status filter.");
};

const requireSuperAdmin = async (actorId) => {
  if (!mongoose.isValidObjectId(actorId)) {
    throw makeError("Authentication required.", 401);
  }

  const actor = await superAdminRepository.findSuperAdminById(actorId);

  if (!actor) {
    throw makeError(
      "Only an authorized Super Admin may view university students.",
      403,
    );
  }

  if (actor.mustChangePassword) {
    throw makeError("Change your temporary password before continuing.", 403);
  }

  return actor;
};

const buildStudentFilter = (input = {}) => {
  const filter = { isDeleted: false };

  const search = clean(input.search);

  if (search) {
    if (search.length > 80) {
      throw makeError("Search cannot exceed 80 characters.");
    }

    const pattern = new RegExp(escapeRegex(search), "i");

    filter.$or = [
      { name: pattern },
      { enrollmentNumber: pattern },
      { rollNumber: pattern },
      { email: pattern },
    ];
  }

  for (const key of ["institute", "program"]) {
    const value = clean(input[key]);

    if (!value) continue;

    if (!mongoose.isValidObjectId(value)) {
      throw makeError(`Invalid ${key} identifier.`);
    }

    filter[key] = new mongoose.Types.ObjectId(value);
  }

  const batch = clean(input.batch);
  if (batch) {
    if (batch.length > 40) {
      throw makeError("Invalid batch filter.");
    }
    filter.batch = batch;
  }

  const section = clean(input.section);
  if (section) {
    if (section.length > 20) {
      throw makeError("Invalid section filter.");
    }
    filter.section = section.toUpperCase();
  }

  const group = clean(input.group);
  if (group) {
    if (group.length > 30) {
      throw makeError("Invalid group filter.");
    }
    filter.group = group.toUpperCase();
  }

  const semesterInput = clean(input.semester);

  if (semesterInput) {
    const semester = Number(semesterInput);

    if (!Number.isInteger(semester) || semester < 1 || semester > 30) {
      throw makeError("Invalid semester filter.");
    }

    filter.semester = semester;
  }

  const active = getBooleanFilter(input.isActive);

  if (active !== null) {
    filter.isActive = active;
  }

  const registered = getBooleanFilter(input.isRegistered);

  if (registered !== null) {
    filter.isRegistered = registered;
  }

  return filter;
};

const getStudentLabel = (value, fields) => {
  if (!value || typeof value !== "object") return null;

  for (const field of fields) {
    const label = value[field];
    if (typeof label === "string" && label.trim()) {
      return label.trim();
    }
  }

  return null;
};

const normalizeStudent = (student) => ({
  id: String(student._id),
  name: student.name,
  enrollmentNumber: student.enrollmentNumber,
  rollNumber: student.rollNumber,
  email: student.email || "",
  mobileNumber: student.mobileNumber || "",

  institute: student.institute
    ? {
        id: String(student.institute._id),
        name:
          getStudentLabel(student.institute, [
            "name",
            "instituteName",
            "shortName",
            "code",
          ]) || "Unnamed Institute",
      }
    : null,

  program: student.program
    ? {
        id: String(student.program._id),
        name:
          getStudentLabel(student.program, [
            "name",
            "programName",
            "shortName",
            "code",
          ]) || "Unnamed Program",
      }
    : null,

  batch: student.batch,
  semester: student.semester,
  section: student.section,
  group: student.group || "",

  mentorGroup: student.mentorGroup
    ? {
        id: String(student.mentorGroup._id),
        name:
          getStudentLabel(student.mentorGroup, ["groupName", "name"]) ||
          "Mapped Group",
      }
    : null,

  primaryMentor: student.primaryMentor
    ? {
        id: String(student.primaryMentor._id),
        name:
          getStudentLabel(student.primaryMentor, ["name", "mentorName"]) ||
          "Assigned Mentor",
        email:
          student.primaryMentor.mentorEmail ||
          student.primaryMentor.email ||
          "",
      }
    : null,

  isActive: student.isActive === true,
  isRegistered: student.isRegistered === true,
  createdAt: student.createdAt,
  updatedAt: student.updatedAt,
});

const getStudents = async (actorId, input = {}) => {
  await requireSuperAdmin(actorId);

  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(input.page, 10) || 1),
  );

  const limit = Math.max(
    1,
    Math.min(50, Number.parseInt(input.limit, 10) || 10),
  );

  const filter = buildStudentFilter(input);

  const [total, active, inactive, registered, mapped, records] =
    await Promise.all([
      StudentMaster.countDocuments(filter),

      StudentMaster.countDocuments({
        ...filter,
        isActive: true,
      }),

      StudentMaster.countDocuments({
        ...filter,
        isActive: false,
      }),

      StudentMaster.countDocuments({
        ...filter,
        isRegistered: true,
      }),

      StudentMaster.countDocuments({
        ...filter,
        primaryMentor: { $ne: null },
      }),

      StudentMaster.find(filter)
        .select(
          "name enrollmentNumber rollNumber email mobileNumber " +
            "institute program batch semester section group " +
            "mentorGroup primaryMentor isActive isRegistered " +
            "createdAt updatedAt",
        )
        .populate({
          path: "institute",
          select: "name instituteName shortName code",
        })
        .populate({
          path: "program",
          select: "name programName shortName code",
        })
        .populate({
          path: "mentorGroup",
          select: "groupName name",
        })
        .populate({
          path: "primaryMentor",
          select: "name mentorName mentorEmail email",
        })
        .sort({
          createdAt: -1,
          _id: -1,
        })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

  return {
    students: records.map(normalizeStudent),

    statistics: {
      total,
      active,
      inactive,
      registered,
      mapped,
    },

    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    },
  };
};

// ============================================================
// FILTER OPTIONS
//
// Uses actual Institute / Program references present
// in StudentMaster. No hardcoded institute names.
// ============================================================

const makeOptions = (values, field, labels) => {
  return values
    .filter((record) => record[field])
    .map((record) => {
      const item = record[field];

      return {
        value: String(item._id),
        label: getStudentLabel(item, labels) || String(item._id),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
};

const getStudentFilters = async (actorId) => {
  await requireSuperAdmin(actorId);

  const base = { isDeleted: false };

  const [instituteIds, programIds, semesters, sections, batches] =
    await Promise.all([
      StudentMaster.distinct("institute", base),
      StudentMaster.distinct("program", base),
      StudentMaster.distinct("semester", base),
      StudentMaster.distinct("section", base),
      StudentMaster.distinct("batch", base),
    ]);

  // Populate uses the references defined in StudentMaster.
  const [institutes, programs] = await Promise.all([
    StudentMaster.populate(
      instituteIds.map((id) => ({ institute: id })),
      {
        path: "institute",
        select: "name instituteName shortName code",
      },
    ),

    StudentMaster.populate(
      programIds.map((id) => ({ program: id })),
      {
        path: "program",
        select: "name programName shortName code",
      },
    ),
  ]);

  return {
    institutes: makeOptions(institutes, "institute", [
      "name",
      "instituteName",
      "shortName",
      "code",
    ]),

    programs: makeOptions(programs, "program", [
      "name",
      "programName",
      "shortName",
      "code",
    ]),

    semesters: semesters.filter(Number.isInteger).sort((a, b) => a - b),

    sections: sections.filter(Boolean).sort(),

    batches: batches.filter(Boolean).sort(),
  };
};

/* ============================================================
   SUPER ADMIN - FILTERED STUDENT EXCEL DATA

   Uses the EXACT SAME buildStudentFilter()
   as the University Students dashboard.

   No page / limit applied.
   Every matching student is included, within export limit.
============================================================ */

const getStudentsForExport = async (actorId, input = {}) => {
  await requireSuperAdmin(actorId);

  const filter = buildStudentFilter(input);

  const MAX_EXPORT = 10000;

  const total = await StudentMaster.countDocuments(filter);

  if (total > MAX_EXPORT) {
    throw makeError(
      `This export contains ${total} students. ` +
        `Please narrow the filters to at most ${MAX_EXPORT} students.`,
      413,
    );
  }

  const students = await StudentMaster.find(filter)
    .select(
      "name enrollmentNumber rollNumber email mobileNumber " +
        "institute program batch admissionYear passingYear " +
        "semester section group mentorGroup primaryMentor " +
        "backupMentor isActive isRegistered createdAt",
    )
    .populate({
      path: "institute",
      select: "name instituteName shortName code",
    })
    .populate({
      path: "program",
      select: "name programName shortName code",
    })
    .populate({
      path: "mentorGroup",
      select: "groupName name",
    })
    .populate({
      path: "primaryMentor",
      select: "name mentorName mentorEmail email",
    })
    .populate({
      path: "backupMentor",
      select: "name mentorName mentorEmail email",
    })
    .sort({
      institute: 1,
      program: 1,
      semester: 1,
      section: 1,
      group: 1,
      name: 1,
      _id: 1,
    })
    .lean();

  return {
    students,
    total,
  };
};

module.exports = Object.freeze({
  getStudents,
  getStudentFilters,
  getStudentsForExport,
});
