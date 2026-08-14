"use strict";

const express = require("express");

const router = express.Router();

const { protect } = require("../../../middlewares/auth.middleware");

const {
  adminRegister,
  adminLogin,
  adminVerifyOtp,
  adminResendOtp,
  getAdminProfile,
  updateAdminProfile,
} = require("../controllers/admin.controller");

// ==========================================
// ADMIN REGISTER
// ==========================================

router.post("/register", adminRegister);

// ==========================================
// VERIFY OTP
// ==========================================

router.post("/verify-otp", adminVerifyOtp);

// ==========================================
// RESEND OTP
// ==========================================

router.post("/resend-otp", adminResendOtp);

// ==========================================
// ADMIN LOGIN
// ==========================================

router.post("/login", adminLogin);

// ==========================================
// ADMIN PROFILE
// ==========================================

router.get("/me", protect, getAdminProfile);

router.put("/profile", protect, updateAdminProfile);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
