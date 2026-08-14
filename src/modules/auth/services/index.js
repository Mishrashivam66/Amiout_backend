const {
  getProfileService,
  updateProfileService,
} = require("./profile.service");
const {
  getMentorProfileService,
  updateMentorProfileService,
} = require("./mentorProfile.service");

const {
  getAdminProfileService,
  updateAdminProfileService,
} = require("./adminProfile.service");

module.exports = {
  registerService: require("./register.service"),
  loginService: require("./login.service"),

  // ==========================================
  // EMAIL VERIFICATION
  // ==========================================

  verifyOtpService: require("./verifyOtp.service"),
  resendOtpService: require("./resendOtp.service"),

  // ==========================================
  // FORGOT PASSWORD
  // ==========================================

  forgotPasswordService: require("./forgotPassword.service"),
  verifyResetOtpService: require("./verifyResetOtp.service"),
  resendResetOtpService: require("./resendResetOtp.service"),
  resetPasswordService: require("./resetPassword.service"),

  // Mentor Profile
  getMentorProfileService,
  updateMentorProfileService,
  // ==========================================
  // PROFILE
  // ==========================================

  getProfileService,
  updateProfileService,

  // ==========================================
  // TOKEN
  // ==========================================

  refreshTokenService: require("./refreshToken.service"),
  logoutService: require("./logout.service"),

  // ==========================================
  // PASSWORD
  // ==========================================

  changePasswordService: require("./changePassword.service"),

  // ==========================================
  // ADMIN
  // ==========================================

  adminRegisterService: require("./adminRegister.service"),
  adminLoginService: require("./adminLogin.service"),
  adminVerifyOtpService: require("./adminVerifyOtp.service"),
  adminResendOtpService: require("./adminResendOtp.service"),

  getAdminProfileService,
  updateAdminProfileService,
};
