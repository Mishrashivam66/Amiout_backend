"use strict";

const MentorMaster = require("../../academic/models/MentorMaster");

const { findRefreshToken } = require("../repositories/auth.repository");

const {
  ACCOUNT_MODELS,
  findAccountById,
  getAuthorizedAccountRoles,
  isAccountAllowed,
  normalizeEmail,
  normalizeRole,
} = require("../repositories/commonAuth.repository");

const { verifyRefreshToken, generateAccessToken } = require("../utils/jwt");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// HELPERS
// ==========================================

const normalizeAccountType = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const getTokenIssuedAtMs = (decoded) => {
  if (typeof decoded?.iat !== "number" || !Number.isFinite(decoded.iat)) {
    return null;
  }

  return decoded.iat * 1000;
};

// ==========================================
// VERIFY ACTIVE MENTOR MAPPING
// ==========================================

const hasActiveMentorMapping = async (account) => {
  const mapping = await MentorMaster.findOne({
    mentorEmail: normalizeEmail(account.email),
    isActive: true,
    isDeleted: false,
  })
    .select("_id")
    .lean();

  return Boolean(mapping);
};

// ==========================================
// RESOLVE CURRENT AUTHORIZED ROLES
// ==========================================

const resolveCurrentRoles = async (account, accountType) => {
  let roles = getAuthorizedAccountRoles(account, accountType)
    .map(normalizeRole)
    .filter(Boolean);

  roles = [...new Set(roles)];

  if (accountType === "FACULTY" && roles.includes("MENTOR")) {
    const hasMapping = await hasActiveMentorMapping(account);

    if (!hasMapping) {
      roles = roles.filter((role) => role !== "MENTOR");
    }
  }

  if (!roles.length) {
    throw new Error("No active authorized role assigned to this account.");
  }

  return roles;
};

// ==========================================
// REFRESH TOKEN SERVICE
// ==========================================

const refreshTokenService = async (refreshToken) => {
  // ========================================
  // VALIDATE INPUT
  // ========================================

  if (typeof refreshToken !== "string" || !refreshToken.trim()) {
    throw new Error("Refresh token is required.");
  }

  // ========================================
  // VERIFY REFRESH JWT
  // ========================================

  const decoded = verifyRefreshToken(refreshToken);

  if (!decoded?.id) {
    throw new Error("Invalid refresh token.");
  }

  // ========================================
  // FIND DATABASE SESSION
  // ========================================

  const session = await findRefreshToken(refreshToken);

  if (!session) {
    throw new Error("Invalid, expired or revoked refresh token.");
  }

  // ========================================
  // CHECK REVOCATION
  // ========================================

  if (session.isRevoked) {
    throw new Error("Refresh token has been revoked.");
  }

  // ========================================
  // CHECK EXPIRATION
  // ========================================

  const sessionExpiry = new Date(session.expiresAt).getTime();

  if (
    !session.expiresAt ||
    !Number.isFinite(sessionExpiry) ||
    sessionExpiry <= Date.now()
  ) {
    throw new Error("Refresh token has expired.");
  }

  // ========================================
  // VERIFY ACCOUNT ID
  // ========================================

  if (String(session.user) !== String(decoded.id)) {
    throw new Error("Refresh token account mismatch.");
  }

  // ========================================
  // VERIFY ACCOUNT TYPE
  // ========================================

  const accountType = normalizeAccountType(
    decoded.accountType || session.accountType || "STUDENT",
  );

  if (!ACCOUNT_MODELS[accountType]) {
    throw new Error("Unsupported account type.");
  }

  if (
    session.accountType &&
    normalizeAccountType(session.accountType) !== accountType
  ) {
    throw new Error("Refresh token account type mismatch.");
  }

  // ========================================
  // VERIFY SESSION ID
  // ========================================

  if (session.sessionId) {
    if (
      !decoded.sessionId ||
      String(decoded.sessionId) !== String(session.sessionId)
    ) {
      throw new Error("Refresh token session mismatch.");
    }
  } else {
    // Legacy sessions without sessionId
    // are accepted only for STUDENT.

    if (accountType !== "STUDENT") {
      throw new Error("Legacy session is not supported for this account.");
    }

    if (decoded.sessionId) {
      throw new Error("Invalid session configuration.");
    }
  }

  // ========================================
  // LOAD CURRENT ACCOUNT
  // ========================================

  const account = await findAccountById(decoded.id, accountType);

  if (!account) {
    throw new Error(AUTH_MESSAGES.USER_NOT_FOUND);
  }

  // ========================================
  // VERIFY ACCOUNT STATUS
  // ========================================

  if (!account.isActive) {
    throw new Error(AUTH_MESSAGES.ACCOUNT_DISABLED);
  }

  if (!account.isVerified) {
    throw new Error(AUTH_MESSAGES.ACCOUNT_NOT_VERIFIED);
  }

  if (!isAccountAllowed(account)) {
    throw new Error("Account is not authorized.");
  }

  // ========================================
  // PASSWORD CHANGE INVALIDATION
  // ========================================

  // This supplements database session
  // revocation performed by the password
  // change service.
  //
  // JWT iat is measured in seconds, so
  // reject tokens issued within the same
  // second as the password change too.

  if (account.passwordChangedAt) {
    const changedAtMs = new Date(account.passwordChangedAt).getTime();

    const issuedAtMs = getTokenIssuedAtMs(decoded);

    if (
      !Number.isFinite(changedAtMs) ||
      issuedAtMs === null ||
      issuedAtMs < Math.ceil(changedAtMs / 1000) * 1000
    ) {
      throw new Error(
        "Session expired after password change. Please login again.",
      );
    }
  }

  // ========================================
  // RESOLVE CURRENT AUTHORIZED ROLES
  // ========================================

  const roles = await resolveCurrentRoles(account, accountType);

  // ========================================
  // SELECT AUTHORIZED ACTIVE ROLE
  // ========================================

  const preferredRole = normalizeRole(account.role);

  const activeRole = roles.includes(preferredRole) ? preferredRole : roles[0];

  // ========================================
  // FIRST-LOGIN PASSWORD STATUS
  // ========================================

  const mustChangePassword = account.mustChangePassword === true;

  // ========================================
  // GENERATE ACCESS TOKEN
  // ========================================

  const accessToken = generateAccessToken({
    _id: account._id,
    email: account.email,
    accountType,
    role: activeRole,
    activeRole,
    roles,
  });

  // ========================================
  // RESPONSE
  // ========================================

  return {
    success: true,

    message: "Access token refreshed successfully.",

    accessToken,

    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",

    mustChangePassword,

    nextAction: mustChangePassword ? "CHANGE_PASSWORD" : null,
  };
};

module.exports = refreshTokenService;
