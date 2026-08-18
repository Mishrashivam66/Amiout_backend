"use strict";

const { findRefreshToken } = require("../repositories/auth.repository");

const { findMentorById } = require("../repositories/mentor.repository");

const { verifyRefreshToken, generateAccessToken } = require("../utils/jwt");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// REFRESH TOKEN SERVICE
// ==========================================

const mentorRefreshTokenService = async (refreshToken) => {
  // ==========================================
  // TOKEN REQUIRED
  // ==========================================

  if (!refreshToken) {
    throw new Error("Refresh token is required.");
  }

  // ==========================================
  // VERIFY JWT
  // ==========================================

  const decoded = verifyRefreshToken(refreshToken);

  // ==========================================
  // FIND TOKEN
  // ==========================================

  const token = await findRefreshToken(refreshToken);

  if (!token) {
    throw new Error("Invalid refresh token.");
  }

  // ==========================================
  // REVOKED
  // ==========================================

  if (token.isRevoked) {
    throw new Error("Refresh token has expired.");
  }

  // ==========================================
  // FIND MENTOR
  // ==========================================

  const mentor = await findMentorById(decoded.id);

  if (!mentor) {
    throw new Error(AUTH_MESSAGES.USER_NOT_FOUND);
  }

  if (!mentor.isActive) {
    throw new Error(AUTH_MESSAGES.ACCOUNT_DISABLED);
  }

  // ==========================================
  // NEW ACCESS TOKEN
  // ==========================================

  const accessToken = generateAccessToken({
    _id: mentor._id,
    email: mentor.email,
    role: mentor.role,
  });

  // ==========================================
  // RESPONSE
  // ==========================================

  return {
    success: true,
    accessToken,
    expiresIn: "15m",
  };
};

module.exports = mentorRefreshTokenService;
