const outpassRepository = require("../repositories/outpassRepository");

const { cancelledEvent } = require("../utils/timelineHelper");

const { OUTPASS_STATUS } = require("../constants/outpassStatus");
const { outpassDTO } = require("../dtos/outpass.dto");

const { createActivity } = require("../../student/services/activityService");

const {
  sendNotification,
} = require("../../notification/service/notificationService");

const {
  NOTIFICATION_TYPES,
} = require("../../../shared/types/notificationTypes");

const {
  NOTIFICATION_ROLES,
} = require("../../notification/constants/notificationConstants");

// ============================================================================
// Cancel Outpass
// ============================================================================
const cancelOutpass = async (studentId, outpassId) => {
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
// Ownership Check
// ============================================================================

  if (outpass.student._id.toString() !== studentId.toString()) {
    return {
      success: false,
      message: "You are not authorized to cancel this outpass.",
    };
  }

  // ============================================================================
// Status Validation
// ============================================================================

  if (outpass.status !== OUTPASS_STATUS.PENDING) {
    return {
      success: false,
      message: "Only pending outpass can be cancelled.",
    };
  }

  // ============================================================================
// Cancel Outpass
// ============================================================================

  const updatedOutpass = await outpassRepository.updateOutpass(outpass._id, {
    $set: {
      status: OUTPASS_STATUS.CANCELLED,
      cancelledAt: new Date(),
    },

    $push: {
      timeline: cancelledEvent(studentId),
    },
  });
  try {
    await createActivity({
      user: studentId,
      title: "Outpass Cancelled",
      description: `Outpass ${updatedOutpass.outpassId} cancelled successfully.`,
      type: "OUTPASS_CANCELLED",
      outpass: updatedOutpass._id,
      icon: "x-circle",
      color: "red",
    });
  } catch (error) {
    console.error("Failed to create activity:", error.message);
  }

  // ============================================================================
// Notify Mentor
// ============================================================================

  // ============================================================
  // Notify Mentor
  // ============================================================

  try {
    if (outpass.mentor) {
      await sendNotification({
        title: "Outpass Cancelled",
        message: `${outpass.studentName} has cancelled the outpass request.`,
        type: NOTIFICATION_TYPES.OUTPASS_CANCELLED,
        sender: studentId,
        receiver: outpass.mentor,
        role: NOTIFICATION_ROLES.MENTOR,
        relatedOutpass: updatedOutpass._id,
      });
    }
  } catch (error) {
    console.error("Failed to send mentor notification:", error.message);
  }

  // ============================================================
  // Notify Student
  // ============================================================

  try {
    await sendNotification({
      title: "Outpass Cancelled",
      message: "Your outpass request has been cancelled successfully.",
      type: NOTIFICATION_TYPES.OUTPASS_CANCELLED,
      sender: null,
      receiver: studentId,
      role: NOTIFICATION_ROLES.STUDENT,
      relatedOutpass: updatedOutpass._id,
    });
  } catch (error) {
    console.error("Failed to send student notification:", error.message);
  }

  // ============================================================================
// Success Response
// ============================================================================
  return {
    success: true,
    message: "Outpass cancelled successfully.",
    data: outpassDTO(updatedOutpass),
  };
};

// ============================================================================
// Export Service
// ============================================================================

module.exports = Object.freeze({
  cancelOutpass,
});
