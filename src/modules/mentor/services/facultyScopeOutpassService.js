"use strict";

const mongoose = require("mongoose");

const Mentor = require("../../auth/models/Mentor");
const Outpass = require("../../outpass/models/Outpass");
const StudentMaster = require("../../academic/models/StudentMaster");
const Institute = require("../../academic/models/Institute");
const Program = require("../../academic/models/Program");

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const normalizeScope = (value) => normalize(value).replace(/\s+/g, "");

const ROLE_SCOPE_TYPES = {
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
};

const failure = (message) => ({
  success: false,
  message,
});

const validAssignment = (assignment, role, now) => {
  if (
    !assignment ||
    assignment.isActive !== true ||
    normalize(assignment.role) !== role ||
    normalize(assignment.scopeType) !== ROLE_SCOPE_TYPES[role] ||
    !String(assignment.scopeId || "").trim()
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

const getScope = async (facultyId, role) => {
  if (!mongoose.isValidObjectId(facultyId) || !ROLE_SCOPE_TYPES[role]) {
    return null;
  }

  const faculty = await Mentor.findById(facultyId).lean();

  if (!faculty || faculty.isActive !== true || faculty.isVerified !== true) {
    return null;
  }

  const declaredRoles = [faculty.role, ...(faculty.roles || [])].map(normalize);

  if (!declaredRoles.includes(role)) {
    return null;
  }

  const now = new Date();

  const assignments = (faculty.roleAssignments || []).filter((item) =>
    validAssignment(item, role, now),
  );

  if (!assignments.length) {
    return null;
  }

  const institutes = await Institute.find({
    isActive: true,
    isDeleted: false,
  })
    .select("_id code")
    .lean();

  const instituteMap = new Map(
    institutes.map((item) => [normalizeScope(item.code), item]),
  );

  const instituteIds = new Map();

  for (const assignment of assignments) {
    const scopeId = normalizeScope(assignment.scopeId);

    if (role === "HOI") {
      const institute = instituteMap.get(scopeId);

      if (institute) {
        instituteIds.set(String(institute._id), institute._id);
      }
    }
  }

  if (role === "HOI") {
    if (!instituteIds.size) return null;

    return {
      role,
      instituteIds: [...instituteIds.values()],
      programIds: [],
    };
  }

  const programs = await Program.find({
    isActive: true,
    isDeleted: false,
    institute: { $in: institutes.map((i) => i._id) },
  })
    .select("_id institute department")
    .lean();

  const programIds = new Map();

  for (const program of programs) {
    const institute = institutes.find(
      (item) => String(item._id) === String(program.institute),
    );

    if (!institute || !program.department) continue;

    const requiredScope = normalizeScope(
      `${institute.code}/${program.department}`,
    );

    const allowed = assignments.some(
      (assignment) => normalizeScope(assignment.scopeId) === requiredScope,
    );

    if (allowed) {
      programIds.set(String(program._id), program._id);
    }
  }

  if (!programIds.size) return null;

  return {
    role,
    instituteIds: [],
    programIds: [...programIds.values()],
  };
};

const buildOutpassFilter = async (scope) => {
  const studentFilter =
    scope.role === "HOI"
      ? { institute: { $in: scope.instituteIds } }
      : { program: { $in: scope.programIds } };

  // Use official StudentMaster mapping rather than
  // trusting potentially stale department strings.
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
        .map((student) => normalize(student.enrollmentNumber))
        .filter(Boolean),
    ),
  ];

  if (!enrollmentNumbers.length) {
    return { _id: { $in: [] } };
  }

  return {
    isDeleted: false,
    enrollmentNumber: { $in: enrollmentNumbers },
  };
};

const listOutpasses = async (facultyId, role, query = {}) => {
  const scope = await getScope(facultyId, role);

  if (!scope) {
    return failure("No authorized academic scope found.");
  }

  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(query.limit, 10) || 10),
  );

  const filter = await buildOutpassFilter(scope);

  const status = normalize(query.status);

  if (status && status !== "ALL") {
    if (
      !["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"].includes(
        status,
      )
    ) {
      return failure("Invalid outpass status.");
    }

    filter.status = status;
  }

  const search = String(query.search || "").trim();

  if (search) {
    if (search.length > 100) {
      return failure("Search cannot exceed 100 characters.");
    }

    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    filter.$or = [
      { enrollmentNumber: { $regex: escaped, $options: "i" } },
      { outpassNumber: { $regex: escaped, $options: "i" } },
    ];
  }

  const [total, outpasses] = await Promise.all([
    Outpass.countDocuments(filter),
    Outpass.find(filter)
      .sort({ createdAt: -1, _id: -1 })
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

const getOutpassDetails = async (facultyId, role, outpassId) => {
  if (!mongoose.isValidObjectId(outpassId)) {
    return failure("Invalid outpass ID.");
  }

  const scope = await getScope(facultyId, role);

  if (!scope) {
    return failure("No authorized academic scope found.");
  }

  const filter = await buildOutpassFilter(scope);

  const outpass = await Outpass.findOne({
    ...filter,
    _id: outpassId,
  }).lean();

  if (!outpass) {
    return failure("Outpass not found or access denied.");
  }

  return {
    success: true,
    data: outpass,
  };
};

module.exports = Object.freeze({
  listOutpasses,
  getOutpassDetails,
});
