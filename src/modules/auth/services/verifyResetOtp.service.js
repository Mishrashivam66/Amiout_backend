const verifyOtpService = require("./verifyOtp.service");

// ==========================================
// VERIFY RESET OTP SERVICE
// ==========================================

const verifyResetOtpService = async (email, otp) => {
  return await verifyOtpService(email, otp, "PASSWORD_RESET");
};

module.exports = verifyResetOtpService;
