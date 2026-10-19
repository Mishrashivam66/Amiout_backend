"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");

const repository = require("../repositories/superAdmin.repository");

// ============================================================
// AMIOUT ENTERPRISE - SUPER ADMIN SERVICE
//
// Only verified SUPER_ADMIN accounts can manage Admins.
// No public registration.
// No role input accepted from frontend.
// No Admin deletion.
// ============================================================

const makeError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

const normalizeText = (value) => String(value || "").trim();

const requireSuperAdmin = async (actorId) => {
  if (!actorId || !mongoose.isValidObjectId(actorId)) {
    throw makeError("Authentication required.", 401);
  }

  const actor = await repository.findSuperAdminById(actorId);

  if (!actor) {
    throw makeError(
      "Only an authorized Super Admin can perform this action.",
      403,
    );
  }

  if (actor.mustChangePassword === true) {
    throw makeError(
      "Please change your initial password before continuing.",
      403,
    );
  }

  return actor;
};

// ============================================================
// GENERATE CRYPTOGRAPHICALLY SECURE PASSWORD
// ============================================================

const generateTemporaryPassword = () => {
  return crypto.randomBytes(24).toString("base64url") + "!Aa1";
};

// ============================================================
// CREATE ADMIN
// ============================================================

const createAdmin = async (actorId, input = {}) => {
  await requireSuperAdmin(actorId);

  const name = normalizeText(input.name);
  const email = normalizeEmail(input.email);
  const phone = normalizeText(input.phone);

  if (name.length < 3 || name.length > 100) {
    throw makeError("Admin name must be between 3 and 100 characters.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw makeError("Enter a valid email address.");
  }

  if (!email.endsWith("@gwa.amity.edu")) {
    throw makeError("Admin email must belong to gwa.amity.edu.");
  }

  if (!/^[0-9]{10}$/.test(phone)) {
    throw makeError("Mobile number must contain exactly 10 digits.");
  }

  // The login repository searches across account models.
  // The same email must not belong to multiple accounts.
  const exists = await repository.findExistingEmail(email);

  if (exists) {
    throw makeError("An account with this email already exists.", 409);
  }

  const temporaryPassword = generateTemporaryPassword();

  let admin;

  try {
    // Admin model automatically bcrypt-hashes password.
    admin = await repository.createAdminAccount({
      name,
      email,
      phone,

      password: temporaryPassword,

      // Enforced server-side; never read role from input.
      role: "ADMIN",

      isActive: true,
      isVerified: true,
      mustChangePassword: true,

      profilePhoto: "",
      lastLogin: null,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw makeError("Admin email already exists.", 409);
    }

    throw error;
  }

  return {
    admin: {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      phone: admin.phone,
      role: admin.role,
      isActive: admin.isActive,
      isVerified: admin.isVerified,
      mustChangePassword: admin.mustChangePassword,
      createdAt: admin.createdAt,
    },

    // Returned only once, on successful creation.
    // Never saved in plaintext in the database.
    temporaryPassword,
  };
};

// ============================================================
// LIST ADMIN ACCOUNTS
// ============================================================

const getAdmins = async (actorId) => {
  await requireSuperAdmin(actorId);

  const admins = await repository.getAllAdmins();

  return {
    total: admins.length,

    active: admins.filter((admin) => admin.isActive === true).length,

    inactive: admins.filter((admin) => admin.isActive !== true).length,

    admins,
  };
};

// ============================================================
// ACTIVATE / DEACTIVATE AN ADMIN
// ============================================================

const changeAdminStatus = async (actorId, adminId, isActive) => {
  await requireSuperAdmin(actorId);

  if (!mongoose.isValidObjectId(adminId)) {
    throw makeError("Invalid Admin ID.");
  }

  if (typeof isActive !== "boolean") {
    throw makeError("isActive must be true or false.");
  }

  const existingAdmin = await repository.findAdminById(adminId);

  if (!existingAdmin) {
    throw makeError("Admin account not found.", 404);
  }

  // Only role=ADMIN records may be updated.
  // SUPER_ADMIN records are excluded by repository filter.
  const updated = await repository.updateAdminStatus(adminId, isActive);

  if (!updated) {
    throw makeError("Unable to update Admin status.", 409);
  }

  return {
    admin: updated,
    message: isActive
      ? "Admin activated successfully."
      : "Admin deactivated successfully.",
  };
};

module.exports = Object.freeze({
  createAdmin,
  getAdmins,
  changeAdminStatus,
});
