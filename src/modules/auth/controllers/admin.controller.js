"use strict";

const adminRegisterService = require("../services/adminRegister.service");

const loginService = require("../services/login.service");

const adminVerifyOtpService = require("../services/adminVerifyOtp.service");

const adminResendOtpService = require("../services/adminResendOtp.service");

const {
  getAdminProfileService,
  updateAdminProfileService,
} = require("../services/adminProfile.service");

// ==========================================
// ADMIN REGISTER
// ==========================================

const adminRegister = async (req, res, next) => {
  try {
    // Authenticated ADMIN actor is required.
    // Service also enforces authorization.

    const result = await adminRegisterService(req.body, req.auth);

    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
};

// ==========================================
// LEGACY ADMIN LOGIN
// ==========================================

// Kept temporarily for compatibility.
// Uses the common login service.

const adminLogin = async (req, res, next) => {
  try {
    const result = await loginService(req.body.email, req.body.password);

    // Never allow a non-admin account
    // through the legacy admin endpoint.

    if (result.user?.accountType !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "This endpoint is only for Admin accounts.",
      });
    }

    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: result.success,
      message: result.message,
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (error) {
    return next(error);
  }
};

// ==========================================
// ADMIN VERIFY OTP
// ==========================================

const adminVerifyOtp = async (req, res, next) => {
  try {
    const result = await adminVerifyOtpService(req.body.email, req.body.otp);

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

// ==========================================
// ADMIN RESEND OTP
// ==========================================

const adminResendOtp = async (req, res, next) => {
  try {
    const result = await adminResendOtpService(req.body.email);

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

// ==========================================
// GET ADMIN PROFILE
// ==========================================

const getAdminProfile = async (req, res, next) => {
  try {
    const result = await getAdminProfileService(req.user._id);

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

// ==========================================
// UPDATE ADMIN PROFILE
// ==========================================

const updateAdminProfile = async (req, res, next) => {
  try {
    // SUPER_ADMIN remains read-only.

    if (req.auth?.role === "SUPER_ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Super Admin has read-only access.",
      });
    }

    const result = await updateAdminProfileService(req.user._id, req.body);

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = Object.freeze({
  adminRegister,
  adminLogin,
  adminVerifyOtp,
  adminResendOtp,
  getAdminProfile,
  updateAdminProfile,
});
