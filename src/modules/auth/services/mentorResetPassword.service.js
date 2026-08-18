"use strict";

const { findMentorByEmail } = require("../repositories/mentor.repository");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// RESET PASSWORD SERVICE
// ==========================================

const mentorResetPasswordService = async (email, password) => {
  // ==========================================
  // FIND MENTOR
  // ==========================================

  const mentor = await findMentorByEmail(email);

  if (!mentor) {
    throw new Error(AUTH_MESSAGES.USER_NOT_FOUND);
  }

  // ==========================================
  // UPDATE PASSWORD
  // ==========================================

  mentor.password = password;

  mentor.passwordChangedAt = new Date();

  // ==========================================
  // SAVE MENTOR
  // ==========================================

  await mentor.save();

  // ==========================================
  // RESPONSE
  // ==========================================

  return {
    success: true,
    message: AUTH_MESSAGES.PASSWORD_RESET_SUCCESS,
  };
};

module.exports = mentorResetPasswordService;
