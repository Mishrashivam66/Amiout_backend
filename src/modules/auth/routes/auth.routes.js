"use strict";

const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
  register,
  login,

  verifyOtp,
  resendOtp,

  // ACCOUNT ACTIVATION
  requestActivationOtp,
  verifyActivationOtp,
  resendActivationOtp,

  forgotPassword,
  verifyResetOtp,
  resendResetOtp,
  resetPassword,

  changePassword,
  refreshToken,
  logout,

  getProfile,
  updateProfile,
} = require("../controllers/auth.controller");

// ==========================================
// VALIDATION MIDDLEWARE
// ==========================================

const validate = require("../../../middlewares/validation.middleware");

// ==========================================
// VALIDATORS
// ==========================================

const {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
} = require("../validators");

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================

const {
  protect,
  requireRoles,
  requirePasswordSetupComplete,
} = require("../../../middlewares/auth.middleware");

// ==========================================
// PUBLIC AUTHENTICATION ROUTES
// ==========================================

// Common login for all eight roles:
//
// STUDENT
// MENTOR
// COORDINATOR
// HOD
// HOI
// ADMIN
// SECURITY
// SUPER_ADMIN

router.post("/login", validate(loginSchema), login);
router.post("/activation/request-otp", requestActivationOtp);

router.post("/activation/verify-otp", verifyActivationOtp);

router.post("/activation/resend-otp", resendActivationOtp);

// ==========================================
// STUDENT REGISTRATION
// ==========================================

// Registration service must enforce
// STUDENT-only registration.
//
// Other account types should be
// provisioned by authorized staff.

router.post("/register", validate(registerSchema), register);

// ==========================================
// EMAIL VERIFICATION
// ==========================================

router.post("/verify-otp", validate(verifyOtpSchema), verifyOtp);

router.post("/resend-otp", validate(resendOtpSchema), resendOtp);

// ==========================================
// PASSWORD RECOVERY
// ==========================================

router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);

router.post("/verify-reset-otp", validate(verifyOtpSchema), verifyResetOtp);

router.post("/resend-reset-otp", validate(resendOtpSchema), resendResetOtp);

router.post("/reset-password", validate(resetPasswordSchema), resetPassword);

// ==========================================
// REFRESH ACCESS TOKEN
// ==========================================

// Reads the HttpOnly refresh cookie.
// Does not require a Bearer access token.
//
// Refresh service validates:
// - JWT signature
// - Database session
// - Account status
// - Current authorized roles
// - Password change invalidation

router.post("/refresh-token", refreshToken);

// ==========================================
// LOGOUT
// ==========================================

// Allow logout even when
// mustChangePassword === true.

router.post("/logout", protect, logout);

// ==========================================
// MANDATORY FIRST-LOGIN PASSWORD CHANGE
// ==========================================

// Must remain accessible before
// temporary password setup is complete.
//
// SUPER_ADMIN may also change
// its own password.

router.put(
  "/change-password",
  protect,
  validate(changePasswordSchema),
  changePassword,
);

// ==========================================
// GET CURRENT USER PROFILE
// ==========================================

// Accessible during first login.
//
// Frontend uses this endpoint to restore:
// - id
// - accountType
// - role
// - roles
// - mustChangePassword

router.get("/me", protect, getProfile);

// ==========================================
// UPDATE CURRENT USER PROFILE
// ==========================================

// Mandatory password setup must be
// completed before profile updates.
//
// SUPER_ADMIN is excluded because
// its account is read-only.

router.put(
  "/profile",
  protect,
  requirePasswordSetupComplete,
  requireRoles(
    "STUDENT",
    "MENTOR",
    "COORDINATOR",
    "HOD",
    "HOI",
    "ADMIN",
    "SECURITY",
  ),
  validate(updateProfileSchema),
  updateProfile,
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
