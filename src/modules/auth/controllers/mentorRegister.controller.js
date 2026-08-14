"use strict";
const mentorRegisterService = require("../services/mentorRegister.service");
const mentorLoginService = require("../services/mentorLogin.service");
const {
  getMentorProfileService,
  updateMentorProfileService,
} = require("../services/mentorProfile.service");
// ==========================================
// MENTOR REGISTER
// ==========================================

const mentorRegister = async (req, res, next) => {
  try {
    const result = await mentorRegisterService(req.body);

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// MENTOR LOGIN
// ==========================================

// ==========================================
// MENTOR LOGIN
// ==========================================

const mentorLogin = async (req, res) => {
  try {
    const result = await mentorLoginService(req.body.email, req.body.password);

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
    console.error("========== MENTOR LOGIN ERROR ==========");
    console.error(error);
    console.error(error.stack);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
const getMentorProfile = async (req, res, next) => {
  try {
    const result = await getMentorProfileService(req.user._id);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const updateMentorProfile = async (req, res, next) => {
  try {
    const result = await updateMentorProfileService(req.user._id, req.body);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
module.exports = Object.freeze({
  mentorRegister,
  mentorLogin,
  getMentorProfile,
  updateMentorProfile,
});
