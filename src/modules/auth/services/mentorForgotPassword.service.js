"use strict";

const { findMentorByEmail } = require("../repositories/mentor.repository");

const { deleteOTP, createOTP } = require("../repositories/auth.repository");

const { sendEmail, generateOtpTemplate } = require("../utils/email");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// GENERATE OTP
// ==========================================

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ==========================================
// MENTOR FORGOT PASSWORD SERVICE
// ==========================================

const mentorForgotPasswordService = async (email) => {
  // ==========================================
  // FIND MENTOR
  // ==========================================

  const mentor = await findMentorByEmail(email);

  if (!mentor) {
    throw new Error(AUTH_MESSAGES.USER_NOT_FOUND);
  }

  // ==========================================
  // DELETE OLD OTP
  // ==========================================

  await deleteOTP(email, "PASSWORD_RESET");

  // ==========================================
  // GENERATE OTP
  // ==========================================

  const otp = generateOTP();

  // ==========================================
  // SAVE OTP
  // ==========================================

  await createOTP({
    email,
    otp,
    purpose: "PASSWORD_RESET",
  });

  // ==========================================
  // SEND EMAIL
  // ==========================================

  await sendEmail({
    to: mentor.email,
    subject: "AMIOUT Mentor Password Reset OTP",
    html: generateOtpTemplate({
      name: mentor.name,
      otp,
    }),
  });

  // ==========================================
  // RESPONSE
  // ==========================================

  return {
    success: true,
    message: "Password reset OTP has been sent to your registered email.",
  };
};

module.exports = mentorForgotPasswordService;
