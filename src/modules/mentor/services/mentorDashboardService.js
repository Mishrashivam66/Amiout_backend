const outpassRepository = require("../../outpass/repositories/outpassRepository");
const profileRepository = require("../../student/repositories/profileRepository");

const { OUTPASS_STATUS } = require("../../outpass/constants/outpassStatus");
const Mentor = require("../../auth/models/Mentor");
// ============================================================================
// Mentor Dashboard
// ============================================================================
const getDashboard = async (mentorId) => {
  const totalStudents = await profileRepository.countStudentsByMentor(mentorId);

  const pending = await outpassRepository.countPendingForMentor(mentorId);

  const approved = await outpassRepository.countMentorByStatus(
    mentorId,
    OUTPASS_STATUS.APPROVED,
  );

  const rejected = await outpassRepository.countMentorByStatus(
    mentorId,
    OUTPASS_STATUS.REJECTED,
  );

  const recentRequests = await outpassRepository.findRecentForMentor(
    mentorId,
    5,
  );

  return {
    success: true,
    data: {
      totalStudents,
      pendingOutpasses: pending,
      approvedToday: approved,
      rejectedToday: rejected,
      recentRequests,
    },
  };
};

// ============================================================================
// Pending Requests
// ============================================================================
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

// ============================================================================
// Approved Requests
// ============================================================================
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

// ============================================================================
// Rejected Requests
// ============================================================================
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

const getStudents = async (mentorId) => {
  const students = await profileRepository.findStudentsByMentor(mentorId);

  return {
    success: true,
    data: students,
  };
};
// ============================================================================
// Export
// ============================================================================
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
// ============================================================================
// Mentor History
// ============================================================================
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

// ============================================================================
// Outpass Details
// ============================================================================

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

const updateProfile = async (mentorId, data) => {
  const mentor = await Mentor.findById(mentorId);

  if (!mentor) {
    throw new Error("Mentor not found");
  }

  mentor.phone = data.phone;
  mentor.department = data.department;

  await mentor.save();

  return mentor;
};

// ============================================================================
// Update Mentor Availability
// ============================================================================

const updateAvailability = async (mentorId, availabilityStatus) => {
  if (!["AVAILABLE", "UNAVAILABLE"].includes(availabilityStatus)) {
    return {
      success: false,
      message: "Invalid availability status.",
    };
  }

  const mentor = await Mentor.findById(mentorId);

  if (!mentor) {
    return {
      success: false,
      message: "Mentor not found.",
    };
  }

  mentor.availabilityStatus = availabilityStatus;
  mentor.availabilityUpdatedAt = new Date();

  await mentor.save();

  return {
    success: true,
    message: `Mentor marked as ${availabilityStatus}.`,
    data: {
      availabilityStatus: mentor.availabilityStatus,
      availabilityUpdatedAt: mentor.availabilityUpdatedAt,
    },
  };
};

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
  updateProfile,
  updateAvailability,
});
