"use strict";

const { revokeAllUserTokens } = require("../repositories/auth.repository");

const {
  normalizeAccountType,
  ACCOUNT_MODELS,
} = require("../repositories/commonAuth.repository");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// PASSWORD VALIDATION
// ==========================================

const validateNewPassword = (password) => {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  ) {
    throw new Error("New password must be between 8 and 128 characters.");
  }

  if (
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new Error(
      "New password must contain uppercase, lowercase, number and special character.",
    );
  }
};

// ==========================================
// CHANGE PASSWORD SERVICE
// ==========================================

const changePasswordService = async (
  userId,
  oldPassword,
  newPassword,
  accountType = "STUDENT",
) => {
  // ========================================
  // VALIDATE ACCOUNT TYPE
  // ========================================

  const normalizedAccountType = normalizeAccountType(accountType);

  const AccountModel = ACCOUNT_MODELS[normalizedAccountType];

  if (!AccountModel) {
    throw new Error("Invalid account type.");
  }

  // ========================================
  // VALIDATE INPUT
  // ========================================

  if (
    typeof oldPassword !== "string" ||
    !oldPassword ||
    typeof newPassword !== "string" ||
    !newPassword
  ) {
    throw new Error("Old password and new password are required.");
  }

  validateNewPassword(newPassword);

  // ========================================
  // FIND ACCOUNT WITH PASSWORD
  // ========================================

  const account = await AccountModel.findById(userId).select("+password");

  if (!account) {
    throw new Error(AUTH_MESSAGES.USER_NOT_FOUND);
  }

  // ========================================
  // VERIFY OLD PASSWORD
  // ========================================

  const isPasswordMatched = await account.matchPassword(oldPassword);

  if (!isPasswordMatched) {
    throw new Error("Old password is incorrect.");
  }

  // ========================================
  // PREVENT PASSWORD REUSE
  // ========================================

  if (oldPassword === newPassword) {
    throw new Error("New password must be different from the old password.");
  }

  const matchesCurrentPassword = await account.matchPassword(newPassword);

  if (matchesCurrentPassword) {
    throw new Error("New password must be different from the old password.");
  }

  // ========================================
  // UPDATE PASSWORD
  // ========================================

  // The account model's pre-save hook
  // must hash the password.

  account.password = newPassword;

  account.passwordChangedAt = new Date();

  // ========================================
  // COMPLETE FIRST-LOGIN SETUP
  // ========================================

  // Clear the mandatory password change
  // requirement after successful update.

  account.mustChangePassword = false;

  // ========================================
  // SAVE ACCOUNT
  // ========================================

  await account.save();

  // ========================================
  // REVOKE ALL REFRESH SESSIONS
  // ========================================

  await revokeAllUserTokens(account._id, normalizedAccountType);

  // ========================================
  // RESPONSE
  // ========================================

  return {
    success: true,
    message: AUTH_MESSAGES.PASSWORD_CHANGED,
    requireLogin: true,
  };
};

module.exports = changePasswordService;
