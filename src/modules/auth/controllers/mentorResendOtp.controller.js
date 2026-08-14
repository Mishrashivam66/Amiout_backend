const mentorResendOtpService = require("../services/mentorResendOtp.service");

// ==========================================
// RESEND OTP
// ==========================================

const mentorResendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;

    const result = await mentorResendOtpService(email);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  mentorResendOtp,
};
