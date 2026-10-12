"use strict";

const crypto = require("crypto");

const {
  findOTP,
  deleteOTP,
  incrementOtpAttempts,
} = require("../repositories/auth.repository");

const { findAdminByEmail } = require("../repositories/admin.repository");

const {
  sendEmail,
  generateTemporaryPasswordTemplate,
} = require("../utils/email");

const { normalizeEmail } = require("../repositories/commonAuth.repository");

const AppError = require("../../../utils/AppError");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// CONFIGURATION
// ==========================================

const OTP_PURPOSE = "ACCOUNT_ACTIVATION";
const MAX_OTP_ATTEMPTS = 5;

// ==========================================
// GENERATE TEMPORARY PASSWORD
// ==========================================

const generateTemporaryPassword = () =>
  crypto.randomBytes(24).toString("base64url");

// ==========================================
// VERIFY ADMIN ACTIVATION OTP
// ==========================================

const adminVerifyOtpService = async (email, otp) => {
  // ========================================
  // VALIDATE INPUT
  // ========================================

  const normalizedEmail = normalizeEmail(email);

  const submittedOtp = String(otp ?? "").trim();

  if (!normalizedEmail || !/^\d{6}$/.test(submittedOtp)) {
    throw new AppError(AUTH_MESSAGES.INVALID_OTP, 400);
  }

  // ========================================
  // FIND ADMIN
  // ========================================

  const admin = await findAdminByEmail(normalizedEmail);

  if (!admin) {
    throw new AppError("Admin account not found.", 404);
  }

  if (admin.isVerified) {
    throw new AppError("This account is already activated.", 409);
  }

  // ========================================
  // FIND ACTIVATION OTP
  // ========================================

  const otpRecord = await findOTP(normalizedEmail, OTP_PURPOSE);

  if (
    !otpRecord ||
    (otpRecord.accountType && otpRecord.accountType !== "ADMIN")
  ) {
    throw new AppError(AUTH_MESSAGES.INVALID_OTP, 400);
  }

  // ========================================
  // CHECK EXPIRY
  // ========================================

  if (new Date(otpRecord.expiresAt) <= new Date()) {
    await deleteOTP(normalizedEmail, OTP_PURPOSE);

    throw new AppError("OTP has expired.", 400);
  }

  // ========================================
  // CHECK ATTEMPTS
  // ========================================

  if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
    throw new AppError("Maximum OTP attempts exceeded.", 429);
  }

  // ========================================
  // VERIFY OTP
  // ========================================

  const savedOtp = String(otpRecord.otp ?? "");

  const savedBuffer = Buffer.from(savedOtp);

  const submittedBuffer = Buffer.from(submittedOtp);

  const isMatching =
    savedBuffer.length === submittedBuffer.length &&
    crypto.timingSafeEqual(savedBuffer, submittedBuffer);

  if (!isMatching) {
    await incrementOtpAttempts(otpRecord._id);

    throw new AppError(AUTH_MESSAGES.INVALID_OTP, 400);
  }

  // ========================================
  // GENERATE TEMPORARY PASSWORD
  // ========================================

  const temporaryPassword = generateTemporaryPassword();

  // ========================================
  // PREPARE LOGIN URL
  // ========================================

  const loginUrl = process.env.FRONTEND_URL
    ? `${process.env.FRONTEND_URL.replace(/\/$/, "")}/login`
    : "";

  // ========================================
  // SEND TEMPORARY PASSWORD EMAIL
  // ========================================

  // Send before enabling login so a
  // failed email does not activate an
  // account with an unknown password.

  await sendEmail({
    to: admin.email,
    subject: "Your AMIOUT Admin Login Credentials",
    html: generateTemporaryPasswordTemplate({
      name: admin.name,
      email: admin.email,
      role: "ADMIN",
      temporaryPassword,
      loginUrl,
    }),
  });

  // ========================================
  // SAVE PASSWORD AND ACTIVATE ACCOUNT
  // ========================================

  // Use document.save() so Admin model's
  // password hashing middleware executes.

  admin.password = temporaryPassword;
  admin.isVerified = true;
  admin.mustChangePassword = true;

  await admin.save();

  // ========================================
  // DELETE ACTIVATION OTP
  // ========================================

  await deleteOTP(normalizedEmail, OTP_PURPOSE);

  // ========================================
  // RESPONSE
  // ========================================

  return {
    success: true,
    message:
      "Account activated. Login credentials have been sent to your email.",
  };
};

module.exports = adminVerifyOtpService;
