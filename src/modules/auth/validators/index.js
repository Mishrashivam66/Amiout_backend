module.exports = {
  registerSchema: require("./register.validator"),
  loginSchema: require("./login.validator"),
  verifyOtpSchema: require("./verifyOtp.validator"),
  resendOtpSchema: require("./resendOtp.validator"),
  forgotPasswordSchema: require("./forgotPassword.validator"),
  resetPasswordSchema: require("./resetPassword.validator"),
  changePasswordSchema: require("./changePassword.validator"),
  updateProfileSchema: require("./updateProfile.validator"),
};
