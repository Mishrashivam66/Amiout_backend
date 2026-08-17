"use strict";

const MentorMaster = require("../../academic/models/MentorMaster");

const {
  findMentorByEmail,
  updateMentor,
} = require("../repositories/mentor.repository");

const { generateAccessToken, generateRefreshToken } = require("../utils/jwt");

// ==========================================
// MENTOR LOGIN
// ==========================================

const mentorLoginService = async (email, password) => {
  // ==========================================
  // FIND MENTOR
  // ==========================================

  const mentor = await findMentorByEmail(email);

  if (!mentor) {
    throw new Error("Invalid email or password.");
  }

  // ==========================================
  // VERIFY EMAIL
  // ==========================================

  if (!mentor.isVerified) {
    throw new Error("Please verify your email first.");
  }

  // ==========================================
  // ACTIVE CHECK
  // ==========================================

  if (!mentor.isActive) {
    throw new Error("Your account has been deactivated.");
  }

  // ==========================================
  // PASSWORD CHECK
  // ==========================================

  const isMatch = await mentor.matchPassword(password);

  if (!isMatch) {
    throw new Error("Invalid email or password.");
  }

  // ==========================================
  // ACCESS TOKEN
  // ==========================================

  const accessToken = generateAccessToken({
    _id: mentor._id,
    email: mentor.email,
    role: mentor.role,
  });

  const refreshToken = generateRefreshToken({
    _id: mentor._id,
  });

  // ==========================================
  // UPDATE LOGIN DETAILS
  // ==========================================
  // ==========================================
  // LINK MENTOR WITH MENTOR MASTER
  // ==========================================
  // ==========================================
  // LINK MENTOR WITH MENTOR MASTER
  // ==========================================

  const mentorMaster = await MentorMaster.findOne({
    mentorEmail: mentor.email.trim().toLowerCase(),
    isActive: true,
    isDeleted: false,
  });

  if (!mentorMaster) {
    throw new Error("MentorMaster mapping not found.");
  }

  await MentorMaster.updateOne(
    { _id: mentorMaster._id },
    {
      $set: {
        mentorUser: mentor._id,
      },
    },
  );
  await updateMentor(mentor._id, {
    refreshToken,
    lastLogin: new Date(),
  });

  // ==========================================
  // RESPONSE
  // ==========================================

  return {
    success: true,
    message: "Mentor login successful.",
    accessToken,
    refreshToken,
    user: {
      id: mentor._id,
      name: mentor.name,
      email: mentor.email,
      employeeId: mentor.employeeId,
      role: mentor.role,
      isVerified: mentor.isVerified,
    },
  };
};

module.exports = mentorLoginService;
