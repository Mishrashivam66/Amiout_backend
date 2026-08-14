"use strict";

const {
  findOTP,
  deleteOTP,
  incrementOtpAttempts,
} = require("../repositories/auth.repository");

const {
  findAdminByEmail,
  updateAdmin,
} = require("../repositories/admin.repository");

const { sendEmail, generateWelcomeTemplate } = require("../utils/email");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// VERIFY ADMIN OTP
// ==========================================

const adminVerifyOtpService = async (
  email,
  otp,
  purpose = "EMAIL_VERIFICATION",
) => {
  // ==========================================
  // FIND OTP
  // ==========================================

  const otpRecord = await findOTP(email, purpose);

  if (!otpRecord) {
    throw new Error(AUTH_MESSAGES.INVALID_OTP);
  }

  // ==========================================
  // OTP EXPIRED
  // ==========================================

  if (otpRecord.expiresAt < new Date()) {
    await deleteOTP(email, purpose);

    throw new Error("OTP has expired.");
  }

  // ==========================================
  // MAX ATTEMPTS
  // ==========================================

  if (otpRecord.attempts >= 5) {
    throw new Error("Maximum OTP attempts exceeded.");
  }

  // ==========================================
  // OTP MATCH
  // ==========================================

  if (otpRecord.otp !== otp) {
    await incrementOtpAttempts(otpRecord._id);

    throw new Error(AUTH_MESSAGES.INVALID_OTP);
  }

  // ==========================================
  // FIND ADMIN
  // ==========================================

  const admin = await findAdminByEmail(email);

  if (!admin) {
    throw new Error("Admin not found.");
  }

  // ==========================================
  // VERIFY ACCOUNT
  // ==========================================

  await updateAdmin(admin._id, {
    isVerified: true,
  });

  // ==========================================
  // SEND WELCOME EMAIL
  // ==========================================

  await sendEmail({
    to: admin.email,
    subject: "Welcome to AMIOUT",
    html: generateWelcomeTemplate({
      name: admin.name,
    }),
  });

  // ==========================================
  // DELETE OTP
  // ==========================================

  await deleteOTP(email, purpose);

  // ==========================================
  // RESPONSE
  // ==========================================

  return {
    success: true,
    message: AUTH_MESSAGES.OTP_VERIFIED,
  };
};

module.exports = adminVerifyOtpService;
