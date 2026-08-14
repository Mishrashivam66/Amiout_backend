"use strict";
const mentorVerifyOtpService = require("../services/mentorVerifyOtp.service");

// ==========================================
// VERIFY MENTOR OTP
// ==========================================

const mentorVerifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    const result = await mentorVerifyOtpService(email, otp);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  mentorVerifyOtp,
};
