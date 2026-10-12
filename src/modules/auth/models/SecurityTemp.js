"use strict";

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const { AUTH_CONSTANTS } = require("../constants");

// ==========================================
// SECURITY GUARD SCHEMA
// ==========================================

const securitySchema = new mongoose.Schema(
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

    employeeId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    profilePhoto: {
      type: String,
      default: "",
    },

    // ======================================
    // GATE ASSIGNMENT
    // ======================================

    assignedGate: {
      type: String,
      required: true,
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
      enum: ["SECURITY"],
      default: "SECURITY",
      immutable: true,
    },

    roles: {
      type: [
        {
          type: String,
          enum: ["SECURITY"],
        },
      ],
      default: ["SECURITY"],
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

    passwordChangedAt: {
      type: Date,
      default: null,
    },

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

    // ======================================
    // CREATED BY ADMIN
    // ======================================

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      immutable: true,
    },
  },
  {
    timestamps: true,
  },
);

// ==========================================
// VALIDATE ROLE
// ==========================================

securitySchema.pre("validate", function () {
  this.role = "SECURITY";
  this.roles = ["SECURITY"];
});

// ==========================================
// HASH PASSWORD
// ==========================================

securitySchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(12);

  this.password = await bcrypt.hash(this.password, salt);

  this.passwordChangedAt = new Date();
});

// ==========================================
// MATCH PASSWORD
// ==========================================

securitySchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password || typeof enteredPassword !== "string") {
    return false;
  }

  return bcrypt.compare(enteredPassword, this.password);
};

// ==========================================
// GENERATE PASSWORD RESET TOKEN
// ==========================================

securitySchema.methods.generatePasswordResetToken = function () {
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

module.exports =
  mongoose.models.Security || mongoose.model("Security", securitySchema);
