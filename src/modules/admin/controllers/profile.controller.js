"use strict";

const asyncHandler = require("express-async-handler");

// ============================================================================
// Get Logged In Admin Profile
// ============================================================================

const getProfile = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Admin profile fetched successfully.",
    data: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      role: req.user.role,
      profilePhoto: req.user.profilePhoto,
      isVerified: req.user.isVerified,
      isActive: req.user.isActive,
      lastLogin: req.user.lastLogin,
      createdAt: req.user.createdAt,
    },
  });
});

module.exports = Object.freeze({
  getProfile,
});
