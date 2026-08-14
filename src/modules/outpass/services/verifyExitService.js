const outpassRepository = require("../repositories/outpassRepository");

const { OUTPASS_STATUS } = require("../constants/outpassStatus");
const { exitVerifiedEvent } = require("../utils/timelineHelper");
const { outpassDTO } = require("../dtos/outpass.dto");

const { createActivity } = require("../../student/services/activityService");

const verifyExit = async (outpassId) => {
  // ============================================================================
// Find Outpass
// ============================================================================

  const outpass = await outpassRepository.findById(outpassId);

  if (!outpass) {
    return {
      success: false,
      message: "Outpass not found.",
    };
  }

  // ============================================================================
// Status Validation
// ============================================================================

  if (outpass.status !== OUTPASS_STATUS.APPROVED) {
    return {
      success: false,
      message: "Only approved outpass can be verified.",
    };
  }

  // ============================================================================
// Verify Exit
// ============================================================================
const updatedOutpass = await outpassRepository.updateOutpass(outpassId, {
  $set: {
    status: OUTPASS_STATUS.EXITED,
    exitVerified: true,
    exitVerifiedAt: new Date(),
  },

  $push: {
    timeline: exitVerifiedEvent(null),
  },
});
  // ============================================================================
// Activity
// ============================================================================

  try {
    await createActivity({
      user: outpass.student,
      title: "Exit Verified",
      description: `Outpass ${updatedOutpass.outpassId} exit verified successfully.`,
      type: "EXIT_VERIFIED",
      outpass: updatedOutpass._id,
      icon: "shield-check",
      color: "green",
    });
  } catch (error) {
    console.error("Activity Error:", error.message);
  }

  // ============================================================================
// Success
// ============================================================================

  return {
    success: true,
    message: "Exit verified successfully.",
    data: outpassDTO(updatedOutpass),
  };
};

module.exports = Object.freeze({
  verifyExit,
});
