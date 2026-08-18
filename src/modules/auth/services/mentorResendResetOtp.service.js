"use strict";

const mentorResendOtpService = require("./mentorResendOtp.service");

// ==========================================
// RESEND RESET OTP SERVICE
// ==========================================

const mentorResendResetOtpService = async (email) => {
  return await mentorResendOtpService(email, "PASSWORD_RESET");
};

module.exports = mentorResendResetOtpService;
