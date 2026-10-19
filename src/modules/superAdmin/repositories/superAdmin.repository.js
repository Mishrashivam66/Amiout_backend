"use strict";

const Admin = require("../../auth/models/Admin");
const User = require("../../auth/models/User");
const Mentor = require("../../auth/models/Mentor");
const Security = require("../../auth/models/SecurityTemp");

// ============================================================
// AMIOUT ENTERPRISE - SUPER ADMIN REPOSITORY
// All database operations for Admin management.
// ============================================================

const findSuperAdminById = async (id) => {
  return Admin.findOne({
    _id: id,
    role: "SUPER_ADMIN",
    isActive: true,
    isVerified: true,
  }).select("_id name email role isActive isVerified mustChangePassword");
};

const findExistingEmail = async (email) => {
  const [admin, student, faculty, security] = await Promise.all([
    Admin.exists({ email }),
    User.exists({ email }),
    Mentor.exists({ email }),
    Security.exists({ email }),
  ]);

  return Boolean(admin || student || faculty || security);
};

const createAdminAccount = async (data) => {
  return Admin.create(data);
};

const getAllAdmins = async () => {
  return Admin.find({
    role: "ADMIN",
  })
    .select(
      "name email phone role roles isVerified isActive " +
        "mustChangePassword lastLogin createdAt updatedAt",
    )
    .sort({ createdAt: -1 })
    .lean();
};

const findAdminById = async (id) => {
  return Admin.findOne({
    _id: id,
    role: "ADMIN",
  });
};

const updateAdminStatus = async (id, isActive) => {
  return Admin.findOneAndUpdate(
    {
      _id: id,
      role: "ADMIN",
    },
    {
      $set: { isActive },
    },
    {
      new: true,
      runValidators: true,
    },
  ).select(
    "name email phone role isVerified isActive " +
      "mustChangePassword lastLogin createdAt updatedAt",
  );
};

module.exports = Object.freeze({
  findSuperAdminById,
  findExistingEmail,
  createAdminAccount,
  getAllAdmins,
  findAdminById,
  updateAdminStatus,
});
