"use strict";

const Admin = require("../models/Admin");

// ==========================================
// GET ADMIN PROFILE
// ==========================================

const getAdminProfileService = async (adminId) => {
  const admin = await Admin.findById(adminId).select("-password -refreshToken");

  if (!admin) {
    throw new Error("Admin not found.");
  }

  return {
    success: true,
    user: admin,
  };
};

// ==========================================
// UPDATE ADMIN PROFILE
// ==========================================

const updateAdminProfileService = async (adminId, payload) => {
  const admin = await Admin.findByIdAndUpdate(adminId, payload, {
    new: true,
    runValidators: true,
  }).select("-password -refreshToken");

  if (!admin) {
    throw new Error("Admin not found.");
  }

  return {
    success: true,
    message: "Profile updated successfully.",
    user: admin,
  };
};

module.exports = {
  getAdminProfileService,
  updateAdminProfileService,
};
