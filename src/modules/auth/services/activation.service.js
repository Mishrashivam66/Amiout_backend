"use strict";

const crypto = require("node:crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const Mentor = require("../models/Mentor");

const MentorMaster = require("../../academic/models/MentorMaster");

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
  const existing = await findAccountByEmail(email);

  // Existing Student / Faculty account
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

    if (existing.accountType === "FACULTY") {
      const records = await getFacultyMasterRecords(email);

      const mapping = buildFacultyAssignments(records);

      if (upper(existing.account.employeeId) !== mapping.facultyId) {
        throw createError("Faculty account and master ID mismatch.", 409);
      }

      return {
        ...existing,
        facultyRecords: records,
        facultyMapping: mapping,
      };
    }

    return existing;
  }

  // New faculty: must be approved in MentorMaster
  const facultyRecords = await getFacultyMasterRecords(email);

  if (!facultyRecords.length) {
    throw createError("No eligible Student or Faculty account found.", 404);
  }

  const facultyMapping = buildFacultyAssignments(facultyRecords);

  // Prevent another account using the same Faculty ID
  const existingFacultyId = await Mentor.findOne({
    employeeId: facultyMapping.facultyId,
  });

  if (existingFacultyId) {
    throw createError("Faculty ID already belongs to another account.", 409);
  }

  return {
    accountType: "FACULTY",
    isNewFaculty: true,
    account: {
      name: facultyRecords[0].name,
      email,
      role: facultyMapping.roles[0],
      isVerified: false,
    },
    facultyRecords,
    facultyMapping,
  };
};

// ==========================================
// REQUEST ACTIVATION OTP
// ==========================================

const requestActivationOtpService = async (email) => {
  const normalizedEmail = validateEmail(email);

  const { account, accountType } = await getEligibleAccount(normalizedEmail);

  const now = new Date();

  const existing = await ActivationOTP.findOne({
    email: normalizedEmail,
  });

  if (
    existing &&
    now.getTime() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    throw createError(
      "Please wait 60 seconds before requesting another OTP.",
      429,
    );
  }

  const otp = generateOtp();
  const otpHash = hashOtp(normalizedEmail, otp);

  await ActivationOTP.findOneAndUpdate(
    { email: normalizedEmail },
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

    await ActivationOTP.deleteOne({
      email: normalizedEmail,
      otpHash,
    });

    throw createError("Unable to send OTP. Please try again.", 502);
  }

  return {
    success: true,
    message: "Activation OTP sent to your registered email.",
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
    throw createError("Enter a valid 6-digit OTP.");
  }

  const now = new Date();

  // Lock the OTP before provisioning an account
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
        processingUntil: new Date(now.getTime() + LOCK_MS),
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

  const expectedHash = Buffer.from(record.otpHash, "hex");

  const enteredHash = Buffer.from(hashOtp(normalizedEmail, enteredOtp), "hex");

  const isValid =
    expectedHash.length === enteredHash.length &&
    crypto.timingSafeEqual(expectedHash, enteredHash);

  if (!isValid) {
    await releaseLock();
    throw createError("Incorrect activation OTP.");
  }

  let eligibility;

  try {
    eligibility = await getEligibleAccount(normalizedEmail);
  } catch (error) {
    await releaseLock();
    throw error;
  }

  const { account, accountType, isNewFaculty, facultyRecords, facultyMapping } =
    eligibility;

  const temporaryPassword = generateTemporaryPassword();

  let updatedAccount;

  try {
    if (isNewFaculty) {
      // ======================================
      // CREATE NEW FACULTY LOGIN ACCOUNT
      // ======================================

      const primaryRecord = facultyRecords[0];

      // Mentor.js pre-save middleware hashes
      // the password automatically.
      updatedAccount = await Mentor.create({
        name: clean(primaryRecord.name),
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
      });

      // Link academic master records to login
      await MentorMaster.updateMany(
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
      );
    } else {
      // ======================================
      // EXISTING STUDENT / FACULTY ACTIVATION
      // ======================================

      const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

      const AccountModel = account.constructor;

      const update = {
        password: hashedPassword,
        isVerified: true,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      };

      // Refresh approved roles on pending
      // faculty accounts.
      if (accountType === "FACULTY") {
        const primaryRecord = facultyRecords[0];

        update.name = clean(primaryRecord.name);
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
        },
      );

      if (!updatedAccount) {
        throw createError("Account already activated or unavailable.", 409);
      }

      if (accountType === "FACULTY") {
        await MentorMaster.updateMany(
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
        );
      }
    }
  } catch (error) {
    await releaseLock();

    if (error.code === 11000) {
      throw createError(
        "Faculty account already exists or identity conflict detected.",
        409,
      );
    }

    throw error;
  }

  // ======================================
  // CONSUME OTP
  // ======================================

  await ActivationOTP.deleteOne({
    _id: record._id,
    otpHash: record.otpHash,
  });

  // ======================================
  // TEMPORARY PASSWORD EMAIL
  // ======================================

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

  // ======================================
  // WELCOME EMAIL
  // ======================================

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
