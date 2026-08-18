"use strict";

const { findMentorById } = require("../repositories/mentor.repository");

const { revokeAllUserTokens } = require("../repositories/auth.repository");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// CHANGE PASSWORD SERVICE
// ==========================================

const mentorChangePasswordService = async (
  mentorId,
  oldPassword,
  newPassword,
) => {
  // ==========================================
  // FIND MENTOR
  // ==========================================

  const mentor = await findMentorById(mentorId);

  if (!mentor) {
    throw new Error(AUTH_MESSAGES.USER_NOT_FOUND);
  }

  // ==========================================
  // VERIFY OLD PASSWORD
  // ==========================================

  const isPasswordMatched = await mentor.matchPassword(oldPassword);

  if (!isPasswordMatched) {
    throw new Error("Old password is incorrect.");
  }

  // ==========================================
  // SAME PASSWORD CHECK
  // ==========================================

  if (oldPassword === newPassword) {
    throw new Error("New password must be different from the old password.");
  }

  // ==========================================
  // UPDATE PASSWORD
  // ==========================================

  mentor.password = newPassword;

  mentor.passwordChangedAt = new Date();

  await mentor.save();

  // ==========================================
  // LOGOUT FROM ALL DEVICES
  // ==========================================

  await revokeAllUserTokens(mentor._id);

  // ==========================================
  // RESPONSE
  // ==========================================

  return {
    success: true,
    message: AUTH_MESSAGES.PASSWORD_CHANGED,
  };
};

module.exports = mentorChangePasswordService;
