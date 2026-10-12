"use strict";

const MentorMaster = require("../../academic/models/MentorMaster");

const {
  findAccountByEmail,
  updateAccountLastLogin,
  getAuthorizedAccountRoles,
  normalizeEmail,
  normalizeRole,
  isAccountAllowed,
} = require("../repositories/commonAuth.repository");

const { saveRefreshToken } = require("../repositories/auth.repository");

const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require("../utils/jwt");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// VERIFY MENTOR MASTER MAPPING
// ==========================================

const verifyMentorMapping = async (account) => {
  const mentorMaster = await MentorMaster.findOne({
    mentorEmail: normalizeEmail(account.email),
    isActive: true,
    isDeleted: false,
  });

  if (!mentorMaster) {
    return false;
  }

  await MentorMaster.updateOne(
    { _id: mentorMaster._id },
    {
      $set: {
        mentorUser: account._id,
      },
    },
  );

  return true;
};

// ==========================================
// RESOLVE AUTHORIZED ROLES
// ==========================================

const resolveLoginRoles = async (account, accountType) => {
  let roles = getAuthorizedAccountRoles(account, accountType);

  if (accountType === "FACULTY" && roles.includes("MENTOR")) {
    const hasMentorMapping = await verifyMentorMapping(account);

    if (!hasMentorMapping) {
      roles = roles.filter((role) => role !== "MENTOR");
    }
  }

  if (!roles.length) {
    throw new Error(
      "No active authorized role assigned. Contact administrator.",
    );
  }

  return roles;
};

// ==========================================
// COMMON LOGIN SERVICE
// ==========================================

const loginService = async (email, password, deviceInfo = {}) => {
  // ========================================
  // VALIDATE INPUT
  // ========================================

  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || typeof password !== "string" || !password) {
    throw new Error(AUTH_MESSAGES.INVALID_CREDENTIALS);
  }

  // ========================================
  // FIND ACCOUNT
  // ========================================

  const result = await findAccountByEmail(normalizedEmail);

  if (!result) {
    throw new Error(AUTH_MESSAGES.INVALID_CREDENTIALS);
  }

  const { accountType, account } = result;

  // ========================================
  // VERIFY PASSWORD
  // ========================================

  const isPasswordCorrect = await account.matchPassword(password);

  if (!isPasswordCorrect) {
    throw new Error(AUTH_MESSAGES.INVALID_CREDENTIALS);
  }

  // ========================================
  // CHECK ACCOUNT STATUS
  // ========================================

  if (!account.isVerified) {
    throw new Error(AUTH_MESSAGES.ACCOUNT_NOT_VERIFIED);
  }

  if (!account.isActive) {
    throw new Error(AUTH_MESSAGES.ACCOUNT_DISABLED);
  }

  if (!isAccountAllowed(account)) {
    throw new Error("Account is not authorized.");
  }

  // ========================================
  // FIRST-LOGIN PASSWORD CHANGE
  // ========================================

  const mustChangePassword = account.mustChangePassword === true;

  // ========================================
  // RESOLVE CURRENT ROLES
  // ========================================

  const roles = await resolveLoginRoles(account, accountType);

  const preferredRole = normalizeRole(account.role);

  const primaryRole = roles.includes(preferredRole) ? preferredRole : roles[0];

  // ========================================
  // PREPARE JWT PAYLOAD
  // ========================================

  const tokenUser = {
    _id: account._id,
    email: account.email,
    accountType,
    role: primaryRole,
    activeRole: primaryRole,
    roles,
  };

  // ========================================
  // GENERATE TOKENS
  // ========================================

  const accessToken = generateAccessToken(tokenUser);

  const refreshToken = generateRefreshToken(tokenUser);

  // ========================================
  // VERIFY REFRESH PAYLOAD
  // ========================================

  const refreshPayload = verifyRefreshToken(refreshToken);

  if (
    !refreshPayload.sessionId ||
    !refreshPayload.exp ||
    String(refreshPayload.id) !== String(account._id) ||
    refreshPayload.accountType !== accountType
  ) {
    throw new Error("Unable to create a valid login session.");
  }

  // ========================================
  // SAVE LOGIN SESSION
  // ========================================

  await saveRefreshToken({
    user: account._id,
    accountType,

    token: refreshToken,
    sessionId: refreshPayload.sessionId,

    device: deviceInfo.device || "Unknown Device",

    browser: deviceInfo.browser || "",

    operatingSystem: deviceInfo.operatingSystem || "",

    ipAddress: deviceInfo.ipAddress || "",

    isRevoked: false,

    expiresAt: new Date(refreshPayload.exp * 1000),
  });

  // ========================================
  // UPDATE LAST LOGIN
  // ========================================

  await updateAccountLastLogin(account._id, accountType);

  // ========================================
  // RETURN LOGIN RESPONSE
  // ========================================

  return {
    success: true,

    message: mustChangePassword
      ? "Login successful. You must change your temporary password before continuing."
      : AUTH_MESSAGES.LOGIN_SUCCESS,

    accessToken,
    refreshToken,

    mustChangePassword,

    nextAction: mustChangePassword ? "CHANGE_PASSWORD" : null,

    user: {
      id: account._id,
      name: account.name,
      email: account.email,

      accountType,
      role: primaryRole,
      roles,

      isVerified: account.isVerified,
      isActive: account.isActive,

      mustChangePassword,

      ...(accountType === "FACULTY" && {
        employeeId: account.employeeId,
      }),

      ...(accountType === "SECURITY" && {
        employeeId: account.employeeId,
        assignedGate: account.assignedGate,
      }),

      ...(accountType === "STUDENT" && {
        enrollmentNo: account.enrollmentNo,
      }),
    },
  };
};

module.exports = loginService;
