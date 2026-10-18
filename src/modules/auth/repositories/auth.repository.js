"use strict";

const mongoose = require("mongoose");

const User = require("../models/User");
const Mentor = require("../models/Mentor");
const OTP = require("../models/OTP");
const RefreshToken = require("../models/RefreshToken");

const {
  ACCOUNT_MODELS,
  normalizeEmail,
  normalizeAccountType,
  findAccountById: findCommonAccountById,
} = require("./commonAuth.repository");

// ==========================================
// USER - LEGACY FUNCTIONS
// ==========================================

const createUser = async (userData) => {
  return User.create(userData);
};

const findUserById = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    return null;
  }

  const student = await User.findById(id);

  if (student) {
    return student;
  }

  return Mentor.findById(id);
};

const findUserByEmail = async (email) => {
  return User.findOne({
    email: normalizeEmail(email),
  }).select("+password");
};

const findVerifiedUserByEmail = async (email) => {
  return User.findOne({
    email: normalizeEmail(email),
    isVerified: true,
  }).select("+password");
};

const updateUser = async (id, data) => {
  if (!mongoose.isValidObjectId(id)) {
    return null;
  }

  const student = await User.findById(id);

  if (student) {
    return User.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
  }

  return Mentor.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
};

const saveUser = async (user) => {
  return user.save();
};

const findUserByEnrollment = async (enrollmentNo) => {
  return User.findOne({ enrollmentNo });
};

const findUserByMobile = async (mobileNumber) => {
  return User.findOne({ mobileNumber });
};

// ==========================================
// COMMON ACCOUNT LOOKUP
// ==========================================

const findAccountById = async (id, accountType, includePassword = false) => {
  return findCommonAccountById(id, accountType, includePassword);
};

// ==========================================
// OTP
// ==========================================

const createOTP = async (otpData) => {
  return OTP.create(otpData);
};

const findOTP = async (email, purpose) => {
  return OTP.findOne({
    email: normalizeEmail(email),
    purpose,
  }).select("+otp");
};

const deleteOTP = async (email, purpose) => {
  return OTP.deleteMany({
    email: normalizeEmail(email),
    purpose,
  });
};

const incrementOtpAttempts = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    return null;
  }

  return OTP.findByIdAndUpdate(
    id,
    {
      $inc: {
        attempts: 1,
      },
    },
    {
      new: true,
    },
  );
};

// ==========================================
// REFRESH TOKEN - CREATE SESSION
// ==========================================

const saveRefreshToken = async (tokenData) => {
  if (
    !tokenData ||
    !mongoose.isValidObjectId(tokenData.user) ||
    typeof tokenData.token !== "string" ||
    !tokenData.token.trim()
  ) {
    throw new Error("Valid account ID and refresh token are required.");
  }

  const accountType = normalizeAccountType(tokenData.accountType || "STUDENT");

  if (!ACCOUNT_MODELS[accountType]) {
    throw new Error("Invalid session account type.");
  }

  const expiresAt = new Date(tokenData.expiresAt);

  if (
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now()
  ) {
    throw new Error("Invalid refresh token expiry.");
  }

  // New sessions must contain sessionId.
  if (typeof tokenData.sessionId !== "string" || !tokenData.sessionId.trim()) {
    throw new Error("Session ID is required.");
  }

  return RefreshToken.create({
    ...tokenData,
    accountType,
    expiresAt,
    isRevoked: false,
  });
};

// ==========================================
// REFRESH TOKEN - FIND SESSION
// ==========================================

const findRefreshToken = async (token) => {
  if (typeof token !== "string" || !token.trim()) {
    return null;
  }

  return RefreshToken.findOne({
    token,
    isRevoked: false,
    expiresAt: {
      $gt: new Date(),
    },
  }).select("+token");
};

// ==========================================
// REFRESH TOKEN - REVOKE SESSION
// ==========================================

const revokeRefreshToken = async (token) => {
  if (typeof token !== "string" || !token.trim()) {
    return null;
  }

  return RefreshToken.findOneAndUpdate(
    {
      token,
      isRevoked: false,
    },
    {
      $set: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    },
    {
      new: true,
    },
  );
};

// ==========================================
// REFRESH TOKEN - REVOKE ALL SESSIONS
// ==========================================

const revokeAllUserTokens = async (userId, accountType = "STUDENT") => {
  if (!mongoose.isValidObjectId(userId)) {
    return null;
  }

  const type = normalizeAccountType(accountType);

  if (!ACCOUNT_MODELS[type]) {
    throw new Error("Invalid account type.");
  }

  return RefreshToken.updateMany(
    {
      user: userId,
      accountType: type,
      isRevoked: false,
    },
    {
      $set: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    },
  );
};

// ==========================================
// REFRESH TOKEN - ACTIVE SESSIONS
// ==========================================

const findActiveSessions = async (userId, accountType) => {
  const type = normalizeAccountType(accountType);

  if (!mongoose.isValidObjectId(userId) || !ACCOUNT_MODELS[type]) {
    return [];
  }

  return RefreshToken.find({
    user: userId,
    accountType: type,
    isRevoked: false,
    expiresAt: {
      $gt: new Date(),
    },
  })
    .select("-token -tokenHash")
    .sort({ createdAt: -1 });
};

// ==========================================
// UPDATE AUTHORIZED FACULTY SESSION ROLE
// ==========================================

const updateSessionActiveRole = async ({
  token,
  userId,
  sessionId,
  activeRole,
}) => {
  if (
    typeof token !== "string" ||
    !token.trim() ||
    !mongoose.isValidObjectId(userId) ||
    typeof sessionId !== "string" ||
    !sessionId.trim() ||
    !["MENTOR", "COORDINATOR", "HOD", "HOI"].includes(activeRole)
  ) {
    return null;
  }

  return RefreshToken.findOneAndUpdate(
    {
      token,
      user: userId,
      accountType: "FACULTY",
      sessionId,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    },
    {
      $set: { activeRole },
    },
    {
      new: true,
      runValidators: true,
    },
  );
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Existing user functions
  createUser,
  findUserById,
  findUserByEmail,
  findVerifiedUserByEmail,
  findUserByEnrollment,
  findUserByMobile,
  updateUser,
  saveUser,

  // Common account
  findAccountById,

  // OTP
  createOTP,
  findOTP,
  deleteOTP,
  incrementOtpAttempts,

  // Sessions
  saveRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  findActiveSessions,

  updateSessionActiveRole,
};
