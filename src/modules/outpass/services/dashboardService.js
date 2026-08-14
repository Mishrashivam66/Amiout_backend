const outpassRepository = require("../repositories/outpassRepository");

const { OUTPASS_STATUS } = require("../constants/outpassStatus");

// ============================================================================
// Student Dashboard
// ============================================================================
const getStudentDashboard = async (studentId) => {
  const [activeOutpass, totalOutpasses, completedOutpasses, rejectedOutpasses] =
    await Promise.all([
      outpassRepository.findActiveOutpass(studentId),

      outpassRepository.countStudentOutpasses(studentId),

      outpassRepository.countStudentByStatus(
        studentId,
        OUTPASS_STATUS.COMPLETED,
      ),

      outpassRepository.countStudentByStatus(
        studentId,
        OUTPASS_STATUS.REJECTED,
      ),
    ]);

  return {
    success: true,

    data: {
      activeOutpass,

      statistics: {
        totalOutpasses,

        completedOutpasses,

        rejectedOutpasses,
      },
    },
  };
};
// ============================================================================
// Mentor Dashboard
// ============================================================================

const getMentorDashboard = async (mentorId) => {
  const [pendingRequests, approvedRequests, rejectedRequests] =
    await Promise.all([
      outpassRepository.countMentorByStatus(mentorId, OUTPASS_STATUS.PENDING),

      outpassRepository.countMentorByStatus(mentorId, OUTPASS_STATUS.APPROVED),

      outpassRepository.countMentorByStatus(mentorId, OUTPASS_STATUS.REJECTED),
    ]);

  return {
    success: true,

    data: {
      pendingRequests,

      approvedRequests,

      rejectedRequests,
    },
  };
};
// ============================================================================
// Export
// ============================================================================

// ============================================================================
// Get Active Outpass
// ============================================================================

const getActiveOutpass = async (studentId) => {
  const activeOutpass = await outpassRepository.findActiveOutpass(studentId);

  return {
    success: true,
    data: activeOutpass,
  };
};
module.exports = Object.freeze({
  getStudentDashboard,
  getMentorDashboard,
  getActiveOutpass,
});
