const express = require("express");
const router = express.Router();
const { protect } = require("../../../middlewares/auth.middleware");
const {
  mentorRegister,
  mentorLogin,
  getMentorProfile,
  updateMentorProfile,
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

module.exports = router;
