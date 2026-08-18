"use strict";

const mentorVerifyOtpService = require("./mentorVerifyOtp.service");

// ==========================================
// VERIFY RESET OTP SERVICE
// ==========================================

const mentorVerifyResetOtpService = async (email, otp) => {
  return await mentorVerifyOtpService(email, otp, "PASSWORD_RESET");
};

module.exports = mentorVerifyResetOtpService;
