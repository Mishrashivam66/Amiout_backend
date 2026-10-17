"use strict";

const mongoose = require("mongoose");

const Outpass = require("../../outpass/models/Outpass");

const { getStudentsForRole } = require("./facultyStudentsService");

// ============================================================
// HELPERS
// ============================================================

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const sameId = (left, right) => String(left ?? "") === String(right ?? "");

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const clamp = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, parsed))
    : fallback;
};

// ============================================================
// COORDINATOR AUTHORIZED STUDENT SCOPE
// ============================================================

const getAuthorizedScope = async (facultyId) => {
  if (!mongoose.isValidObjectId(facultyId)) {
    return {
      success: false,
      message: "Invalid faculty account.",
      filters: [],
    };
  }

  const result = await getStudentsForRole(facultyId, "COORDINATOR");

  if (result?.success !== true) {
    return {
      success: false,
      message: result?.message || "Coordinator academic scope is unavailable.",
      filters: [],
    };
  }

  const seen = new Set();
  const filters = [];

  for (const student of result.data || []) {
    const enrollmentNumber = normalize(student.enrollmentNumber);

    const section = normalize(student.section);
    const group = normalize(student.group);
    const semester = Number(student.semester);

    if (!enrollmentNumber || !section || !group || !Number.isFinite(semester)) {
      continue;
    }

    const key = [enrollmentNumber, semester, section, group].join("/");

    if (seen.has(key)) continue;

    seen.add(key);

    filters.push({
      enrollmentNumber,
      semester,
      section,
      group,
    });
  }

  return {
    success: true,
    filters,
  };
};

// ============================================================
// SAFE OUTPASS FIELDS
// ============================================================

const exposedFields = [
  "outpassId",
  "student",
  "studentName",
  "enrollmentNumber",
  "semester",
  "section",
  "group",
  "course",
  "branch",
  "reason",
  "destination",
  "outDate",
  "outTime",
  "inTime",
  "createdAt",
  "updatedAt",
  "status",
  "assignedFaculty",
  "assignedRole",
  "approvedByFaculty",
  "approvedAuthorityRole",
  "approvedAt",
  "parentDecision.status",
  "parentSMSStatus",
  "mentor",
  "parentName",
  "parentMobileNumber",
  "parentEmail",
  "assignmentHistory",
  "timeline",
  "exitVerifiedAt",
  "entryVerifiedAt",
].join(" ");

// ============================================================
// COORDINATOR APPROVAL FLAG
// ============================================================

const withActionFlag = (outpass, facultyId) => {
  const row =
    typeof outpass.toObject === "function" ? outpass.toObject() : outpass;

  const assigned =
    normalize(row.status) === "PENDING" &&
    normalize(row.assignedRole) === "COORDINATOR" &&
    sameId(row.assignedFaculty, facultyId) &&
    normalize(row.parentDecision?.status || "PENDING") !== "REJECTED";

  // UI hint only.
  // Backend approval service must independently check
  // current role, academic scope, availability and escalation.
  return {
    ...row,
    canCurrentFacultyApprove: assigned,
  };
};

// ============================================================
// SHARED SECTION-SCOPED QUERY
// ============================================================

const listCoordinatorOutpasses = async (
  facultyId,
  { page = 1, limit = 10, search = "", history = false } = {},
) => {
  const scope = await getAuthorizedScope(facultyId);

  if (!scope.success) {
    return {
      success: false,
      message: scope.message,
    };
  }

  const safePage = clamp(page, 1, 1, 100000);
  const safeLimit = clamp(limit, 10, 1, 100);

  if (!scope.filters.length) {
    return {
      success: true,
      data: [],
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: 0,
        totalPages: 0,
      },
    };
  }

  const conditions = [
    { isDeleted: false },
    { $or: scope.filters },
    history ? { status: { $ne: "PENDING" } } : { status: "PENDING" },
  ];

  const term = String(search ?? "")
    .trim()
    .slice(0, 100);

  if (term) {
    const expression = new RegExp(escapeRegex(term), "i");

    conditions.push({
      $or: [
        { studentName: expression },
        { enrollmentNumber: expression },
        { outpassId: expression },
        { destination: expression },
      ],
    });
  }

  const filter = {
    $and: conditions,
  };

  const [rows, total] = await Promise.all([
    Outpass.find(filter)
      .select(exposedFields)
      .sort({ createdAt: -1, _id: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),

    Outpass.countDocuments(filter),
  ]);

  return {
    success: true,
    data: rows.map((row) => withActionFlag(row, facultyId)),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
};

// ============================================================
// COORDINATOR PENDING REQUESTS
// ============================================================

const getCoordinatorPendingRequests = async (
  facultyId,
  page = 1,
  limit = 10,
  search = "",
) => {
  return listCoordinatorOutpasses(facultyId, {
    page,
    limit,
    search,
    history: false,
  });
};

// ============================================================
// COORDINATOR HISTORY
// ============================================================

const getCoordinatorHistory = async (
  facultyId,
  page = 1,
  limit = 10,
  search = "",
) => {
  return listCoordinatorOutpasses(facultyId, {
    page,
    limit,
    search,
    history: true,
  });
};

// ============================================================
// COORDINATOR OUTPASS DETAILS
// ============================================================

const getCoordinatorOutpassDetails = async (facultyId, outpassId) => {
  if (!mongoose.isValidObjectId(outpassId)) {
    return {
      success: false,
      message: "Invalid outpass ID.",
    };
  }

  const scope = await getAuthorizedScope(facultyId);

  if (!scope.success) {
    return {
      success: false,
      message: scope.message,
    };
  }

  if (!scope.filters.length) {
    return {
      success: false,
      message: "Outpass not found in your authorized scope.",
    };
  }

  const outpass = await Outpass.findOne({
    _id: outpassId,
    isDeleted: false,
    $or: scope.filters,
  })
    .select(exposedFields)
    .lean();

  if (!outpass) {
    return {
      success: false,
      message: "Outpass not found in your authorized scope.",
    };
  }

  return {
    success: true,
    data: withActionFlag(outpass, facultyId),
  };
};

// ============================================================
// EXPORT ALL THREE FUNCTIONS
// ============================================================

module.exports = Object.freeze({
  getCoordinatorPendingRequests,
  getCoordinatorHistory,
  getCoordinatorOutpassDetails,
});
