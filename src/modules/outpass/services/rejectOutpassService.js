
const outpassRepository = require("../repositories/outpassRepository");
const { rejectedEvent } = require("../utils/timelineHelper");
const { OUTPASS_STATUS } = require("../constants/outpassStatus");

const {
  sendNotification,
} = require("../../notification/service/notificationService");

const {
  NOTIFICATION_TYPES,
} = require("../../../shared/types/notificationTypes");

const {
  NOTIFICATION_ROLES,
} = require("../../notification/constants/notificationConstants");

const { sendEmail } = require("../../auth/utils/email");
const outpassRejectedTemplate = require("../templates/outpassRejectedTemplate");

// ============================================================================
// Reject Outpass
// ============================================================================

const rejectOutpass = async (mentorId, outpassId, remark = "") => {
  try {
    const outpass = await outpassRepository.findById(outpassId);

    if (!outpass) {
      return {
        success: false,
        message: "Outpass not found.",
      };
    }

    // ============================================================
    // Mentor Authorization
    // ============================================================

    const outpassMentorId = String(outpass.mentor._id || outpass.mentor);

    if (outpassMentorId !== String(mentorId)) {
      return {
        success: false,
        message: "You are not authorized to reject this outpass.",
      };
    }

    // ============================================================
    // Status Validation
    // ============================================================

    if (outpass.status !== OUTPASS_STATUS.PENDING) {
      return {
        success: false,
        message: "Only pending outpass can be rejected.",
      };
    }

    // ============================================================
    // Reject Outpass
    // ============================================================

    const updatedOutpass = await outpassRepository.updateOutpass(outpass._id, {
      $set: {
        status: OUTPASS_STATUS.REJECTED,
        rejectedBy: mentorId,
        rejectedAt: new Date(),
        rejectionRemark: remark?.trim() || "",
      },

      $push: {
        timeline: rejectedEvent(mentorId, remark),
      },
    });

    // ============================================================
    // Student Notification
    // ============================================================

    try {
      await sendNotification({
        title: "Outpass Rejected",
        message: "Your outpass request has been rejected by your mentor.",
        type: NOTIFICATION_TYPES.OUTPASS_REJECTED,
        sender: mentorId,
        receiver: outpass.student,
        role: NOTIFICATION_ROLES.STUDENT,
        relatedOutpass: outpass._id,
      });
    } catch (error) {
      console.error("Notification Error:", error);
    }

    // ============================================================
    // Parent Email
    // ============================================================

    try {
      if (outpass.parentEmail?.trim()) {
        const html = outpassRejectedTemplate({
          parentName: outpass.parentName,
          studentName: outpass.studentName,
          outpassId: outpass.outpassId,
          destination: outpass.destination,
          outDate: outpass.outDate,
          outTime: outpass.outTime,
          expectedReturn: outpass.expectedReturn,
          mentorRemark: remark?.trim() || "",
        });

        await sendEmail({
          to: outpass.parentEmail.trim(),
          subject: "Outpass Rejected",
          html,
        });

        await outpassRepository.updateOutpass(outpass._id, {
          $set: {
            parentRejectionEmailSent: true,
          },
        });
      }
    } catch (error) {
      console.error("Email Error:", error);
    }

    return {
      success: true,
      message: "Outpass rejected successfully.",
      data: updatedOutpass,
    };
  } catch (error) {
    console.error("========== REJECT OUTPASS ERROR ==========");
    console.error(error);
    throw error;
  }
};

module.exports = Object.freeze({
  rejectOutpass,
});
