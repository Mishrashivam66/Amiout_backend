"use strict";

const { revokeRefreshToken } = require("../repositories/auth.repository");

// ==========================================
// COMMON LOGOUT SERVICE
// ==========================================

const logoutService = async (refreshToken) => {
  // ========================================
  // NO REFRESH TOKEN
  // ========================================

  if (!refreshToken) {
    return {
      success: true,
      message: "Logged out successfully.",
    };
  }

  // ========================================
  // REVOKE DATABASE SESSION
  // ========================================

  // Exact token match is sufficient.
  // Even an expired JWT can be revoked
  // if its session still exists.

  await revokeRefreshToken(refreshToken);

  // ========================================
  // RESPONSE
  // ========================================

  return {
    success: true,
    message: "Logged out successfully.",
  };
};

module.exports = logoutService;
