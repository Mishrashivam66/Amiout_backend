const { validateOutpass } = require("../validators/outpassValidator");

const outpassRepository = require("../repositories/outpassRepository");

const profileRepository = require("../../student/repositories/profileRepository");

const authRepository = require("../../auth/repositories/auth.repository");

const { outpassDTO } = require("../dtos/outpass.dto");

const { createActivity } = require("../../student/services/activityService");

const { sendEmail } = require("../../auth/utils/email");

const {
  sendNotification,
} = require("../../notification/service/notificationService");

const generateOutpassId = require("../utils/outpassIdGenerator");

const { appliedEvent } = require("../utils/timelineHelper");

const { OUTPASS_STATUS } = require("../constants/outpassStatus");

const { ACCOUNT_STATUS } = require("../../student/constants/studentConstants");

const {
  NOTIFICATION_TYPES,
} = require("../../../shared/types/notificationTypes");

const {
  NOTIFICATION_ROLES,
} = require("../../notification/constants/notificationConstants");

const outpassSubmittedTemplate = require("../templates/outpassSubmittedTemplate");

// ============================================================================
// Apply Outpass
// ============================================================================

const applyOutpass = async (studentId, payload) => {
  // ============================================================
  // Validate Request
  // ============================================================

  const validation = validateOutpass(payload);

  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.errors,
    };
  }

  // ============================================================
  // Student
  // ============================================================

  const student = await authRepository.findUserById(studentId);

  if (!student) {
    return {
      success: false,
      message: "Student not found.",
    };
  }

  // ============================================================
  // Profile
  // ============================================================

  const profile = await profileRepository.findByUserId(studentId);

  if (!profile) {
    return {
      success: false,
      message: "Student profile not found.",
    };
  }

  // ============================================================
  // Profile Completed
  // ============================================================

  if (!profile.profileCompleted) {
    return {
      success: false,
      message: "Complete your profile first.",
    };
  }

  // ============================================================
  // Profile Locked
  // ============================================================

  if (!profile.profileLocked) {
    return {
      success: false,
      message: "Profile is not locked by mentor.",
    };
  }

  // ============================================================
  // Account Hold
  // ============================================================

  if (profile.accountStatus === ACCOUNT_STATUS.HOLD) {
    return {
      success: false,
      message: "Your account is currently on hold.",
    };
  }

  // ============================================================
  // Mentor Mapping
  // ============================================================

  if (!profile.mentor) {
    return {
      success: false,
      message: "Mentor has not been assigned yet.",
    };
  }

  // ============================================================
  // Active Outpass Check
  // ============================================================

  // ============================================================
  // One Outpass Per Day
  // ============================================================

  const selectedDate = new Date(payload.outDate);

  selectedDate.setHours(0, 0, 0, 0);

  const endOfDay = new Date(selectedDate);

  endOfDay.setHours(23, 59, 59, 999);

  const todayOutpass = await outpassRepository.findTodayOutpass(
    studentId,
    selectedDate,
    endOfDay,
  );

  if (todayOutpass) {
    return {
      success: false,
      message: "Only one outpass request is allowed for the selected date.",
    };
  }
  // ============================================================
  // Prepare Outpass Payload
  // ============================================================
  const outpassId = await generateOutpassId();
  const outpassPayload = {
    outpassId,

    student: student._id,
    mentor: profile.mentor,

    studentName: student.name,
    enrollmentNumber: student.enrollmentNo,

    course: student.course,
    branch: student.branch,
    semester: student.semester,

    section: profile.section,
    group: profile.group,

    parentName: profile.parentName,
    parentEmail: profile.parentEmail,
    parentMobileNumber: profile.parentMobileNumber,

    reason: payload.reason.trim(),
    destination: payload.destination.trim(),

    outDate: new Date(payload.outDate),
    outTime: payload.outTime,
    expectedReturn: payload.expectedReturn,

    status: OUTPASS_STATUS.PENDING,

    timeline: [appliedEvent(student._id)],
  };
  // ============================================================
  // Create Outpass
  // ============================================================

  let outpass;

  try {
    outpass = await outpassRepository.createOutpass(outpassPayload);

    await createActivity({
      user: student._id,
      title: "Outpass Submitted",
      description: `Outpass ${outpass.outpassId} submitted successfully.`,
      type: "OUTPASS_APPLIED",
      outpass: outpass._id,
      icon: "file-text",
      color: "blue",
    });
  } catch (err) {
    console.error(err);
    throw err;
  }

  // ============================================================
  // Send Parent Email
  // ============================================================

  try {
    if (profile.parentEmail?.trim()) {
      const emailTemplate = outpassSubmittedTemplate({
        parentName: profile.parentName,
        studentName: student.name,
        outpassId: outpass.outpassId,
        destination: outpass.destination,
        outDate: outpass.outDate,
        outTime: outpass.outTime,
        expectedReturn: outpass.expectedReturn,
      });

      await sendEmail({
        to: profile.parentEmail.trim(),
        subject: "Outpass Request Submitted",
        html: emailTemplate,
      });

      await outpassRepository.updateOutpass(outpass._id, {
        $set: {
          parentEmailSent: true,
        },
      });
    }
  } catch (error) {
    console.error("Failed to send parent email:", error.message);
  }

  // ============================================================
  // Send Student Notification
  // ============================================================

  try {
    await sendNotification({
      title: "Outpass Submitted",
      message:
        "Your outpass request has been submitted successfully and is awaiting mentor approval.",
      type: NOTIFICATION_TYPES.OUTPASS_SUBMITTED,
      sender: null,
      receiver: student._id,
      role: NOTIFICATION_ROLES.STUDENT,
      relatedOutpass: outpass._id,
    });
  } catch (error) {
    console.error("Failed to send student notification:", error.message);
  }

  // ============================================================
  // Send Mentor Notification
  // ============================================================

  try {
    await sendNotification({
      title: "New Outpass Request",
      message: `${student.name} has submitted a new outpass request.`,
      type: NOTIFICATION_TYPES.OUTPASS_SUBMITTED,
      sender: student._id,
      receiver: profile.mentor,
      role: NOTIFICATION_ROLES.MENTOR,
      relatedOutpass: outpass._id,
    });
  } catch (error) {
    console.error("Failed to send mentor notification:", error.message);
  }

  // ============================================================
  // Success Response
  // ============================================================

  return {
    success: true,
    message: "Outpass request submitted successfully.",
    data: outpassDTO(outpass),
  };
};

// ============================================================
// Export Service
// ============================================================

module.exports = Object.freeze({
  applyOutpass,
});
