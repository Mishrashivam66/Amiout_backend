"use strict";

const { validateOutpass } = require("../validators/outpassValidator");
const { OUT_TIME_SLOTS } = require("../constants/timeSlots");

const outpassRepository = require("../repositories/outpassRepository");
const profileRepository = require("../../student/repositories/profileRepository");
const authRepository = require("../../auth/repositories/auth.repository");

const StudentMaster = require("../../academic/models/StudentMaster");
const Institute = require("../../academic/models/Institute");
const Program = require("../../academic/models/Program");
const Outpass = require("../models/Outpass");

const { outpassDTO } = require("../dtos/outpass.dto");
const { createActivity } = require("../../student/services/activityService");
const { sendEmail } = require("../../auth/utils/email");

const {
  sendNotification,
} = require("../../notification/service/notificationService");

const { sendSMS } = require("../../notification/service/smsService");

const { createParentApprovalToken } = require("./parentApprovalService");

// NEW: Centralized authority resolver
const { resolveOutpassAuthority } = require("./outpassEscalationService");

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

// ============================================================
// HELPERS
// ============================================================

const fail = (message) => ({
  success: false,
  message,
});

const clean = (value) => String(value ?? "").trim();

const normalize = (value) => clean(value).toUpperCase();

const sameId = (a, b) =>
  String(a?._id ?? a ?? "") === String(b?._id ?? b ?? "");

const escapeHtml = (value) =>
  clean(value).replace(/[&<>"']/g, (char) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return replacements[char];
  });

// ============================================================
// IST DATE HELPERS
// ============================================================

const getISTDayKey = (date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) => parts.find((item) => item.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
};

const parseOutpassDate = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00+05:30`);

    if (Number.isNaN(date.getTime()) || getISTDayKey(date) !== value) {
      return null;
    }

    return {
      date,
      dayKey: value,
    };
  }

  if (typeof value !== "string" && !(value instanceof Date)) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    date,
    dayKey: getISTDayKey(date),
  };
};

const getISTRange = (dayKey) => {
  const start = new Date(`${dayKey}T00:00:00+05:30`);

  return {
    start,
    end: new Date(start.getTime() + 86400000),
  };
};

const getDayQuery = (dayKey) => {
  const { start, end } = getISTRange(dayKey);

  return {
    $or: [
      {
        outpassDayIST: dayKey,
      },
      {
        outDate: {
          $gte: start,
          $lt: end,
        },
        $or: [
          { outpassDayIST: "" },
          { outpassDayIST: null },
          {
            outpassDayIST: {
              $exists: false,
            },
          },
        ],
      },
    ],
  };
};

// ============================================================
// OPTIONAL EXPECTED IN TIME
// ============================================================

const getSlotMinutes = (slot) => {
  if (Number.isFinite(slot?.totalMinutes)) {
    return slot.totalMinutes;
  }

  if (Number.isFinite(slot?.hour) && Number.isFinite(slot?.minute)) {
    return slot.hour * 60 + slot.minute;
  }

  return null;
};

const getOptionalInTime = (payload = {}) => {
  const raw = payload.inTime;

  if (raw === undefined || raw === null || raw === "") {
    return {
      success: true,
      value: null,
    };
  }

  if (typeof raw !== "string" || raw !== raw.trim()) {
    return fail("Invalid Expected In Time selected.");
  }

  const outSlot = OUT_TIME_SLOTS.find((slot) => slot.value === payload.outTime);

  const inSlot = OUT_TIME_SLOTS.find((slot) => slot.value === raw);

  if (!outSlot || !inSlot) {
    return fail("Invalid Out Time or Expected In Time selected.");
  }

  const outMinutes = getSlotMinutes(outSlot);
  const inMinutes = getSlotMinutes(inSlot);

  if (outMinutes === null || inMinutes === null) {
    return fail("Invalid time slot configuration.");
  }

  if (inMinutes <= outMinutes) {
    return fail("Expected In Time must be later than Out Time.");
  }

  return {
    success: true,
    value: raw,
  };
};

// ============================================================
// GET OFFICIAL STUDENT MASTER
// ============================================================

const getStudentMaster = async (student) => {
  const enrollmentNumber = normalize(
    student.enrollmentNo || student.enrollmentNumber,
  );

  if (!enrollmentNumber) {
    return null;
  }

  return StudentMaster.findOne({
    enrollmentNumber,
    isRegistered: true,
    isActive: true,
    isDeleted: false,
  }).lean();
};

// ============================================================
// DAILY OUTPASS RULES
// Maximum 2 approved trips per IST day.
// Second trip requires verified EXIT + ENTRY.
// ============================================================

const checkDailyOutpassRules = async (studentId, dayKey) => {
  const dayQuery = getDayQuery(dayKey);

  const approvedTrips = await Outpass.find({
    student: studentId,
    isDeleted: false,

    $and: [
      dayQuery,
      {
        $or: [
          {
            approvedAt: {
              $type: "date",
            },
          },
          {
            dailyTripNumber: {
              $in: [1, 2],
            },
          },
          {
            status: {
              $in: [OUTPASS_STATUS.APPROVED, OUTPASS_STATUS.COMPLETED].filter(
                Boolean,
              ),
            },
          },
        ],
      },
    ],
  })
    .select("exitVerified entryVerified " + "exitVerifiedAt entryVerifiedAt")
    .sort({ createdAt: 1 })
    .lean();

  if (approvedTrips.length >= 2) {
    return fail("Maximum 2 approved outpasses are allowed per IST day.");
  }

  const pending = await Outpass.findOne({
    student: studentId,
    isDeleted: false,
    status: OUTPASS_STATUS.PENDING,
    ...dayQuery,
  })
    .select("_id")
    .lean();

  if (pending) {
    return fail("An outpass request is already pending for this date.");
  }

  if (approvedTrips.length === 1) {
    const previous = approvedTrips[0];

    const completedCycle =
      previous.exitVerified === true &&
      previous.entryVerified === true &&
      Boolean(previous.exitVerifiedAt) &&
      Boolean(previous.entryVerifiedAt) &&
      new Date(previous.entryVerifiedAt).getTime() >
        new Date(previous.exitVerifiedAt).getTime();

    if (!completedCycle) {
      return fail(
        "Security must verify your previous EXIT and ENTRY " +
          "before you can apply for the second outpass.",
      );
    }
  }

  return {
    success: true,
  };
};

// ============================================================
// FACULTY NOTIFICATION ROLE
// ============================================================

const getNotificationRole = (assignedRole) => {
  const normalizedRole =
    assignedRole === "BACKUP_MENTOR" ? "MENTOR" : assignedRole;

  return NOTIFICATION_ROLES[normalizedRole] || NOTIFICATION_ROLES.MENTOR;
};

// ============================================================
// PARENT APPROVAL SMS
// ============================================================

const sendParentSMS = async ({ outpass, studentName, parentMobileNumber }) => {
  // Existing AMIOUT frontend environment variable.
  const clientURL = process.env.CLIENT_URL;

  if (!clientURL) {
    throw new Error("CLIENT_URL is missing.");
  }

  const { token } = await createParentApprovalToken(outpass._id);

  const reviewURL = new URL(`/parent/review/${token}`, clientURL).toString();

  const message =
    `AMIOUT: ${studentName} has requested ` +
    `an outpass. Review: ${reviewURL}`;

  await Outpass.updateOne(
    {
      _id: outpass._id,
    },
    {
      $set: {
        parentSMSStatus: "PENDING",
        parentSMSLastAttemptAt: new Date(),
      },
      $inc: {
        parentSMSAttempts: 1,
      },
    },
  );

  // Both providers receive the same interface.
  // Mock stores the message locally in development.
  // Fast2SMS sends through the configured DLT template.
  const result = await sendSMS({
    to: parentMobileNumber,
    message,
    templateVariables: [studentName, reviewURL],
  });

  const status =
    result.provider === "mock"
      ? "NOT_SENT"
      : result.success
        ? "SENT"
        : "FAILED";

  await Outpass.updateOne(
    {
      _id: outpass._id,
    },
    {
      $set: {
        parentSMSStatus: status,
        parentSMSSentAt: status === "SENT" ? new Date() : null,
        parentSMSProviderId: result.messageId || "",
      },
    },
  );

  return {
    provider: result.provider,
    status,
  };
};

// ============================================================
// OPTIONAL PARENT EMAIL
// ============================================================

const notifyParentByEmail = async ({
  outpass,
  parentEmail,
  parentName,
  studentName,
}) => {
  if (!parentEmail) {
    return;
  }

  const html = outpassSubmittedTemplate({
    parentName,
    studentName,
    outpassId: outpass.outpassId,
    destination: outpass.destination,
    outDate: outpass.outDate,
    outTime: outpass.outTime,
    expectedReturn: outpass.expectedReturn,
  });

  await sendEmail({
    to: parentEmail,
    subject: "AMIOUT - Outpass Submitted",
    html,
  });

  await Outpass.updateOne(
    {
      _id: outpass._id,
    },
    {
      $set: {
        parentEmailSent: true,
      },
    },
  );
};

// ============================================================
// FACULTY ASSIGNMENT EMAIL
// Supports Mentor, Backup, Coordinator, HOD, HOI
// ============================================================

const notifyFacultyByEmail = async ({
  outpass,
  faculty,
  studentName,
  assignedRole,
}) => {
  if (!faculty.email) {
    return;
  }

  await Outpass.updateOne(
    {
      _id: outpass._id,
    },
    {
      $set: {
        facultyAssignmentEmailStatus: "PENDING",
        facultyAssignmentEmailLastAttemptAt: new Date(),
      },
    },
  );

  try {
    const html = `
      <div style="font-family:Arial,sans-serif">
        <h2>AMIOUT - New Outpass Request</h2>

        <p>Dear ${escapeHtml(faculty.name)},</p>

        <p>
          A new outpass request has been assigned
          to your dashboard.
        </p>

        <p>
          <strong>Assigned Authority:</strong>
          ${escapeHtml(assignedRole)}
        </p>

        <p>
          <strong>Student:</strong>
          ${escapeHtml(studentName)}
        </p>

        <p>
          <strong>Outpass ID:</strong>
          ${escapeHtml(outpass.outpassId)}
        </p>

        <p>
          <strong>Out Time:</strong>
          ${escapeHtml(outpass.outTime)}
        </p>

        <p>
          <strong>Expected In Time:</strong>
          ${escapeHtml(outpass.inTime || "No planned return")}
        </p>

        <p>
          <strong>Parent Approval:</strong>
          Pending
        </p>

        <p>
          Please log in to AMIOUT to review
          the assigned request.
        </p>
      </div>
    `;

    await sendEmail({
      to: faculty.email,
      subject: `New Outpass: ${outpass.outpassId}`,
      html,
    });

    await Outpass.updateOne(
      {
        _id: outpass._id,
      },
      {
        $set: {
          facultyAssignmentEmailStatus: "SENT",
          facultyAssignmentEmailSentAt: new Date(),
        },
      },
    );
  } catch (error) {
    await Outpass.updateOne(
      {
        _id: outpass._id,
      },
      {
        $set: {
          facultyAssignmentEmailStatus: "FAILED",
        },
      },
    );

    throw error;
  }
};

// ============================================================
// MAIN APPLY OUTPASS SERVICE
// ============================================================

const applyOutpass = async (studentId, payload) => {
  // ==========================================================
  // STEP 1: VALIDATE FORM
  // ==========================================================

  const validation = validateOutpass(payload);

  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.errors,
    };
  }

  // ==========================================================
  // STEP 2: OPTIONAL EXPECTED IN TIME
  // ==========================================================

  const inTimeResult = getOptionalInTime(payload);

  if (!inTimeResult.success) {
    return inTimeResult;
  }

  // ==========================================================
  // STEP 3: AUTHENTICATED STUDENT
  // ==========================================================

  const student = await authRepository.findUserById(studentId);

  if (!student) {
    return fail("Student account not found.");
  }

  // ==========================================================
  // STEP 4: OFFICIAL STUDENT MASTER
  // ==========================================================

  const studentMaster = await getStudentMaster(student);

  if (!studentMaster) {
    return fail("StudentMaster record is missing or registration is inactive.");
  }

  // ==========================================================
  // STEP 5: ACCOUNT HOLD
  // ==========================================================

  const profile = await profileRepository.findByUserId(studentId);

  if (profile?.accountStatus === ACCOUNT_STATUS.HOLD) {
    return fail("Your account is on HOLD. Please contact administration.");
  }

  // ==========================================================
  // STEP 6: STUDENT ACADEMIC DETAILS
  // ==========================================================

  const section = normalize(studentMaster.section);

  const group = normalize(studentMaster.group);

  if (
    !studentMaster.institute ||
    !studentMaster.program ||
    !studentMaster.mentorGroup ||
    !section ||
    !group
  ) {
    return fail("StudentMaster academic mapping is incomplete.");
  }

  if (!studentMaster.primaryMentor) {
    return fail("Primary Mentor mapping is missing.");
  }

  // ==========================================================
  // STEP 7: VERIFY INSTITUTE AND PROGRAM
  // ==========================================================

  const [institute, program] = await Promise.all([
    Institute.findById(studentMaster.institute).lean(),

    Program.findById(studentMaster.program).lean(),
  ]);

  if (
    !institute ||
    !program ||
    institute.isActive === false ||
    institute.isDeleted === true ||
    program.isActive === false ||
    program.isDeleted === true ||
    !sameId(program.institute, institute._id)
  ) {
    return fail("Academic Institute or Program is invalid.");
  }

  // ==========================================================
  // STEP 8: PARENT DETAILS
  // ==========================================================

  const parentName = clean(studentMaster.parentName);

  const parentMobileNumber = clean(studentMaster.parentMobileNumber);

  if (!parentName) {
    return fail("Parent name is missing in StudentMaster.");
  }

  if (!/^[6-9]\d{9}$/.test(parentMobileNumber)) {
    return fail("Valid parent mobile number is missing in StudentMaster.");
  }

  // StudentMaster does not provide a verified
  // parent email. Do not trust client-supplied email.
  const parentEmail = "";

  // ==========================================================
  // STEP 9: AUTOMATIC FACULTY ASSIGNMENT
  //
  // Primary Mentor -> Backup Mentor ->
  // Coordinator -> HOD -> HOI
  // ==========================================================

  const authorityResult = await resolveOutpassAuthority({
    studentMaster,
    now: new Date(),
  });

  if (!authorityResult.success) {
    return fail(authorityResult.message || "No authorized faculty available.");
  }

  const faculty = authorityResult.faculty;

  const assignedRole = authorityResult.assignedRole;

  const assignmentReason = authorityResult.reason;

  const allowedAssignmentRoles = new Set([
    "MENTOR",
    "BACKUP_MENTOR",
    "COORDINATOR",
    "HOD",
    "HOI",
  ]);

  if (!faculty?._id || !allowedAssignmentRoles.has(assignedRole)) {
    return fail("Invalid authorized faculty assignment.");
  }

  // ==========================================================
  // STEP 10: VALIDATE REQUESTED OUTPASS DATE
  // ==========================================================

  const dateInfo = parseOutpassDate(payload.outDate);

  if (!dateInfo) {
    return fail("Invalid outpass date.");
  }

  const selectedDate = dateInfo.date;
  const dayKey = dateInfo.dayKey;

  if (dayKey < getISTDayKey(new Date())) {
    return fail("Past date outpasses are not allowed.");
  }

  // ==========================================================
  // STEP 11: DAILY LIMIT VALIDATION
  // ==========================================================

  const dailyCheck = await checkDailyOutpassRules(studentId, dayKey);

  if (!dailyCheck.success) {
    return dailyCheck;
  }

  // ==========================================================
  // STEP 12: GENERATE OUTPASS ID
  // ==========================================================

  const outpassId = await generateOutpassId();

  // ==========================================================
  // STEP 13: PREPARE DATABASE PAYLOAD
  // ==========================================================

  const outpassPayload = {
    outpassId,

    student: student._id,

    // Legacy mentor field retained for compatibility.
    mentor: faculty._id,

    // Official assignment
    assignedFaculty: faculty._id,
    assignedRole,

    assignmentHistory: [
      {
        toFaculty: faculty._id,
        toRole: assignedRole,
        reason: "INITIAL_ASSIGNMENT",
        remarks:
          `Automatic assignment: ${assignmentReason}. ` +
          "Resolved using official academic scope " +
          "and faculty availability.",
      },
    ],

    // Student academic snapshot
    studentName: studentMaster.name,

    enrollmentNumber: studentMaster.enrollmentNumber,

    branch: clean(student.branch) || clean(program.name),

    course: clean(student.course) || clean(program.name),

    semester: Number(studentMaster.semester),

    section,
    group,

    academicInstitute: studentMaster.institute,

    academicProgram: studentMaster.program,

    academicDepartment: normalize(program.department),

    academicBatch: clean(studentMaster.batch),

    // Parent information
    parentName,
    parentMobileNumber,
    parentEmail,

    parentDecision: {
      status: "PENDING",
    },

    parentSMSStatus: "NOT_SENT",

    // Student request
    reason: clean(payload.reason),

    destination: clean(payload.destination),

    outDate: selectedDate,

    outTime: payload.outTime,

    inTime: inTimeResult.value,

    expectedReturn: undefined,

    // IST daily trip control
    outpassDayIST: dayKey,
    dailyTripNumber: null,

    status: OUTPASS_STATUS.PENDING,

    // QR only after parent + faculty approval
    qrGenerated: false,

    timeline: [appliedEvent(student._id)],
  };

  // ==========================================================
  // STEP 14: CREATE OUTPASS
  // ==========================================================

  const outpass = await outpassRepository.createOutpass(outpassPayload);

  // ==========================================================
  // STEP 15: STUDENT ACTIVITY
  // ==========================================================

  try {
    await createActivity({
      user: student._id,

      title: "Outpass Submitted",

      description: `Outpass ${outpass.outpassId} ` + "submitted successfully.",

      type: "OUTPASS_APPLIED",

      outpass: outpass._id,

      icon: "file-text",

      color: "blue",
    });
  } catch (error) {
    console.error("Outpass activity failed:", error.message);
  }

  // ==========================================================
  // STEP 16: PARENT SMS
  // ==========================================================

  try {
    const smsResult = await sendParentSMS({
      outpass,
      studentName: studentMaster.name,
      parentMobileNumber,
    });

    console.log(
      "Parent SMS processed:",
      outpass.outpassId,
      smsResult.provider,
      smsResult.status,
    );
  } catch (error) {
    console.error("Parent SMS failed:", error.message);

    try {
      await Outpass.updateOne(
        {
          _id: outpass._id,
        },
        {
          $set: {
            parentSMSStatus: "FAILED",
          },
        },
      );
    } catch (updateError) {
      console.error("SMS status update failed:", updateError.message);
    }
  }

  // ==========================================================
  // STEP 17: OPTIONAL PARENT EMAIL
  // ==========================================================

  try {
    await notifyParentByEmail({
      outpass,
      parentEmail,
      parentName,
      studentName: studentMaster.name,
    });
  } catch (error) {
    console.error("Parent email failed:", error.message);
  }

  // ==========================================================
  // STEP 18: STUDENT NOTIFICATION
  // ==========================================================

  try {
    await sendNotification({
      title: "Outpass Submitted",

      message:
        "Your outpass request has been submitted. " +
        "Parent approval is pending.",

      type: NOTIFICATION_TYPES.OUTPASS_SUBMITTED,

      sender: null,

      receiver: student._id,

      role: NOTIFICATION_ROLES.STUDENT,

      relatedOutpass: outpass._id,
    });
  } catch (error) {
    console.error("Student notification failed:", error.message);
  }

  // ==========================================================
  // STEP 19: ASSIGNED FACULTY NOTIFICATION
  // ==========================================================

  try {
    await sendNotification({
      title: "New Outpass Request",

      message:
        `${studentMaster.name} has applied ` +
        "for an outpass. Parent approval is pending.",

      type: NOTIFICATION_TYPES.OUTPASS_SUBMITTED,

      sender: student._id,

      receiver: faculty._id,

      role: getNotificationRole(assignedRole),

      relatedOutpass: outpass._id,
    });
  } catch (error) {
    console.error("Faculty notification failed:", error.message);
  }

  // ==========================================================
  // STEP 20: FACULTY EMAIL
  // ==========================================================

  try {
    await notifyFacultyByEmail({
      outpass,
      faculty,
      studentName: studentMaster.name,
      assignedRole,
    });
  } catch (error) {
    console.error("Faculty email failed:", error.message);
  }

  // ==========================================================
  // STEP 21: RESPONSE
  // ==========================================================

  const latestOutpass = await Outpass.findById(outpass._id);

  return {
    success: true,

    message:
      "Outpass submitted successfully. " +
      `Assigned authority: ${assignedRole}. ` +
      "Parent consent and university approval are pending.",

    data: outpassDTO(latestOutpass || outpass),
  };
};

module.exports = Object.freeze({
  applyOutpass,
});
