const express = require("express");
const router = express.Router();
const { protect } = require("../../../middlewares/auth.middleware");
const {
  mentorRegister,
  mentorLogin,
  getMentorProfile,
  updateMentorProfile,

  mentorForgotPassword,
  mentorVerifyResetOtp,
  mentorResendResetOtp,
  mentorResetPassword,
  mentorChangePassword,
  mentorRefreshToken,
  mentorLogout,
} = require("../controllers/mentorRegister.controller");

const {
  mentorVerifyOtp,
} = require("../controllers/mentorVerifyOtp.controller");
const {
  mentorResendOtp,
} = require("../controllers/mentorResendOtp.controller");

// Register
router.post("/register", mentorRegister);

// Verify OTP
router.post("/verify-otp", mentorVerifyOtp);

router.get("/me", protect, getMentorProfile);

router.put("/profile", protect, updateMentorProfile);
// Login
router.post("/login", mentorLogin);
router.post("/resend-otp", mentorResendOtp);
// ==========================================
// FORGOT PASSWORD
// ==========================================

router.post("/forgot-password", mentorForgotPassword);

router.post("/verify-reset-otp", mentorVerifyResetOtp);

router.post("/resend-reset-otp", mentorResendResetOtp);

router.post("/reset-password", mentorResetPassword);

// ==========================================
// CHANGE PASSWORD
// ==========================================

router.post("/change-password", protect, mentorChangePassword);

// ==========================================
// REFRESH TOKEN
// ==========================================

router.post("/refresh-token", mentorRefreshToken);

// ==========================================
// LOGOUT
// ==========================================

router.post("/logout", mentorLogout);

module.exports = router;
