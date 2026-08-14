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
// MIDDLEWARES
// ==========================================

const { protect } = require("../../../middlewares/auth.middleware");

// ==========================================
// AUTH ROUTES
// ==========================================

// Register
router.post("/register", validate(registerSchema), register);

// Login
router.post("/login", validate(loginSchema), login);

// ==========================================
// EMAIL VERIFICATION OTP
// ==========================================

// Verify OTP
router.post("/verify-otp", validate(verifyOtpSchema), verifyOtp);

// Resend OTP
router.post("/resend-otp", validate(resendOtpSchema), resendOtp);

// ==========================================
// FORGOT PASSWORD
// ==========================================

// Send Reset OTP
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);

// Verify Reset OTP
router.post("/verify-reset-otp", validate(verifyOtpSchema), verifyResetOtp);

// Resend Reset OTP
router.post("/resend-reset-otp", validate(resendOtpSchema), resendResetOtp);

// Reset Password
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);

// ==========================================
// TOKEN
// ==========================================

// Refresh Token
router.post("/refresh-token", refreshToken);

// ==========================================
// AUTHENTICATED ROUTES
// ==========================================

// Logout
router.post("/logout", protect, logout);

// Change Password
router.put(
  "/change-password",
  protect,
  validate(changePasswordSchema),
  changePassword,
);

// Get Profile
router.get("/me", protect, getProfile);

// Update Profile
router.put("/profile", protect, validate(updateProfileSchema), updateProfile);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
