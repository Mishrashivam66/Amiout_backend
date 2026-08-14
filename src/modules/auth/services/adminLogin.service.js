"use strict";

const {
  findAdminByEmail,
  updateAdmin,
} = require("../repositories/admin.repository");

const { generateAccessToken, generateRefreshToken } = require("../utils/jwt");

// ==========================================
// ADMIN LOGIN
// ==========================================

const adminLoginService = async (email, password) => {
  // ==========================================
  // FIND ADMIN
  // ==========================================

  const admin = await findAdminByEmail(email);

  if (!admin) {
    throw new Error("Invalid email or password.");
  }

  // ==========================================
  // VERIFY ACCOUNT
  // ==========================================

  if (!admin.isVerified) {
    throw new Error("Please verify your account.");
  }

  if (!admin.isActive) {
    throw new Error("Your account has been deactivated.");
  }

  // ==========================================
  // VERIFY PASSWORD
  // ==========================================

  const isMatch = await admin.matchPassword(password);

  if (!isMatch) {
    throw new Error("Invalid email or password.");
  }

  // ==========================================
  // GENERATE TOKENS
  // ==========================================

  const accessToken = generateAccessToken({
    _id: admin._id,
    email: admin.email,
    role: admin.role,
  });

  const refreshToken = generateRefreshToken({
    _id: admin._id,
  });

  // ==========================================
  // UPDATE LOGIN DETAILS
  // ==========================================

  await updateAdmin(admin._id, {
    refreshToken,
    lastLogin: new Date(),
  });

  // ==========================================
  // RESPONSE
  // ==========================================

  return {
    success: true,
    message: "Admin login successful.",
    accessToken,
    refreshToken,
    user: {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      isVerified: admin.isVerified,
    },
  };
};

module.exports = adminLoginService;
