
const outpassRepository = require("../repositories/outpassRepository");

// ============================================================================
// Get Student Outpass History
// ============================================================================
const getStudentHistory = async (studentId, page = 1, limit = 10) => {
  // ============================================================================
// Fetch History
// ============================================================================

  const [history, total] = await Promise.all([
    outpassRepository.getStudentHistory(studentId, page, limit),

    outpassRepository.countStudentHistory(studentId),
  ]);

  // ============================================================================
// Response
// ============================================================================

  return {
    success: true,

    data: history,

    pagination: {
      total,

      page,

      limit,

      totalPages: Math.ceil(total / limit),
    },
  };
};
// ============================================================================
// Get Active Outpass
// ============================================================================

const getActiveOutpass = async (studentId) => {
  const outpass = await outpassRepository.findActiveOutpass(studentId);

  if (!outpass) {
    return {
      success: false,
      message: "No active outpass found.",
    };
  }

  return {
    success: true,
    data: outpass,
  };
};

// ============================================================================
// Get Outpass Details
// ============================================================================

const getOutpassDetails = async (outpassId) => {
  const outpass = await outpassRepository.findById(outpassId);

  if (!outpass) {
    return {
      success: false,
      message: "Outpass not found.",
    };
  }

  return {
    success: true,
    data: outpass,
  };
};

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  getStudentHistory,
  getActiveOutpass,
  getOutpassDetails,
});
