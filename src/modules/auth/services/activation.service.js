"use strict";

const crypto = require("node:crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const Mentor = require("../models/Mentor");

const MentorMaster = require("../../academic/models/MentorMaster");
const StudentMaster = require("../../academic/models/StudentMaster");
const User = require("../models/User");
const {
  findAccountByEmail,
  normalizeEmail,
} = require("../repositories/commonAuth.repository");

const {
  sendEmail,
  generateAccountActivationTemplate,
  generateTemporaryPasswordTemplate,
  generateWelcomeTemplate,
} = require("../utils/email");

const { AUTH_CONSTANTS } = require("../constants");

// ==========================================
// CONFIGURATION
// ==========================================

const OTP_EXPIRY_MINUTES = Number(AUTH_CONSTANTS.OTP_EXPIRY_MINUTES) || 10;

const OTP_EXPIRY_MS = OTP_EXPIRY_MINUTES * 60 * 1000;

const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const LOCK_MS = 60 * 1000;

const OTP_SECRET = process.env.ACTIVATION_OTP_SECRET;

if (!OTP_SECRET) {
  throw new Error("ACTIVATION_OTP_SECRET is required.");
}

const ROLE_SCOPES = Object.freeze({
  MENTOR: "GROUP",
  COORDINATOR: "SECTION",
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
});

// ==========================================
// ACTIVATION OTP MODEL
// ==========================================

const activationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    otpHash: {
      type: String,
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    lastSentAt: {
      type: Date,
      required: true,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    processingUntil: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

activationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ActivationOTP =
  mongoose.models.ActivationOTP ||
  mongoose.model("ActivationOTP", activationSchema);

// ==========================================
// HELPERS
// ==========================================

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const clean = (value) => String(value ?? "").trim();

const upper = (value) => clean(value).toUpperCase();

const validateEmail = (email) => {
  const normalized = normalizeEmail(email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw createError("Enter a valid email address.");
  }

  return normalized;
};

const generateOtp = () => String(crypto.randomInt(100000, 1000000));

const hashOtp = (email, otp) =>
  crypto
    .createHmac("sha256", OTP_SECRET)
    .update(`${email}:${otp}`)
    .digest("hex");

const generateTemporaryPassword = () =>
  `Am@9${crypto.randomBytes(18).toString("base64url")}`;

const getLoginUrl = () => {
  const base =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    "http://localhost:5173";

  return `${base.replace(/\/$/, "")}/login`;
};

const unique = (values) => [...new Set(values.filter(Boolean))];

// ==========================================
// FACULTY MASTER LOOKUP
// ==========================================

const getFacultyMasterRecords = async (email) => {
  return MentorMaster.find({
    mentorEmail: email,
    isActive: true,
    isDeleted: false,
  }).lean();
};

// ==========================================
// BUILD FACULTY ROLE ASSIGNMENTS
// ==========================================

const buildFacultyAssignments = (records) => {
  if (!records.length) {
    throw createError("No approved faculty academic record found.", 404);
  }

  const facultyIds = unique(records.map((record) => upper(record.facultyId)));

  if (facultyIds.length !== 1) {
    throw createError(
      "Faculty master contains missing or conflicting Faculty IDs.",
      409,
    );
  }

  const facultyId = facultyIds[0];

  const assignments = [];
  const assignmentKeys = new Set();
  const allRoles = new Set();

  for (const record of records) {
    const institute = upper(record.institute);
    const department = upper(record.department);
    const program = upper(record.program);
    const semester = Number(record.semester);
    const section = upper(record.section);
    const group = upper(record.group);

    const roles = unique((record.roles || []).map(upper));

    if (!roles.length) {
      throw createError("Faculty role is missing in master record.", 409);
    }

    for (const role of roles) {
      if (!ROLE_SCOPES[role]) {
        throw createError(`Unsupported faculty role: ${role}`, 409);
      }

      let scopeId;

      if (role === "MENTOR") {
        if (!institute || !program || !semester || !section || !group) {
          throw createError("Mentor academic mapping is incomplete.", 409);
        }

        scopeId = `${institute}/${program}/${semester}/${section}/${group}`;
      }

      if (role === "COORDINATOR") {
        if (
          !institute ||
          !program ||
          !semester ||
          !section ||
          !Array.isArray(record.coordinatorGroups) ||
          record.coordinatorGroups.length === 0
        ) {
          throw createError("Coordinator academic mapping is incomplete.", 409);
        }

        scopeId = `${institute}/${program}/${semester}/${section}`;
      }

      if (role === "HOD") {
        if (!institute || !department) {
          throw createError("HOD department mapping is incomplete.", 409);
        }

        scopeId = `${institute}/${department}`;
      }

      if (role === "HOI") {
        if (!institute) {
          throw createError("HOI institute mapping is incomplete.", 409);
        }

        scopeId = institute;
      }

      const scopeType = ROLE_SCOPES[role];
      const key = `${role}:${scopeType}:${scopeId}`;

      allRoles.add(role);

      if (assignmentKeys.has(key)) {
        continue;
      }

      assignmentKeys.add(key);

      assignments.push({
        role,
        scopeType,
        scopeId,
        isActive: true,
      });
    }
  }

  if (!assignments.length) {
    throw createError("No valid faculty academic assignments found.", 409);
  }

  const roles = [...allRoles];

  return {
    facultyId,
    roles,
    roleAssignments: assignments,
  };
};

// ==========================================
// CHECK ELIGIBLE ACCOUNT
// ==========================================

const getEligibleAccount = async (email) => {
  const normalizedEmail = validateEmail(email);

  // ==========================================
  // 1. CHECK EXISTING LOGIN ACCOUNT
  // ==========================================

  const existing = await findAccountByEmail(normalizedEmail);

  if (existing) {
    if (!["STUDENT", "FACULTY"].includes(existing.accountType)) {
      throw createError(
        "This email is already associated with another account.",
        409,
      );
    }

    if (existing.account.isVerified === true) {
      throw createError("Account already verified. Please login.", 409);
    }

    if (existing.account.isActive === false) {
      throw createError("Account disabled. Contact administrator.", 403);
    }

    // ========================================
    // EXISTING STUDENT ACCOUNT
    // ========================================

    if (existing.accountType === "STUDENT") {
      const studentMaster = await StudentMaster.findOne({
        email: normalizedEmail,
        isActive: true,
        isDeleted: false,
      }).lean();

      if (!studentMaster) {
        throw createError("Student is not eligible for activation.", 403);
      }

      // Prevent mismatched student identity
      const accountEnrollment = upper(
        existing.account.enrollmentNumber || existing.account.enrollmentNo,
      );

      if (
        accountEnrollment &&
        accountEnrollment !== upper(studentMaster.enrollmentNumber)
      ) {
        throw createError(
          "Student account and master enrollment mismatch.",
          409,
        );
      }

      return {
        ...existing,
        studentMaster,
      };
    }

    // ========================================
    // EXISTING FACULTY ACCOUNT
    // ========================================

    if (existing.accountType === "FACULTY") {
      const facultyRecords = await getFacultyMasterRecords(normalizedEmail);

      const facultyMapping = buildFacultyAssignments(facultyRecords);

      if (upper(existing.account.employeeId) !== facultyMapping.facultyId) {
        throw createError("Faculty account and master ID mismatch.", 409);
      }

      return {
        ...existing,
        facultyRecords,
        facultyMapping,
      };
    }
  }

  // ==========================================
  // 2. CHECK NEW STUDENT IN STUDENT MASTER
  // ==========================================

  const studentMaster = await StudentMaster.findOne({
    email: normalizedEmail,
    isActive: true,
    isDeleted: false,
  }).lean();

  if (studentMaster) {
    if (studentMaster.isRegistered === true) {
      throw createError(
        "Student is already registered. Please login or recover your account.",
        409,
      );
    }

    if (!studentMaster.enrollmentNumber) {
      throw createError(
        "Student enrollment number is missing in StudentMaster.",
        409,
      );
    }

    return {
      accountType: "STUDENT",
      isNewStudent: true,

      account: {
        name: studentMaster.name,
        email: normalizedEmail,
        role: "STUDENT",
        isVerified: false,
        isActive: true,
      },

      studentMaster,
    };
  }

  // ==========================================
  // 3. CHECK NEW FACULTY IN MENTOR MASTER
  // ==========================================

  const facultyRecords = await getFacultyMasterRecords(normalizedEmail);

  if (!facultyRecords.length) {
    throw createError("No eligible Student or Faculty account found.", 404);
  }

  const facultyMapping = buildFacultyAssignments(facultyRecords);

  // ==========================================
  // 4. PREVENT DUPLICATE FACULTY ID
  // ==========================================

  const existingFacultyId = await Mentor.findOne({
    employeeId: facultyMapping.facultyId,
  });

  if (existingFacultyId) {
    throw createError("Faculty ID already belongs to another account.", 409);
  }

  // ==========================================
  // 5. RETURN NEW FACULTY ELIGIBILITY
  // ==========================================

  return {
    accountType: "FACULTY",
    isNewFaculty: true,

    account: {
      name: facultyRecords[0].mentorName || facultyRecords[0].name,

      email: normalizedEmail,
      role: facultyMapping.roles[0],
      isVerified: false,
      isActive: true,
    },

    facultyRecords,
    facultyMapping,
  };
};

// ==========================================
// REQUEST ACTIVATION OTP
// ==========================================

const requestActivationOtpService = async (email) => {
  // ==========================================
  // 1. VALIDATE EMAIL
  // ==========================================

  const normalizedEmail = validateEmail(email);

  // Supports:
  // - Existing unverified Student
  // - Existing unverified Faculty
  // - New Student from StudentMaster
  // - New Faculty from MentorMaster

  const { account, accountType } = await getEligibleAccount(normalizedEmail);

  // ==========================================
  // 2. CHECK OTP COOLDOWN
  // ==========================================

  const now = new Date();

  const existingOtp = await ActivationOTP.findOne({
    email: normalizedEmail,
  });

  if (existingOtp?.lastSentAt) {
    const elapsed = now.getTime() - new Date(existingOtp.lastSentAt).getTime();

    if (elapsed < RESEND_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);

      throw createError(
        `Please wait ${remainingSeconds} seconds before requesting another OTP.`,
        429,
      );
    }
  }

  // ==========================================
  // 3. GENERATE SECURE OTP
  // ==========================================

  const otp = generateOtp();

  const otpHash = hashOtp(normalizedEmail, otp);

  // ==========================================
  // 4. SAVE OTP
  // ==========================================

  await ActivationOTP.findOneAndUpdate(
    {
      email: normalizedEmail,
    },
    {
      $set: {
        otpHash,

        expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),

        lastSentAt: now,

        attempts: 0,

        processingUntil: null,
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
    },
  );

  // ==========================================
  // 5. SEND ACTIVATION OTP
  // ==========================================

  try {
    await sendEmail({
      to: normalizedEmail,

      subject: "AMIOUT - Account Activation OTP",

      html: generateAccountActivationTemplate({
        name: account.name || "User",

        otp,

        role: account.role || accountType,
      }),
    });
  } catch (error) {
    console.error("Activation OTP delivery failed:", error.message);

    // Delete only the OTP generated by this request.
    await ActivationOTP.deleteOne({
      email: normalizedEmail,
      otpHash,
    });

    throw createError("Unable to send OTP. Please try again.", 502);
  }

  // ==========================================
  // 6. SUCCESS RESPONSE
  // ==========================================

  return {
    success: true,

    message: "Activation OTP sent to your registered email.",

    accountType,

    expiresInMinutes: OTP_EXPIRY_MINUTES,
  };
};

// ==========================================
// VERIFY OTP AND ACTIVATE
// ==========================================

const verifyActivationOtpService = async (email, otp) => {
  const normalizedEmail = validateEmail(email);
  const enteredOtp = clean(otp);

  if (!/^\d{6}$/.test(enteredOtp)) {
    throw createError("Enter a valid 6-digit OTP.", 400);
  }

  const now = new Date();

  // ==========================================
  // 1. ATOMICALLY LOCK OTP
  // ==========================================

  const record = await ActivationOTP.findOneAndUpdate(
    {
      email: normalizedEmail,
      expiresAt: { $gt: now },
      attempts: { $lt: MAX_OTP_ATTEMPTS },
      $or: [
        { processingUntil: null },
        { processingUntil: { $lte: now } },
        { processingUntil: { $exists: false } },
      ],
    },
    {
      $inc: { attempts: 1 },
      $set: {
        processingUntil: new Date(Date.now() + LOCK_MS),
      },
    },
    { new: true },
  );

  if (!record) {
    throw createError(
      "OTP expired, attempts exceeded, or verification in progress.",
      400,
    );
  }

  const releaseLock = async () => {
    await ActivationOTP.updateOne(
      {
        _id: record._id,
        otpHash: record.otpHash,
      },
      {
        $set: { processingUntil: null },
      },
    );
  };

  // ==========================================
  // 2. VERIFY OTP HASH
  // ==========================================

  const expectedHash = Buffer.from(record.otpHash, "hex");

  const enteredHash = Buffer.from(hashOtp(normalizedEmail, enteredOtp), "hex");

  const isValid =
    expectedHash.length === enteredHash.length &&
    crypto.timingSafeEqual(expectedHash, enteredHash);

  if (!isValid) {
    await releaseLock();
    throw createError("Incorrect activation OTP.", 400);
  }

  // ==========================================
  // 3. RECHECK ACCOUNT ELIGIBILITY
  // ==========================================

  let eligibility;

  try {
    eligibility = await getEligibleAccount(normalizedEmail);
  } catch (error) {
    await releaseLock();
    throw error;
  }

  const {
    account,
    accountType,
    isNewStudent,
    isNewFaculty,
    studentMaster,
    facultyRecords,
    facultyMapping,
  } = eligibility;

  const temporaryPassword = generateTemporaryPassword();

  let updatedAccount;

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // ======================================
      // 4A. CREATE NEW STUDENT ACCOUNT
      // ======================================

      if (isNewStudent) {
        const master = await StudentMaster.findOne({
          _id: studentMaster._id,
          email: normalizedEmail,
          isActive: true,
          isDeleted: false,
          isRegistered: false,
        })
          .populate("program")
          .session(session);

        if (!master) {
          throw createError(
            "Student is no longer eligible for activation.",
            409,
          );
        }

        if (!master.mobileNumber?.trim()) {
          throw createError(
            "Student mobile number is missing in StudentMaster.",
            400,
          );
        }

        const existingStudent = await User.findOne({
          $or: [
            { email: normalizedEmail },
            { enrollmentNo: master.enrollmentNumber },
          ],
        }).session(session);

        if (existingStudent) {
          throw createError("Student account already exists.", 409);
        }

        const programName =
          master.program?.name || master.program?.programName || "";

        const createdUsers = await User.create(
          [
            {
              name: master.name,
              email: normalizedEmail,
              enrollmentNo: master.enrollmentNumber,
              mobileNumber: master.mobileNumber,
              password: temporaryPassword,
              role: "STUDENT",
              course: programName,
              semester: master.semester,
              isVerified: true,
              isActive: true,
              mustChangePassword: true,
            },
          ],
          { session },
        );

        updatedAccount = createdUsers[0];

        const masterUpdate = await StudentMaster.updateOne(
          {
            _id: master._id,
            isRegistered: false,
            isActive: true,
            isDeleted: false,
          },
          {
            $set: {
              isRegistered: true,
            },
          },
          { session },
        );

        if (masterUpdate.modifiedCount !== 1) {
          throw createError(
            "Student registration status could not be updated.",
            409,
          );
        }
      }

      // ======================================
      // 4B. CREATE NEW FACULTY ACCOUNT
      // ======================================
      else if (isNewFaculty) {
        const primaryRecord = facultyRecords[0];

        const createdMentors = await Mentor.create(
          [
            {
              name: clean(primaryRecord.mentorName || primaryRecord.name),
              email: normalizedEmail,
              employeeId: facultyMapping.facultyId,
              designation: clean(primaryRecord.designation),
              department: upper(primaryRecord.department),
              password: temporaryPassword,
              role: facultyMapping.roles[0],
              roles: facultyMapping.roles,
              roleAssignments: facultyMapping.roleAssignments,
              isVerified: true,
              isActive: true,
              mustChangePassword: true,
            },
          ],
          { session },
        );

        updatedAccount = createdMentors[0];

        const facultyUpdate = await MentorMaster.updateMany(
          {
            _id: {
              $in: facultyRecords.map((item) => item._id),
            },
            mentorEmail: normalizedEmail,
            isActive: true,
            isDeleted: false,
            $or: [{ mentorUser: null }, { mentorUser: updatedAccount._id }],
          },
          {
            $set: {
              mentorUser: updatedAccount._id,
            },
          },
          { session },
        );

        if (facultyUpdate.matchedCount !== facultyRecords.length) {
          throw createError("Unable to link all FacultyMaster records.", 409);
        }
      }

      // ======================================
      // 4C. ACTIVATE EXISTING ACCOUNT
      // ======================================
      else {
        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

        const AccountModel = accountType === "STUDENT" ? User : Mentor;

        const update = {
          password: hashedPassword,
          isVerified: true,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
        };

        if (accountType === "FACULTY") {
          const primaryRecord = facultyRecords[0];

          update.name = clean(primaryRecord.mentorName || primaryRecord.name);

          update.employeeId = facultyMapping.facultyId;
          update.designation = clean(primaryRecord.designation);
          update.department = upper(primaryRecord.department);
          update.role = facultyMapping.roles[0];
          update.roles = facultyMapping.roles;
          update.roleAssignments = facultyMapping.roleAssignments;
        }

        updatedAccount = await AccountModel.findOneAndUpdate(
          {
            _id: account._id,
            isVerified: false,
            isActive: { $ne: false },
          },
          {
            $set: update,
          },
          {
            new: true,
            runValidators: true,
            session,
          },
        );

        if (!updatedAccount) {
          throw createError("Account already activated or unavailable.", 409);
        }

        // Existing Student: synchronize StudentMaster.
        if (accountType === "STUDENT") {
          const result = await StudentMaster.updateOne(
            {
              email: normalizedEmail,
              enrollmentNumber: upper(updatedAccount.enrollmentNo),
              isActive: true,
              isDeleted: false,
            },
            {
              $set: { isRegistered: true },
            },
            { session },
          );

          if (result.matchedCount !== 1) {
            throw createError(
              "StudentMaster registration synchronization failed.",
              409,
            );
          }
        }

        // Existing Faculty: link MentorMaster records.
        if (accountType === "FACULTY") {
          const facultyUpdate = await MentorMaster.updateMany(
            {
              _id: {
                $in: facultyRecords.map((item) => item._id),
              },
              mentorEmail: normalizedEmail,
              isActive: true,
              isDeleted: false,
              $or: [{ mentorUser: null }, { mentorUser: updatedAccount._id }],
            },
            {
              $set: {
                mentorUser: updatedAccount._id,
              },
            },
            { session },
          );

          if (facultyUpdate.matchedCount !== facultyRecords.length) {
            throw createError("FacultyMaster linking failed.", 409);
          }
        }
      }

      // ======================================
      // 5. CONSUME OTP WITHIN TRANSACTION
      // ======================================

      const deletedOtp = await ActivationOTP.deleteOne(
        {
          _id: record._id,
          otpHash: record.otpHash,
          processingUntil: record.processingUntil,
        },
        { session },
      );

      if (deletedOtp.deletedCount !== 1) {
        throw createError("OTP could not be consumed safely.", 409);
      }
    });
  } catch (error) {
    await releaseLock();

    if (error.code === 11000) {
      throw createError(
        "Account already exists or identity conflict detected.",
        409,
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }

  // ==========================================
  // 6. SEND TEMPORARY PASSWORD
  // ==========================================

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: "AMIOUT - Your Temporary Password",
      html: generateTemporaryPasswordTemplate({
        name: updatedAccount.name || "User",
        email: normalizedEmail,
        role: updatedAccount.role || accountType,
        temporaryPassword,
        loginUrl: getLoginUrl(),
      }),
    });
  } catch (error) {
    console.error("Temporary password delivery failed:", error.message);

    throw createError(
      "Account activated, but temporary password email delivery failed. Use password recovery or contact administrator.",
      502,
    );
  }

  // ==========================================
  // 7. SEND WELCOME EMAIL
  // ==========================================

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: "Welcome to AMIOUT!",
      html: generateWelcomeTemplate({
        name: updatedAccount.name || "User",
        role: updatedAccount.role || accountType,
      }),
    });
  } catch (error) {
    console.error("Welcome email failed:", error.message);
  }

  return {
    success: true,
    message:
      "Account activated successfully. Temporary password sent to your email.",
    nextAction: "LOGIN",
  };
};

// ==========================================
// RESEND ACTIVATION OTP
// ==========================================

const resendActivationOtpService = async (email) => {
  return requestActivationOtpService(email);
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  requestActivationOtpService,
  verifyActivationOtpService,
  resendActivationOtpService,
};
