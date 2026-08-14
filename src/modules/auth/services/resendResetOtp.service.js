const resendOtpService = require("./resendOtp.service");

// ==========================================
// RESEND RESET OTP SERVICE
// ==========================================

const resendResetOtpService = async (email) => {
  return await resendOtpService(email, "PASSWORD_RESET");
};

module.exports = resendResetOtpService;
