"use strict";

const outpassRepository = require("../../outpass/repositories/outpassRepository");
const { getStudentsForRole } = require("./facultyStudentsService");
const profileRepository = require("../../student/repositories/profileRepository");
const { getFacultyDashboardStats } = require("./facultyDashboardStatsService");
const { OUTPASS_STATUS } = require("../../outpass/constants/outpassStatus");
const {
  reassignPendingOutpasses,
} = require("../../outpass/services/outpassReassignmentService");

const Mentor = require("../../auth/models/Mentor");
const MentorMaster = require("../../academic/models/MentorMaster");

const ROLE_SCOPES = {
  MENTOR: "GROUP",
  COORDINATOR: "SECTION",
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
};

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const isAssignmentActive = (assignment, now) => {
  if (!assignment || assignment.isActive !== true) {
    return false;
  }

  const role = normalize(assignment.role);
  const scopeType = normalize(assignment.scopeType);

  if (ROLE_SCOPES[role] !== scopeType) {
    return false;
  }

  if (!String(assignment.scopeId || "").trim()) {
    return false;
  }

  if (assignment.startsAt) {
    const starts = new Date(assignment.startsAt);

    if (Number.isNaN(starts.getTime()) || starts > now) {
      return false;
    }
  }

  if (assignment.expiresAt) {
    const expires = new Date(assignment.expiresAt);

    if (Number.isNaN(expires.getTime()) || expires <= now) {
      return false;
    }
  }

  return true;
};

// ============================================================
// MENTOR DASHBOARD
// ============================================================

const getDashboard = async (mentorId) => {
  return getFacultyDashboardStats(mentorId, "MENTOR");
};

// ============================================================
// COORDINATOR DASHBOARD
// ============================================================

const getCoordinatorDashboard = async (facultyId) => {
  return getFacultyDashboardStats(facultyId, "COORDINATOR");
};

// ============================================================
// PENDING REQUESTS
// ============================================================

const getPendingRequests = async (
  mentorId,
  page = 1,
  limit = 10,
  search = "",
) => {
  const requests = await outpassRepository.findPendingForMentor(
    mentorId,
    page,
    limit,
    search,
  );

  const total = await outpassRepository.countPendingForMentor(mentorId);

  return {
    success: true,
    data: requests,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ============================================================
// APPROVED REQUESTS
// ============================================================

const getApprovedRequests = async (mentorId, page = 1, limit = 10) => {
  const requests = await outpassRepository.findApprovedForMentor(
    mentorId,
    page,
    limit,
  );

  const total = await outpassRepository.countMentorByStatus(
    mentorId,
    OUTPASS_STATUS.APPROVED,
  );

  return {
    success: true,
    data: requests,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ============================================================
// REJECTED REQUESTS
// ============================================================

const getRejectedRequests = async (mentorId, page = 1, limit = 10) => {
  const requests = await outpassRepository.findRejectedForMentor(
    mentorId,
    page,
    limit,
  );

  const total = await outpassRepository.countMentorByStatus(
    mentorId,
    OUTPASS_STATUS.REJECTED,
  );

  return {
    success: true,
    data: requests,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ============================================================
// STUDENTS
// ============================================================

const getStudents = async (mentorId) => {
  return getStudentsForRole(mentorId, "MENTOR");
};

const getCoordinatorStudents = async (facultyId) => {
  return getStudentsForRole(facultyId, "COORDINATOR");
};

const getStudentDetails = async (mentorId, studentId) => {
  const student = await profileRepository.findStudentDetails(
    mentorId,
    studentId,
  );

  if (!student) {
    throw new Error("Student not found.");
  }

  return {
    success: true,
    data: student,
  };
};

// ============================================================
// HISTORY
// ============================================================

const getHistory = async (mentorId, page = 1, limit = 10, search = "") => {
  const requests = await outpassRepository.findHistoryForMentor(
    mentorId,
    page,
    limit,
    search,
  );

  const total = await outpassRepository.countHistoryForMentor(mentorId, search);

  return {
    success: true,
    data: requests,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ============================================================
// OUTPASS DETAILS
// ============================================================

const getOutpassDetails = async (mentorId, outpassId) => {
  const outpass = await outpassRepository.findOutpassDetailsForMentor(
    mentorId,
    outpassId,
  );

  return {
    success: true,
    data: outpass,
  };
};

// ============================================================
// LEGACY UNLOCK
// Existing endpoint preserved.
// ============================================================

const unlockStudent = async (mentorId, studentId) => {
  const student = await profileRepository.findStudentDetails(
    mentorId,
    studentId,
  );

  if (!student) {
    return {
      success: false,
      message: "Student not found.",
    };
  }

  await profileRepository.unlockProfile(studentId, mentorId);

  return {
    success: true,
    message: "Student profile unlocked successfully.",
  };
};

// ============================================================
// GET OFFICIAL MENTOR PROFILE
// Source: MentorMaster + Mentor account.
// ============================================================

const getProfile = async (mentorId) => {
  const mentor = await Mentor.findById(mentorId)
    .select(
      "name email employeeId designation phone department " +
        "role roles roleAssignments " +
        "isActive isVerified availabilityStatus " +
        "availabilityUpdatedAt",
    )
    .lean();

  if (!mentor) {
    return {
      success: false,
      message: "Faculty account not found.",
    };
  }

  if (mentor.isActive !== true) {
    return {
      success: false,
      message: "Faculty account is inactive.",
    };
  }

  // Read only records explicitly linked to this account.
  // Do not link accounts using a matching email alone.

  const masterRecords = await MentorMaster.find({
    mentorUser: mentor._id,
    isActive: true,
    isDeleted: false,
  })
    .sort({
      semester: 1,
      section: 1,
      group: 1,
    })
    .lean();

  // One faculty may have several MentorMaster records
  // for different groups/sections.

  const firstMaster = masterRecords[0] || null;

  const academicAssignments = masterRecords.map((record) => ({
    id: String(record._id),
    roles: Array.isArray(record.roles) ? record.roles : [],
    institute: record.institute || "",
    department: record.department || "",
    program: record.program || "",
    course: record.course || "",
    semester: record.semester ?? null,
    section: record.section || "",
    group: record.group || "",
    coordinatorGroups: record.coordinatorGroups || [],
    coordinator: record.coordinator || "",
    totalStudents: record.totalStudents || 0,
  }));

  const declaredRoles = new Set(
    (mentor.roles || [mentor.role]).map(normalize).filter(Boolean),
  );

  const now = new Date();

  const activeRoleAssignments = (mentor.roleAssignments || [])
    .filter((assignment) => isAssignmentActive(assignment, now))
    .filter((assignment) => declaredRoles.has(normalize(assignment.role)))
    .map((assignment) => ({
      id: String(assignment._id || ""),
      role: normalize(assignment.role),
      scopeType: normalize(assignment.scopeType),
      scopeId: String(assignment.scopeId),
      isActive: true,
      startsAt: assignment.startsAt || null,
      expiresAt: assignment.expiresAt || null,
    }));

  // Display eligible role choices.
  // Actual APIs independently enforce role + academic scope.

  const authorizedRoles =
    mentor.isVerified === true
      ? [...new Set(activeRoleAssignments.map((assignment) => assignment.role))]
      : [];

  return {
    success: true,
    data: {
      faculty: {
        name: firstMaster?.name || mentor.name || "",
        email: firstMaster?.mentorEmail || mentor.email || "",
        facultyId: firstMaster?.facultyId || mentor.employeeId || "",
        designation: firstMaster?.designation || mentor.designation || "",
        institute: firstMaster?.institute || "",
        department: firstMaster?.department || mentor.department || "",
        phone: mentor.phone || "",
      },

      academicAssignments,
      authorizedRoles,
      roleAssignments: activeRoleAssignments,

      account: {
        isActive: mentor.isActive,
        isVerified: mentor.isVerified,
        roles: mentor.roles || [],
      },

      availabilityStatus: mentor.availabilityStatus || null,

      availabilityUpdatedAt: mentor.availabilityUpdatedAt || null,

      source: {
        officialData: "MentorMaster",
        availability: "Mentor",
      },
    },
  };
};

// ============================================================
// LEGACY PROFILE UPDATE
// Kept for compatibility with old controller.
// The new read-only UI does not call it.
// ============================================================

const updateProfile = async (mentorId, data) => {
  const mentor = await Mentor.findById(mentorId);

  if (!mentor) {
    throw new Error("Mentor not found.");
  }

  mentor.phone = data.phone;
  mentor.department = data.department;

  await mentor.save();

  return mentor;
};

// ============================================================
// UPDATE AVAILABILITY
// ============================================================

const updateAvailability = async (mentorId, availabilityStatus) => {
  const nextStatus = String(availabilityStatus || "")
    .trim()
    .toUpperCase();

  if (!["AVAILABLE", "UNAVAILABLE"].includes(nextStatus)) {
    return {
      success: false,
      message: "Invalid availability status.",
    };
  }

  const mentor = await Mentor.findById(mentorId);

  if (!mentor) {
    return {
      success: false,
      message: "Faculty account not found.",
    };
  }

  if (mentor.isActive !== true || mentor.isVerified !== true) {
    return {
      success: false,
      message: "Faculty account is inactive or unverified.",
    };
  }

  const now = new Date();

  mentor.availabilityStatus = nextStatus;
  mentor.availabilityUpdatedAt = now;

  await mentor.save();

  if (nextStatus === "AVAILABLE") {
    return {
      success: true,
      message: "Faculty marked as AVAILABLE.",
      data: {
        availabilityStatus: nextStatus,
        availabilityUpdatedAt: now,
        reassignment: null,
      },
    };
  }

  // Mentor is UNAVAILABLE.
  // Transfer all pending assigned requests.

  try {
    const summary = await reassignPendingOutpasses(mentor._id);

    const complete = summary.unresolved === 0 && summary.skipped === 0;

    return {
      success: true,
      message: complete
        ? "Faculty marked as UNAVAILABLE. Pending reassignment completed."
        : "Faculty marked as UNAVAILABLE. Some requests need reassignment review.",

      data: {
        availabilityStatus: nextStatus,
        availabilityUpdatedAt: now,
        reassignmentComplete: complete,
        reassignment: summary,
      },
    };
  } catch (error) {
    console.error("[AVAILABILITY] Reassignment error:", error);

    return {
      success: true,
      message:
        "Faculty marked as UNAVAILABLE, but pending reassignment requires retry or administrative review.",

      data: {
        availabilityStatus: nextStatus,
        availabilityUpdatedAt: now,
        reassignmentComplete: false,
        reassignment: null,
      },
    };
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  getDashboard,
  getPendingRequests,
  getApprovedRequests,
  getRejectedRequests,
  getStudents,
  getStudentDetails,
  getHistory,
  getOutpassDetails,
  unlockStudent,
  getProfile,
  updateProfile,
  updateAvailability,
  getCoordinatorStudents,
  getCoordinatorDashboard,
});
