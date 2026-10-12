"use strict";

const express = require("express");

const router = express.Router();

const {
  protect,
  requireRoles,
} = require("../../../middlewares/auth.middleware");

const {
  adminRegister,
  adminLogin,
  adminVerifyOtp,
  adminResendOtp,
  getAdminProfile,
  updateAdminProfile,
} = require("../controllers/admin.controller");

// ==========================================
// ADMIN REGISTRATION
// ==========================================

// Only authenticated ADMIN can create
// another ADMIN account.
//
// SUPER_ADMIN cannot use this endpoint.

router.post("/register", protect, requireRoles("ADMIN"), adminRegister);

// ==========================================
// ACCOUNT ACTIVATION OTP
// ==========================================

// Public endpoints because a newly
// provisioned Admin cannot log in
// before completing verification.
//
// OTP validation and rate limiting
// must be enforced by the services.

router.post("/verify-otp", adminVerifyOtp);

router.post("/resend-otp", adminResendOtp);

// ==========================================
// LEGACY ADMIN LOGIN
// ==========================================

// Preserved for compatibility.
// Enterprise frontend will eventually
// use the common /auth/login endpoint.

router.post("/login", adminLogin);

// ==========================================
// ADMIN PROFILE
// ==========================================

router.get(
  "/me",
  protect,
  requireRoles("ADMIN", "SUPER_ADMIN"),
  getAdminProfile,
);

// SUPER_ADMIN has read-only profile access.

router.put("/profile", protect, requireRoles("ADMIN"), updateAdminProfile);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
