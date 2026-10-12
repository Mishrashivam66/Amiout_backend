"use strict";

const crypto = require("node:crypto");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");

const {
  findAccountByEmail,
  normalizeEmail,
} = require("../repositories/commonAuth.repository");

// ==========================================
// CONFIGURATION
// ==========================================

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

const OTP_SECRET = process.env.ACTIVATION_OTP_SECRET || process.env.JWT_SECRET;

if (!OTP_SECRET) {
  throw new Error("ACTIVATION_OTP_SECRET or JWT_SECRET is required.");
}

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
  },
  {
    timestamps: true,
  },
);

activationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ActivationOTP =
  mongoose.models.ActivationOTP ||
  mongoose.model("ActivationOTP", activationSchema);

// ==========================================
// HELPERS
// ==========================================

const createError = (message, status = 400) => {
  const error = new Error(message);
  error.statusCode = status;
  return error;
};

const hashOtp = (email, otp) =>
  crypto
    .createHmac("sha256", OTP_SECRET)
    .update(`${email}:${otp}`)
    .digest("hex");

const createOtp = () => String(crypto.randomInt(100000, 1000000));

const createTemporaryPassword = () => {
  const randomPart = crypto.randomBytes(18).toString("base64url");

  return `Am@9${randomPart}`;
};

const validateEmail = (email) => {
  const normalized = normalizeEmail(email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw createError("Valid university email is required.");
  }

  return normalized;
};

const getEligibleAccount = async (email) => {
  const result = await findAccountByEmail(email);

  if (!result || !["STUDENT", "FACULTY"].includes(result.accountType)) {
    throw createError("No eligible Student or Faculty account found.");
  }

  return result;
};

// ==========================================
// EMAIL TRANSPORT
// ==========================================

// Match these variable names with your
// existing backend email configuration.

const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw createError("SMTP email configuration is missing.", 500);
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
};

const sendEmail = async ({ to, subject, text }) => {
  const transporter = getTransporter();

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
};

// ==========================================
// REQUEST ACTIVATION OTP
// ==========================================

const requestActivationOtpService = async (email) => {
  const normalizedEmail = validateEmail(email);

  const { account } = await getEligibleAccount(normalizedEmail);

  if (account.isActive === true && account.isVerified === true) {
    throw createError("Account is already activated. Please login.");
  }

  const existing = await ActivationOTP.findOne({
    email: normalizedEmail,
  });

  const now = Date.now();

  if (
    existing &&
    now - new Date(existing.lastSentAt).getTime() < RESEND_COOLDOWN_MS
  ) {
    throw createError(
      "Please wait 60 seconds before requesting another OTP.",
      429,
    );
  }

  const otp = createOtp();

  // Email must succeed before reporting
  // that the OTP was sent.

  await sendEmail({
    to: normalizedEmail,
    subject: "AMIOUT - Account Activation OTP",
    text:
      `Your AMIOUT activation OTP is ${otp}.\n\n` +
      "This code expires in 10 minutes.\n" +
      "Do not share this code with anyone.",
  });

  await ActivationOTP.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        otpHash: hashOtp(normalizedEmail, otp),
        expiresAt: new Date(now + OTP_EXPIRY_MS),
        lastSentAt: new Date(now),
        attempts: 0,
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
    },
  );

  return {
    success: true,
    message: "Activation OTP sent to your registered email.",
  };
};

// ==========================================
// VERIFY OTP AND ACTIVATE
// ==========================================

const verifyActivationOtpService = async (email, otp) => {
  const normalizedEmail = validateEmail(email);

  const enteredOtp = String(otp || "").trim();

  if (!/^\d{6}$/.test(enteredOtp)) {
    throw createError("Enter a valid 6-digit OTP.");
  }

  const { account } = await getEligibleAccount(normalizedEmail);

  if (account.isActive === true && account.isVerified === true) {
    throw createError("Account is already activated.");
  }

  const record = await ActivationOTP.findOne({
    email: normalizedEmail,
  });

  if (!record || record.expiresAt.getTime() <= Date.now()) {
    throw createError("OTP expired or not found. Request a new OTP.");
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    throw createError("Maximum OTP attempts exceeded. Request a new OTP.", 429);
  }

  const expectedHash = Buffer.from(record.otpHash, "hex");

  const enteredHash = Buffer.from(hashOtp(normalizedEmail, enteredOtp), "hex");

  const valid =
    expectedHash.length === enteredHash.length &&
    crypto.timingSafeEqual(expectedHash, enteredHash);

  if (!valid) {
    await ActivationOTP.updateOne(
      { _id: record._id },
      { $inc: { attempts: 1 } },
    );

    throw createError("Invalid activation OTP.");
  }

  const temporaryPassword = createTemporaryPassword();

  // IMPORTANT:
  // This assumes your account model hashes
  // passwords in its Mongoose save hook.
  //
  // Do not enable activation until that
  // behavior is verified for both models.

  await sendEmail({
    to: normalizedEmail,
    subject: "AMIOUT - Temporary Login Password",
    text:
      "Your AMIOUT account activation has been verified.\n\n" +
      `Temporary password: ${temporaryPassword}\n\n` +
      "Login with your university email and this password.\n" +
      "You must change it on your first login.\n\n" +
      "Do not share your password.",
  });

  account.password = temporaryPassword;

  account.isActive = true;
  account.isVerified = true;
  account.mustChangePassword = true;

  await account.save();

  await ActivationOTP.deleteOne({
    _id: record._id,
  });

  return {
    success: true,
    message:
      "Account activated. Your temporary password has been sent to your email.",
  };
  ("use strict");

  const crypto = require("node:crypto");
  const mongoose = require("mongoose");

  const {
    findAccountByEmail,
    normalizeEmail,
  } = require("../repositories/commonAuth.repository");

  const {
    sendEmail,
    generateAccountActivationTemplate,
    generateTemporaryPasswordTemplate,
  } = require("../utils/email");

  const { AUTH_CONSTANTS } = require("../constants");

  // ==========================================
  // CONFIGURATION
  // ==========================================

  const OTP_EXPIRY_MINUTES = Number(AUTH_CONSTANTS.OTP_EXPIRY_MINUTES) || 10;

  const OTP_EXPIRY_MS = OTP_EXPIRY_MINUTES * 60 * 1000;

  const RESEND_COOLDOWN_MS = 60 * 1000;
  const MAX_OTP_ATTEMPTS = 5;

  const OTP_SECRET =
    process.env.ACTIVATION_OTP_SECRET || process.env.JWT_SECRET;

  if (!OTP_SECRET) {
    throw new Error("ACTIVATION_OTP_SECRET or JWT_SECRET must be configured.");
  }

  // ==========================================
  // ACTIVATION OTP MODEL
  // ==========================================

  const activationOtpSchema = new mongoose.Schema(
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

      // Prevent duplicate verification
      // while a request is processing.
      processingUntil: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: true,
    },
  );

  activationOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  const ActivationOTP =
    mongoose.models.ActivationOTP ||
    mongoose.model("ActivationOTP", activationOtpSchema);

  // ==========================================
  // HELPERS
  // ==========================================

  const createError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
  };

  const validateEmail = (email) => {
    const value = normalizeEmail(email);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw createError("Enter a valid registered email address.");
    }

    return value;
  };

  const generateOtp = () => String(crypto.randomInt(100000, 1000000));

  const hashOtp = (email, otp) =>
    crypto
      .createHmac("sha256", OTP_SECRET)
      .update(`${email}:${otp}`)
      .digest("hex");

  const generateTemporaryPassword = () =>
    `Am@9${crypto.randomBytes(18).toString("base64url")}`;

  const getAccount = async (email) => {
    const result = await findAccountByEmail(email);

    if (!result || !["STUDENT", "FACULTY"].includes(result.accountType)) {
      throw createError("No eligible Student or Faculty account found.", 404);
    }

    return result;
  };

  const ensureNotActivated = (account) => {
    if (account.isVerified === true && account.isActive === true) {
      throw createError(
        "This account is already activated. Please login.",
        409,
      );
    }
  };

  const getLoginUrl = () => {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    return `${frontendUrl.replace(/\/$/, "")}/login`;
  };

  // ==========================================
  // REQUEST ACTIVATION OTP
  // ==========================================

  const requestActivationOtpService = async (email) => {
    const normalizedEmail = validateEmail(email);

    const { account } = await getAccount(normalizedEmail);

    ensureNotActivated(account);

    const now = new Date();

    const existing = await ActivationOTP.findOne({
      email: normalizedEmail,
    });

    if (
      existing &&
      now.getTime() - new Date(existing.lastSentAt).getTime() <
        RESEND_COOLDOWN_MS
    ) {
      throw createError(
        "Please wait 60 seconds before requesting another OTP.",
        429,
      );
    }

    const otp = generateOtp();

    // Save OTP before sending so that
    // the received OTP can be verified.
    await ActivationOTP.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $set: {
          otpHash: hashOtp(normalizedEmail, otp),
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
          name: account.name,
          otp,
          role: account.role || "STUDENT",
        }),
      });
    } catch (error) {
      // Do not expose SMTP credentials
      // or internal transport details.
      console.error("Activation OTP email failed:", error.message);

      throw createError(
        "Unable to send activation OTP. Please try again.",
        502,
      );
    }

    return {
      success: true,
      message: "Activation OTP has been sent to your registered email.",
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    };
  };

  // ==========================================
  // VERIFY ACTIVATION OTP
  // ==========================================

  const verifyActivationOtpService = async (email, otp) => {
    const normalizedEmail = validateEmail(email);
    const enteredOtp = String(otp || "").trim();

    if (!/^\d{6}$/.test(enteredOtp)) {
      throw createError("Please enter a valid 6-digit OTP.");
    }

    const { account } = await getAccount(normalizedEmail);

    ensureNotActivated(account);

    const now = new Date();

    // Atomic attempt increment prevents
    // concurrent requests from bypassing
    // the maximum attempt limit.
    const record = await ActivationOTP.findOneAndUpdate(
      {
        email: normalizedEmail,
        expiresAt: { $gt: now },
        attempts: { $lt: MAX_OTP_ATTEMPTS },
        $or: [{ processingUntil: null }, { processingUntil: { $lte: now } }],
      },
      {
        $inc: { attempts: 1 },
        $set: {
          processingUntil: new Date(now.getTime() + 60 * 1000),
        },
      },
      { new: true },
    );

    if (!record) {
      throw createError(
        "OTP expired, maximum attempts reached, or verification already in progress.",
        400,
      );
    }

    const submittedHash = Buffer.from(
      hashOtp(normalizedEmail, enteredOtp),
      "hex",
    );

    const storedHash = Buffer.from(record.otpHash, "hex");

    const valid =
      submittedHash.length === storedHash.length &&
      crypto.timingSafeEqual(submittedHash, storedHash);

    if (!valid) {
      await ActivationOTP.updateOne(
        { _id: record._id },
        { $set: { processingUntil: null } },
      );

      throw createError("Incorrect activation OTP.");
    }

    const temporaryPassword = generateTemporaryPassword();

    // Both User and Mentor models have
    // pre-save bcrypt password hashing.
    account.password = temporaryPassword;
    account.isVerified = true;
    account.isActive = true;
    account.mustChangePassword = true;

    // Password must be saved before
    // sending the temporary password email.
    await account.save();

    try {
      await sendEmail({
        to: normalizedEmail,
        subject: "AMIOUT - Your Temporary Password",
        html: generateTemporaryPasswordTemplate({
          name: account.name,
          email: normalizedEmail,
          role: account.role || "STUDENT",
          temporaryPassword,
          loginUrl: getLoginUrl(),
        }),
      });
    } catch (error) {
      console.error("Temporary password email failed:", error.message);

      // Keep the OTP record so the system
      // can identify the failed delivery.
      // Do not issue a second password here.
      await ActivationOTP.updateOne(
        { _id: record._id },
        {
          $set: {
            processingUntil: null,
          },
        },
      );

      throw createError(
        "Account was activated, but temporary password email delivery failed. Contact the administrator for assistance.",
        502,
      );
    }

    await ActivationOTP.deleteOne({
      _id: record._id,
    });

    return {
      success: true,
      message:
        "Account activated successfully. Your temporary password has been emailed.",
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
