"use strict";

const crypto = require("crypto");

const {
  findOTP,
  deleteOTP,
  createOTP,
} = require("../repositories/auth.repository");

const { findAdminByEmail } = require("../repositories/admin.repository");

const { normalizeEmail } = require("../repositories/commonAuth.repository");

const {
  sendEmail,
  generateAccountActivationTemplate,
} = require("../utils/email");

const AppError = require("../../../utils/AppError");

// ==========================================
// CONFIGURATION
// ==========================================

const OTP_PURPOSE = "ACCOUNT_ACTIVATION";

const RESEND_COOLDOWN_SECONDS = 60;

// ==========================================
// GENERATE SECURE OTP
// ==========================================

const generateOTP = () => crypto.randomInt(100000, 1000000).toString();

// ==========================================
// RESEND ADMIN ACTIVATION OTP
// ==========================================

const adminResendOtpService = async (email) => {
  // ========================================
  // NORMALIZE EMAIL
  // ========================================

  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new AppError("Email is required.", 400);
  }

  // ========================================
  // FIND ADMIN
  // ========================================

  const admin = await findAdminByEmail(normalizedEmail);

  if (!admin) {
    throw new AppError("Admin account not found.", 404);
  }

  // ========================================
  // CHECK ACCOUNT STATUS
  // ========================================

  if (admin.isVerified) {
    throw new AppError("This Admin account is already activated.", 409);
  }

  if (admin.isActive === false) {
    throw new AppError("This Admin account is disabled.", 403);
  }

  // ========================================
  // CHECK EXISTING OTP
  // ========================================

  const existingOtp = await findOTP(normalizedEmail, OTP_PURPOSE);

  if (existingOtp) {
    if (existingOtp.accountType && existingOtp.accountType !== "ADMIN") {
      throw new AppError("Invalid activation request.", 400);
    }

    const createdAt = new Date(existingOtp.createdAt).getTime();

    const elapsedSeconds = (Date.now() - createdAt) / 1000;

    if (
      Number.isFinite(elapsedSeconds) &&
      elapsedSeconds >= 0 &&
      elapsedSeconds < RESEND_COOLDOWN_SECONDS
    ) {
      const remainingSeconds = Math.ceil(
        RESEND_COOLDOWN_SECONDS - elapsedSeconds,
      );

      throw new AppError(
        `Please wait ${remainingSeconds} seconds before requesting another OTP.`,
        429,
      );
    }
  }

  // ========================================
  // GENERATE NEW OTP
  // ========================================

  const otp = generateOTP();

  // ========================================
  // REPLACE PREVIOUS OTP
  // ========================================

  await deleteOTP(normalizedEmail, OTP_PURPOSE);

  await createOTP({
    email: normalizedEmail,
    accountType: "ADMIN",
    otp,
    purpose: OTP_PURPOSE,
  });

  // ========================================
  // SEND ACTIVATION EMAIL
  // ========================================

  await sendEmail({
    to: admin.email,
    subject: "AMIOUT Admin Account Activation OTP",
    html: generateAccountActivationTemplate({
      name: admin.name,
      otp,
      role: "ADMIN",
    }),
  });

  // ========================================
  // RESPONSE
  // ========================================

  return {
    success: true,
    message: "A new activation OTP has been sent to your registered email.",
  };
};

module.exports = adminResendOtpService;
