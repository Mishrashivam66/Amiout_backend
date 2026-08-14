const outpassRepository = require("../repositories/outpassRepository");
const { approvedEvent } = require("../utils/timelineHelper");
const { OUTPASS_STATUS } = require("../constants/outpassStatus");

const {
  sendNotification,
} = require("../../notification/service/notificationService");

const {
  NOTIFICATION_TYPES: SHARED_NOTIFICATION_TYPES,
} = require("../../../shared/types/notificationTypes");

const {
  NOTIFICATION_ROLES,
} = require("../../notification/constants/notificationConstants");

const { sendEmail } = require("../../auth/utils/email");
const outpassApprovedTemplate = require("../templates/outpassApprovedTemplate");

const approveOutpass = async (mentorId, outpassId, remark = "") => {
  try {
    const outpass = await outpassRepository.findById(outpassId);

    if (!outpass) {
      return {
        success: false,
        message: "Outpass not found.",
      };
    }

    if (!outpass.mentor) {
      return {
        success: false,
        message: "Mentor not assigned to this outpass.",
      };
    }

    const outpassMentorId = String(outpass.mentor._id || outpass.mentor);

    if (outpassMentorId !== String(mentorId)) {
      return {
        success: false,
        message: "You are not authorized to approve this outpass.",
      };
    }

    if (outpass.status !== OUTPASS_STATUS.PENDING) {
      return {
        success: false,
        message: "Only pending outpass can be approved.",
      };
    }

    const updatedOutpass = await outpassRepository.updateOutpass(outpass._id, {
      $set: {
        status: OUTPASS_STATUS.APPROVED,
        approvedBy: mentorId,
        approvedAt: new Date(),
        mentorRemark: remark?.trim() || "",
      },
      $push: {
        timeline: approvedEvent(mentorId, remark),
      },
    });

    try {
      await sendNotification({
        title: "Outpass Approved",
        message: "Your outpass request has been approved by your mentor.",
        type: SHARED_NOTIFICATION_TYPES.OUTPASS_APPROVED,
        sender: mentorId,
        receiver: outpass.student,
        role: NOTIFICATION_ROLES.STUDENT,
        relatedOutpass: outpass._id,
      });
    } catch (error) {
      console.error("Notification Error:", error);
    }

    try {
      if (outpass.parentEmail?.trim()) {
        const html = outpassApprovedTemplate({
          parentName: outpass.parentName,
          studentName: outpass.studentName,
          outpassId: outpass.outpassId,
          destination: outpass.destination,
          outDate: outpass.outDate,
          outTime: outpass.outTime,
          expectedReturn: outpass.expectedReturn,
        });

        await sendEmail({
          to: outpass.parentEmail.trim(),
          subject: "Outpass Approved",
          html,
        });
      }
    } catch (error) {
      console.error("Email Error:", error);
    }

    return {
      success: true,
      message: "Outpass approved successfully.",
      data: updatedOutpass,
    };
  } catch (error) {
    console.error("Approve Outpass Error:", error);
    throw error;
  }
};

module.exports = Object.freeze({
  approveOutpass,
});
