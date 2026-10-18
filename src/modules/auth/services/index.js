"use strict";

// ==========================================
// COMMON PROFILE SERVICES
// ==========================================

const {
  getProfileService,
  updateProfileService,
} = require("./profile.service");

// ==========================================
// MENTOR PROFILE SERVICES
// ==========================================

const {
  getMentorProfileService,
  updateMentorProfileService,
} = require("./mentorProfile.service");

// ==========================================
// ADMIN PROFILE SERVICES
// ==========================================

const {
  getAdminProfileService,
  updateAdminProfileService,
} = require("./adminProfile.service");

// ==========================================
// SERVICE EXPORTS
// ==========================================
// ==========================================
// ACCOUNT ACTIVATION
// ==========================================

const {
  requestActivationOtpService,
  verifyActivationOtpService,
  resendActivationOtpService,
} = require("./activation.service");
module.exports = {
  // ========================================
  // COMMON AUTHENTICATION
  // ========================================

  registerService: require("./register.service"),
  loginService: require("./login.service"),

  // ========================================
  // EMAIL VERIFICATION
  // ========================================

  verifyOtpService: require("./verifyOtp.service"),
  resendOtpService: require("./resendOtp.service"),

  // ==========================================
  // ACCOUNT ACTIVATION
  // ==========================================

  requestActivationOtpService,
  verifyActivationOtpService,
  resendActivationOtpService,
  // ========================================
  // PASSWORD RECOVERY
  // ========================================

  forgotPasswordService: require("./forgotPassword.service"),
  verifyResetOtpService: require("./verifyResetOtp.service"),
  resendResetOtpService: require("./resendResetOtp.service"),
  resetPasswordService: require("./resetPassword.service"),

  // ========================================
  // COMMON PROFILE
  // ========================================

  getProfileService,
  updateProfileService,

  // ========================================
  // COMMON SESSION MANAGEMENT
  // ========================================

  refreshTokenService: require("./refreshToken.service"),
  logoutService: require("./logout.service"),
  switchRoleService: require("./switchRole.service"),
  // ========================================
  // PASSWORD MANAGEMENT
  // ========================================

  changePasswordService: require("./changePassword.service"),

  // ========================================
  // LEGACY MENTOR PROFILE
  // ========================================

  getMentorProfileService,
  updateMentorProfileService,

  // ========================================
  // LEGACY ADMIN AUTHENTICATION
  // ========================================

  adminRegisterService: require("./adminRegister.service"),
  adminLoginService: require("./adminLogin.service"),
  adminVerifyOtpService: require("./adminVerifyOtp.service"),
  adminResendOtpService: require("./adminResendOtp.service"),

  // ========================================
  // LEGACY ADMIN PROFILE
  // ========================================

  getAdminProfileService,
  updateAdminProfileService,
};
