"use strict";

const adminRegisterService = require("../services/adminRegister.service");
const adminLoginService = require("../services/adminLogin.service");

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
    const result = await adminRegisterService(req.body);

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// ADMIN LOGIN
// ==========================================

const adminLogin = async (req, res) => {
  try {
    const result = await adminLoginService(req.body.email, req.body.password);

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
    console.error("========== ADMIN LOGIN ERROR ==========");
    console.error(error);
    console.error(error.stack);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// VERIFY OTP
// ==========================================

const adminVerifyOtp = async (req, res, next) => {
  try {
    const result = await adminVerifyOtpService(req.body.email, req.body.otp);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// RESEND OTP
// ==========================================

const adminResendOtp = async (req, res, next) => {
  try {
    const result = await adminResendOtpService(req.body.email);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// GET PROFILE
// ==========================================

const getAdminProfile = async (req, res, next) => {
  try {
    const result = await getAdminProfileService(req.user._id);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// UPDATE PROFILE
// ==========================================

const updateAdminProfile = async (req, res, next) => {
  try {
    const result = await updateAdminProfileService(req.user._id, req.body);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// EXPORT
// ==========================================

module.exports = Object.freeze({
  adminRegister,
  adminLogin,
  adminVerifyOtp,
  adminResendOtp,
  getAdminProfile,
  updateAdminProfile,
});
