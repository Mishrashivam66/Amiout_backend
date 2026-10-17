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

const PENDING_EMAIL_THRESHOLD = 4;

const ALLOWED_ROLES = new Set([
  "MENTOR",
  "BACKUP_MENTOR",
  "COORDINATOR",
  "HOD",
  "HOI",
]);

// ============================================================
// GENERAL HELPERS
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
  clean(value).replace(/[&<>"']/g, (character) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return map[character];
  });

const normalizeIndianMobile = (value) => {
  const digits = clean(value).replace(/\D/g, "");
  const mobile =
    digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;

  return /^[6-9]\d{9}$/.test(mobile) ? mobile : null;
};

const safeEmail = (value) => {
  const email = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

const formatDateIST = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
};

const getClientURL = () => {
  const raw = clean(process.env.CLIENT_URL || process.env.FRONTEND_URL);

  if (!raw) {
    throw new Error("CLIENT_URL or FRONTEND_URL is missing.");
  }

  const url = new URL(raw);

  if (
    url.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && url.protocol === "http:")
  ) {
    throw new Error("Invalid frontend URL protocol.");
  }

  return url;
};

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

  const value = (type) => parts.find((part) => part.type === type)?.value;

  return `${value("year")}-${value("month")}-${value("day")}`;
};

const parseOutpassDate = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00+05:30`);

    if (Number.isNaN(date.getTime()) || getISTDayKey(date) !== value) {
      return null;
    }

    return { date, dayKey: value };
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
      { outpassDayIST: dayKey },
      {
        outDate: {
          $gte: start,
          $lt: end,
        },
        $or: [
          { outpassDayIST: "" },
          { outpassDayIST: null },
          { outpassDayIST: { $exists: false } },
        ],
      },
    ],
  };
};

// ============================================================
// OPTIONAL EXPECTED RETURN TIME
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
    return { success: true, value: null };
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

  return { success: true, value: raw };
};

// ============================================================
// OFFICIAL STUDENT MASTER
// ============================================================

const getStudentMaster = async (student) => {
  const enrollmentNumber = normalize(
    student.enrollmentNo || student.enrollmentNumber,
  );

  if (!enrollmentNumber) return null;

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
// Second trip requires verified EXIT and ENTRY.
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
          { approvedAt: { $type: "date" } },
          { dailyTripNumber: { $in: [1, 2] } },
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
    .select("exitVerified entryVerified exitVerifiedAt entryVerifiedAt")
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

  return { success: true };
};

// ============================================================
// NOTIFICATION HELPERS
// ============================================================

const getNotificationRole = (assignedRole) => {
  const role = assignedRole === "BACKUP_MENTOR" ? "MENTOR" : assignedRole;

  return NOTIFICATION_ROLES[role] || NOTIFICATION_ROLES.MENTOR;
};

const safeTask = async (label, operation) => {
  try {
    return await operation();
  } catch (error) {
    console.error(`AMIOUT ${label} failed:`, error.message);
    return null;
  }
};

// ============================================================
// PARENT SMS THROUGH SELECTED SMS PROVIDER
// ============================================================

const sendParentSMS = async ({ outpass, studentName, parentMobileNumber }) => {
  const clientURL = getClientURL();

  const { token } = await createParentApprovalToken(outpass._id);

  const reviewURL = new URL(`/parent/review/${token}`, clientURL).toString();

  const message =
    `AMIOUT: ${studentName} has requested an outpass. ` +
    `Review: ${reviewURL}`;

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
      : result.success === true
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
    accepted: status === "SENT",
  };
};

// ============================================================
// STUDENT EMAIL AFTER OUTPASS SUBMISSION
// ============================================================

const notifyStudentByEmail = async ({ student, outpass, smsStatus }) => {
  const email = safeEmail(student.email);

  if (!email) {
    return { sent: false, reason: "EMAIL_UNAVAILABLE" };
  }

  const smsMessage =
    smsStatus === "SENT"
      ? "The parent approval request has been accepted by our SMS gateway for sending to the registered mobile number."
      : smsStatus === "FAILED"
        ? "The parent SMS could not be sent. The outpass request is still saved. Please check your AMIOUT dashboard."
        : "The parent SMS has not been sent. Please check your AMIOUT dashboard.";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033">
      <div style="background:#102f43;padding:24px;color:white;border-radius:12px 12px 0 0">
        <h2 style="margin:0">AMIOUT</h2>
        <p>Smart Outpass Management System</p>
      </div>

      <div style="padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
        <h2 style="color:#087f5b">Outpass Submitted Successfully</h2>

        <p>Dear ${escapeHtml(outpass.studentName)},</p>

        <p>Your outpass request has been successfully submitted.</p>

        <table style="width:100%;border-collapse:collapse">
          <tr><td><b>Outpass ID</b></td><td>${escapeHtml(outpass.outpassId)}</td></tr>
          <tr><td><b>Destination</b></td><td>${escapeHtml(outpass.destination)}</td></tr>
          <tr><td><b>Date</b></td><td>${escapeHtml(formatDateIST(outpass.outDate))}</td></tr>
          <tr><td><b>Out Time</b></td><td>${escapeHtml(outpass.outTime)}</td></tr>
          <tr><td><b>Expected In Time</b></td><td>${escapeHtml(outpass.inTime || "Not specified")}</td></tr>
          <tr><td><b>Faculty Status</b></td><td>PENDING</td></tr>
          <tr><td><b>Parent Status</b></td><td>PENDING</td></tr>
        </table>

        <div style="background:#f0fdf4;padding:15px;margin-top:20px;border-radius:8px">
          <b>Parent SMS Update</b>
          <p>${escapeHtml(smsMessage)}</p>
        </div>

        <p>
          Your QR code will be available in the AMIOUT Student
          Dashboard after the required approval checks are completed.
        </p>

        <p>Regards,<br><b>AMIOUT Team</b></p>
      </div>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: `AMIOUT - Outpass Submitted (${outpass.outpassId})`,
    html,
  });

  return { sent: true };
};

// ============================================================
// FACULTY PENDING REQUESTS EMAIL
// Alert when pending count reaches 4.
// ============================================================

const notifyFacultyPendingThreshold = async ({ faculty, assignedRole }) => {
  const email = safeEmail(faculty.email);

  if (!email) {
    return { sent: false, reason: "EMAIL_UNAVAILABLE" };
  }

  const pendingCount = await Outpass.countDocuments({
    assignedFaculty: faculty._id,
    status: OUTPASS_STATUS.PENDING,
    isDeleted: false,
  });

  // The request that raises the pending count to four
  // triggers an alert. Avoid emailing every new request.
  if (pendingCount !== PENDING_EMAIL_THRESHOLD) {
    return {
      sent: false,
      pendingCount,
      reason: "THRESHOLD_NOT_REACHED",
    };
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
      <h2 style="color:#102f43">AMIOUT - Pending Outpass Alert</h2>

      <p>Dear ${escapeHtml(faculty.name || "Faculty Member")},</p>

      <p>
        You currently have
        <strong>${pendingCount} pending outpass requests</strong>
        assigned to your dashboard.
      </p>

      <p><b>Assigned Role:</b> ${escapeHtml(assignedRole)}</p>

      <p>
        Please log in to AMIOUT and review the requests
        according to the university approval process.
      </p>

      <p>
        Parent approval statuses can be viewed separately
        for each request.
      </p>

      <p>Regards,<br><b>AMIOUT Team</b></p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: "AMIOUT - 4 Pending Outpass Requests",
    html,
  });

  return {
    sent: true,
    pendingCount,
  };
};

// ============================================================
// MAIN APPLY OUTPASS SERVICE
// ============================================================

const applyOutpass = async (studentId, payload) => {
  // STEP 1: VALIDATE FORM

  const validation = validateOutpass(payload);

  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.errors,
    };
  }

  // STEP 2: OPTIONAL EXPECTED IN TIME

  const inTimeResult = getOptionalInTime(payload);

  if (!inTimeResult.success) {
    return inTimeResult;
  }

  // STEP 3: AUTHENTICATED STUDENT

  const student = await authRepository.findUserById(studentId);

  if (!student) {
    return fail("Student account not found.");
  }

  // STEP 4: OFFICIAL STUDENT MASTER

  const studentMaster = await getStudentMaster(student);

  if (!studentMaster) {
    return fail("StudentMaster record is missing or registration is inactive.");
  }

  // STEP 5: ACCOUNT HOLD

  const profile = await profileRepository.findByUserId(studentId);

  if (profile?.accountStatus === ACCOUNT_STATUS.HOLD) {
    return fail("Your account is on HOLD. Please contact administration.");
  }

  // STEP 6: VERIFY ACADEMIC MAPPING

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

  // STEP 7: VERIFY INSTITUTE / PROGRAM

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

  // STEP 8: VERIFIED PARENT MASTER DATA

  const parentName = clean(studentMaster.parentName);

  const parentMobileNumber = normalizeIndianMobile(
    studentMaster.parentMobileNumber,
  );

  if (!parentName) {
    return fail("Parent name is missing in StudentMaster.");
  }

  if (!parentMobileNumber) {
    return fail("Valid parent mobile number is missing in StudentMaster.");
  }

  // Never use unverified email from client request.
  const parentEmail = "";

  // STEP 9: CENTRALIZED AUTHORITY RESOLUTION

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

  if (!faculty?._id || !ALLOWED_ROLES.has(assignedRole)) {
    return fail("Invalid authorized faculty assignment.");
  }

  // STEP 10: OUTPASS DATE

  const dateInfo = parseOutpassDate(payload.outDate);

  if (!dateInfo) {
    return fail("Invalid outpass date.");
  }

  const selectedDate = dateInfo.date;
  const dayKey = dateInfo.dayKey;

  if (dayKey < getISTDayKey(new Date())) {
    return fail("Past date outpasses are not allowed.");
  }

  // STEP 11: DAILY LIMIT

  const dailyCheck = await checkDailyOutpassRules(studentId, dayKey);

  if (!dailyCheck.success) {
    return dailyCheck;
  }

  // STEP 12: GENERATE OUTPASS ID

  const outpassId = await generateOutpassId();

  // STEP 13: DATABASE PAYLOAD

  const outpassPayload = {
    outpassId,

    student: student._id,

    // Legacy mentor compatibility
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

    // Official student snapshot
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

    // Daily trip control
    outpassDayIST: dayKey,
    dailyTripNumber: null,

    status: OUTPASS_STATUS.PENDING,

    // QR generated only after authorized approval.
    qrGenerated: false,

    timeline: [appliedEvent(student._id)],
  };

  // STEP 14: SAVE OUTPASS

  const outpass = await outpassRepository.createOutpass(outpassPayload);

  // STEP 15: CREATE STUDENT ACTIVITY

  await safeTask("student activity", () =>
    createActivity({
      user: student._id,
      title: "Outpass Submitted",
      description: `Outpass ${outpass.outpassId} ` + "submitted successfully.",
      type: "OUTPASS_APPLIED",
      outpass: outpass._id,
      icon: "file-text",
      color: "blue",
    }),
  );

  // STEP 16: PARENT SMS

  let smsStatus = "FAILED";
  let smsProvider = null;

  try {
    const smsResult = await sendParentSMS({
      outpass,
      studentName: studentMaster.name,

      parentMobileNumber,
    });

    smsStatus = smsResult.status;
    smsProvider = smsResult.provider;
  } catch (error) {
    console.error(
      "AMIOUT parent SMS failed:",
      outpass.outpassId,
      error.message,
    );

    await safeTask("SMS status update", () =>
      Outpass.updateOne(
        { _id: outpass._id },
        {
          $set: {
            parentSMSStatus: "FAILED",
          },
        },
      ),
    );
  }

  // STEP 17: STUDENT WEBSITE NOTIFICATION

  const studentNotificationMessage =
    smsStatus === "SENT"
      ? "Your outpass has been submitted. " +
        "Parent approval SMS has been accepted for sending."
      : "Your outpass has been submitted. " +
        "Parent SMS was not sent successfully.";

  await safeTask("student notification", () =>
    sendNotification({
      title: "Outpass Submitted",
      message: studentNotificationMessage,
      type: NOTIFICATION_TYPES.OUTPASS_SUBMITTED,
      sender: null,
      receiver: student._id,
      role: NOTIFICATION_ROLES.STUDENT,
      relatedOutpass: outpass._id,
    }),
  );

  // STEP 18: STUDENT SUBMISSION EMAIL

  await safeTask("student submission email", () =>
    notifyStudentByEmail({
      student,
      outpass,
      smsStatus,
    }),
  );

  // STEP 19: FACULTY DASHBOARD NOTIFICATION

  await safeTask("faculty notification", () =>
    sendNotification({
      title: "New Outpass Request",

      message:
        `${studentMaster.name} has applied ` +
        "for an outpass. Review the parent " +
        "approval status in your dashboard.",

      type: NOTIFICATION_TYPES.OUTPASS_SUBMITTED,

      sender: student._id,
      receiver: faculty._id,
      role: getNotificationRole(assignedRole),
      relatedOutpass: outpass._id,
    }),
  );

  // STEP 20: FACULTY EMAIL ONLY AT 4 PENDING

  await safeTask("faculty pending alert", () =>
    notifyFacultyPendingThreshold({
      faculty,
      assignedRole,
    }),
  );

  // STEP 21: FINAL RESPONSE

  const latestOutpass = await Outpass.findById(outpass._id);

  return {
    success: true,

    message:
      "Outpass submitted successfully. " +
      `Assigned authority: ${assignedRole}. ` +
      "You can track parent and faculty " +
      "approval status on your dashboard.",

    data: outpassDTO(latestOutpass || outpass),
  };
};

module.exports = Object.freeze({
  applyOutpass,
});
