"use strict";

const { validateOutpass } = require("../validators/outpassValidator");
const { OUT_TIME_SLOTS } = require("../constants/timeSlots");
const outpassRepository = require("../repositories/outpassRepository");
const profileRepository = require("../../student/repositories/profileRepository");
const authRepository = require("../../auth/repositories/auth.repository");

const StudentMaster = require("../../academic/models/StudentMaster");
const MentorMaster = require("../../academic/models/MentorMaster");
const Mentor = require("../../auth/models/Mentor");
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
  clean(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

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
// OPTIONAL IN TIME VALIDATION
// In Time is planned return, not Security entry time.
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

  // Student is not returning on the same day.
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
// STUDENT MASTER
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
// FACULTY AVAILABILITY
// ============================================================

const getAvailableMentor = async ({
  mentorMasterId,
  studentMaster,
  institute,
  program,
  isBackup = false,
}) => {
  if (!mentorMasterId) {
    return null;
  }

  const mentorMaster = await MentorMaster.findOne({
    _id: mentorMasterId,
    roles: "MENTOR",
    isActive: true,
    isDeleted: false,
  }).lean();

  if (!mentorMaster || !mentorMaster.mentorUser) {
    return null;
  }

  // Verify mapped academic data.
  const sameAcademicScope =
    normalize(mentorMaster.institute) === normalize(institute.code) &&
    normalize(mentorMaster.program) === normalize(program.code) &&
    Number(mentorMaster.semester) === Number(studentMaster.semester) &&
    normalize(mentorMaster.section) === normalize(studentMaster.section);

  if (!sameAcademicScope) {
    return null;
  }

  const studentGroup = normalize(studentMaster.group);

  const mentorGroup = normalize(mentorMaster.group);

  if (!isBackup && mentorGroup !== studentGroup) {
    return null;
  }

  if (isBackup && mentorGroup === studentGroup) {
    return null;
  }

  const faculty = await Mentor.findOne({
    _id: mentorMaster.mentorUser,
    isActive: true,
    isVerified: true,
    availabilityStatus: "AVAILABLE",
    roles: "MENTOR",
  }).lean();

  if (!faculty) {
    return null;
  }

  if (
    clean(faculty.email).toLowerCase() !==
    clean(mentorMaster.mentorEmail).toLowerCase()
  ) {
    return null;
  }

  const now = new Date();

  const hasActiveMentorRole =
    Array.isArray(faculty.roleAssignments) &&
    faculty.roleAssignments.some((assignment) => {
      const startsAt = assignment.startsAt
        ? new Date(assignment.startsAt)
        : null;

      const expiresAt = assignment.expiresAt
        ? new Date(assignment.expiresAt)
        : null;

      return (
        assignment.role === "MENTOR" &&
        assignment.isActive === true &&
        (!startsAt || startsAt <= now) &&
        (!expiresAt || expiresAt > now)
      );
    });

  if (!hasActiveMentorRole) {
    return null;
  }

  return {
    faculty,
    mentorMaster,
    assignmentRole: isBackup ? "BACKUP_MENTOR" : "MENTOR",
  };
};

// ============================================================
// PRIMARY -> BACKUP MENTOR
// ============================================================

const resolveFaculty = async ({ studentMaster, institute, program }) => {
  const primary = await getAvailableMentor({
    mentorMasterId: studentMaster.primaryMentor,
    studentMaster,
    institute,
    program,
    isBackup: false,
  });

  if (primary) {
    return primary;
  }

  if (
    studentMaster.backupMentor &&
    !sameId(studentMaster.primaryMentor, studentMaster.backupMentor)
  ) {
    const backup = await getAvailableMentor({
      mentorMasterId: studentMaster.backupMentor,
      studentMaster,
      institute,
      program,
      isBackup: true,
    });

    if (backup) {
      return backup;
    }
  }

  // Coordinator, HOD and HOI fallback requires
  // separate verified academic-scope resolution.
  return null;
};

// ============================================================
// DAILY OUTPASS RULES
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
    .sort({
      createdAt: 1,
    })
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
        "Security must verify your previous EXIT and ENTRY before you can apply for the second outpass.",
      );
    }
  }

  return {
    success: true,
  };
};

// ============================================================
// PARENT APPROVAL SMS
// ============================================================

const sendParentSMS = async ({ outpass, studentName, parentMobileNumber }) => {
  if (!process.env.FRONTEND_URL) {
    throw new Error("FRONTEND_URL is missing.");
  }

  const { token } = await createParentApprovalToken(outpass._id);

  const reviewURL = new URL(
    `/parent/review/${token}`,
    process.env.FRONTEND_URL,
  ).toString();

  const message =
    `AMIOUT: ${studentName} has requested ` +
    `an outpass. Review: ${reviewURL}`;

  await Outpass.updateOne(
    { _id: outpass._id },
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
    { _id: outpass._id },
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
    { _id: outpass._id },
    {
      $set: {
        parentEmailSent: true,
      },
    },
  );
};

// ============================================================
// FACULTY ASSIGNMENT EMAIL
// ============================================================

const notifyFacultyByEmail = async ({ outpass, faculty, studentName }) => {
  if (!faculty.email) {
    return;
  }

  await Outpass.updateOne(
    { _id: outpass._id },
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
        <h2>AMIOUT - New Outpass</h2>

        <p>Dear ${escapeHtml(faculty.name)},</p>

        <p>
          A new outpass has been assigned
          to your dashboard.
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
          Please log in to AMIOUT
          to review the request.
        </p>
      </div>
    `;

    await sendEmail({
      to: faculty.email,
      subject: `New Outpass: ${outpass.outpassId}`,
      html,
    });

    await Outpass.updateOne(
      { _id: outpass._id },
      {
        $set: {
          facultyAssignmentEmailStatus: "SENT",
          facultyAssignmentEmailSentAt: new Date(),
        },
      },
    );
  } catch (error) {
    await Outpass.updateOne(
      { _id: outpass._id },
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
  // STEP 1: FORM VALIDATION

  const validation = validateOutpass(payload);

  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.errors,
    };
  }

  // STEP 2: OPTIONAL IN TIME

  const inTimeResult = getOptionalInTime(payload);

  if (!inTimeResult.success) {
    return inTimeResult;
  }

  // STEP 3: AUTHENTICATED STUDENT

  const student = await authRepository.findUserById(studentId);

  if (!student) {
    return fail("Student account not found.");
  }

  // STEP 4: STUDENTMASTER

  const studentMaster = await getStudentMaster(student);

  if (!studentMaster) {
    return fail("StudentMaster record is missing or registration is inactive.");
  }

  // STEP 5: ACCOUNT HOLD CHECK
  // No profile lock/completion restriction.

  const profile = await profileRepository.findByUserId(studentId);

  if (profile?.accountStatus === ACCOUNT_STATUS.HOLD) {
    return fail("Your account is on HOLD. Please contact administration.");
  }

  // STEP 6: ACADEMIC DETAILS

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

  // STEP 7: PARENT DETAILS

  const parentName = clean(studentMaster.parentName);

  const parentMobileNumber = clean(studentMaster.parentMobileNumber);

  if (!parentName) {
    return fail("Parent name is missing in StudentMaster.");
  }

  if (!/^[6-9]\d{9}$/.test(parentMobileNumber)) {
    return fail("Valid parent mobile number is missing in StudentMaster.");
  }

  // Parent email is not stored in StudentMaster.
  // Never trust a client-supplied parent email.

  const parentEmail = "";

  // STEP 8: FACULTY ASSIGNMENT

  const facultyAssignment = await resolveFaculty({
    studentMaster,
    institute,
    program,
  });

  if (!facultyAssignment) {
    return fail(
      "Primary and Backup Mentor are unavailable or not authorized. Coordinator/HOD/HOI fallback is not configured yet.",
    );
  }

  const faculty = facultyAssignment.faculty;

  // STEP 9: OUT DATE

  const dateInfo = parseOutpassDate(payload.outDate);

  if (!dateInfo) {
    return fail("Invalid outpass date.");
  }

  const selectedDate = dateInfo.date;
  const dayKey = dateInfo.dayKey;

  if (dayKey < getISTDayKey(new Date())) {
    return fail("Past date outpasses are not allowed.");
  }

  // STEP 10: DAILY OUTPASS LIMIT

  const dailyCheck = await checkDailyOutpassRules(studentId, dayKey);

  if (!dailyCheck.success) {
    return dailyCheck;
  }

  // STEP 11: PREPARE DATABASE PAYLOAD

  const outpassId = await generateOutpassId();

  const outpassPayload = {
    outpassId,

    student: student._id,

    // Legacy mentor reference.
    mentor: faculty._id,

    assignedFaculty: faculty._id,

    assignedRole: facultyAssignment.assignmentRole,

    assignmentHistory: [
      {
        toFaculty: faculty._id,
        toRole: facultyAssignment.assignmentRole,
        reason: "INITIAL_ASSIGNMENT",
        remarks:
          "Assigned automatically using StudentMaster mapping and faculty availability.",
      },
    ],

    // StudentMaster snapshot.
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

    // Parent information from StudentMaster.
    parentName,
    parentMobileNumber,
    parentEmail,

    parentDecision: {
      status: "PENDING",
    },

    parentSMSStatus: "NOT_SENT",

    // Form details.
    reason: clean(payload.reason),

    destination: clean(payload.destination),

    outDate: selectedDate,

    outTime: payload.outTime,

    // NEW: Optional expected campus return.
    inTime: inTimeResult.value,

    // Legacy return field is not required.
    expectedReturn: undefined,

    outpassDayIST: dayKey,

    // Allocate trip number after approval.
    dailyTripNumber: null,

    status: OUTPASS_STATUS.PENDING,

    qrGenerated: false,

    timeline: [appliedEvent(student._id)],
  };

  // STEP 12: CREATE OUTPASS

  const outpass = await outpassRepository.createOutpass(outpassPayload);

  // STEP 13: STUDENT ACTIVITY

  try {
    await createActivity({
      user: student._id,
      title: "Outpass Submitted",
      description: `Outpass ${outpass.outpassId} submitted successfully.`,
      type: "OUTPASS_APPLIED",
      outpass: outpass._id,
      icon: "file-text",
      color: "blue",
    });
  } catch (error) {
    console.error("Outpass activity failed:", error.message);
  }

  // STEP 14: PARENT SMS

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

  // STEP 15: OPTIONAL PARENT EMAIL

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

  // STEP 16: STUDENT NOTIFICATION

  try {
    await sendNotification({
      title: "Outpass Submitted",
      message:
        "Your outpass request has been submitted. Parent approval is pending.",
      type: NOTIFICATION_TYPES.OUTPASS_SUBMITTED,
      sender: null,
      receiver: student._id,
      role: NOTIFICATION_ROLES.STUDENT,
      relatedOutpass: outpass._id,
    });
  } catch (error) {
    console.error("Student notification failed:", error.message);
  }

  // STEP 17: FACULTY NOTIFICATION

  try {
    await sendNotification({
      title: "New Outpass Request",
      message: `${studentMaster.name} has applied for an outpass. Parent approval is pending.`,
      type: NOTIFICATION_TYPES.OUTPASS_SUBMITTED,
      sender: student._id,
      receiver: faculty._id,
      role: NOTIFICATION_ROLES.MENTOR,
      relatedOutpass: outpass._id,
    });
  } catch (error) {
    console.error("Faculty notification failed:", error.message);
  }

  // STEP 18: FACULTY EMAIL

  try {
    await notifyFacultyByEmail({
      outpass,
      faculty,
      studentName: studentMaster.name,
    });
  } catch (error) {
    console.error("Faculty email failed:", error.message);
  }

  // STEP 19: RETURN RESPONSE

  const latestOutpass = await Outpass.findById(outpass._id);

  return {
    success: true,
    message:
      "Outpass submitted successfully. Parent consent and university approval are pending.",
    data: outpassDTO(latestOutpass || outpass),
  };
};

// ============================================================
// EXPORT
// ============================================================

module.exports = Object.freeze({
  applyOutpass,
});
