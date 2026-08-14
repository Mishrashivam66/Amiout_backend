const User = require("../models/User");
const Mentor = require("../models/Mentor");
const OTP = require("../models/OTP");
const RefreshToken = require("../models/RefreshToken");

// ==========================================
// USER
// ==========================================

const createUser = async (userData) => {
  return await User.create(userData);
};

const findUserById = async (id) => {
  let user = await User.findById(id);

  if (user) return user;

  return await Mentor.findById(id);
};

const findUserByEmail = async (email) => {
  return await User.findOne({ email }).select("+password");
};

const findVerifiedUserByEmail = async (email) => {
  return await User.findOne({
    email,
    isVerified: true,
  }).select("+password");
};

const updateUser = async (id, data) => {
  let user = await User.findById(id);

  if (user) {
    return await User.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
  }

  return await Mentor.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
};

const saveUser = async (user) => {
  return await user.save();
};

// ==========================================
// OTP
// ==========================================

const createOTP = async (otpData) => {
  return await OTP.create(otpData);
};

const findOTP = async (email, purpose) => {
  return await OTP.findOne({
    email,
    purpose,
  }).select("+otp");
};

const deleteOTP = async (email, purpose) => {
  return await OTP.deleteMany({
    email,
    purpose,
  });
};

const incrementOtpAttempts = async (id) => {
  return await OTP.findByIdAndUpdate(
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
// REFRESH TOKEN
// ==========================================

const saveRefreshToken = async (tokenData) => {
  return await RefreshToken.create(tokenData);
};

const findRefreshToken = async (token) => {
  return await RefreshToken.findOne({
    token,
    isRevoked: false,
  }).select("+token");
};

const revokeRefreshToken = async (token) => {
  return await RefreshToken.findOneAndUpdate(
    {
      token,
    },
    {
      isRevoked: true,
    },
  );
};

const revokeAllUserTokens = async (userId) => {
  return await RefreshToken.updateMany(
    {
      user: userId,
    },
    {
      isRevoked: true,
    },
  );
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // User
  createUser,
  findUserById,
  findUserByEmail,
  findVerifiedUserByEmail,
  updateUser,
  saveUser,

  // OTP
  createOTP,
  findOTP,
  deleteOTP,
  incrementOtpAttempts,

  // Refresh Token
  saveRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
};
