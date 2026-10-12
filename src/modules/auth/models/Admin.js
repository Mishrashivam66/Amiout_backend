"use strict";

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const { AUTH_CONSTANTS } = require("../constants");

// ==========================================
// ADMIN ROLES
// ==========================================

const ADMIN_ROLES = Object.freeze(["ADMIN", "SUPER_ADMIN"]);

// ==========================================
// ADMIN SCHEMA
// ==========================================

const adminSchema = new mongoose.Schema(
  {
    // ======================================
    // BASIC INFORMATION
    // ======================================

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    profilePhoto: {
      type: String,
      default: "",
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    // ======================================
    // AUTHENTICATION
    // ======================================

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    role: {
      type: String,
      enum: ADMIN_ROLES,
      default: "ADMIN",
      required: true,
    },

    roles: {
      type: [
        {
          type: String,
          enum: ADMIN_ROLES,
        },
      ],
      default: undefined,
    },

    // ======================================
    // ACCOUNT STATUS
    // ======================================

    isVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // ======================================
    // FIRST LOGIN PASSWORD CHANGE
    // ======================================

    mustChangePassword: {
      type: Boolean,
      default: false,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    // ======================================
    // SECURITY
    // ======================================

    // Legacy compatibility field.
    // New sessions use RefreshToken model.

    refreshToken: {
      type: String,
      default: null,
      select: false,
    },

    passwordChangedAt: {
      type: Date,
      default: null,
    },

    // ======================================
    // PASSWORD RESET
    // ======================================

    resetPasswordToken: {
      type: String,
      default: null,
      select: false,
    },

    resetPasswordExpires: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
  },
);

// ==========================================
// KEEP ADMIN ROLES CONSISTENT
// ==========================================

// ADMIN and SUPER_ADMIN must remain
// separate privileges.

adminSchema.pre("validate", function () {
  this.roles = [this.role];
});

// ==========================================
// HASH PASSWORD
// ==========================================

adminSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(10);

  this.password = await bcrypt.hash(this.password, salt);

  this.passwordChangedAt = new Date();
});

// ==========================================
// MATCH PASSWORD
// ==========================================

adminSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) {
    return false;
  }

  return bcrypt.compare(enteredPassword, this.password);
};

// ==========================================
// GENERATE PASSWORD RESET TOKEN
// ==========================================

adminSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.resetPasswordExpires = new Date(
    Date.now() + AUTH_CONSTANTS.PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000,
  );

  return resetToken;
};

// ==========================================
// EXPORT MODEL
// ==========================================

module.exports = mongoose.models.Admin || mongoose.model("Admin", adminSchema);
