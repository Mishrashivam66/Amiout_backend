"use strict";

const mongoose = require("mongoose");

const { AUTH_CONSTANTS } = require("../constants");

// ==========================================
// OTP CONFIGURATION
// ==========================================

const ACCOUNT_TYPES = ["STUDENT", "FACULTY", "ADMIN", "SECURITY"];

const OTP_PURPOSES = [
  "EMAIL_VERIFICATION",
  "PASSWORD_RESET",
  "ACCOUNT_ACTIVATION",
];

// ==========================================
// OTP SCHEMA
// ==========================================

const otpSchema = new mongoose.Schema(
  {
    // ======================================
    // ACCOUNT EMAIL
    // ======================================

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    // ======================================
    // ACCOUNT TYPE
    // ======================================

    // Legacy OTP documents without this
    // field are treated as STUDENT by
    // compatible repository logic.

    accountType: {
      type: String,
      enum: ACCOUNT_TYPES,
      default: "STUDENT",
      required: true,
      uppercase: true,
    },

    // ======================================
    // OTP CODE
    // ======================================

    // Existing OTP format retained.
    // OTP hashing will require matching
    // changes in generation and verification.

    otp: {
      type: String,
      required: true,
      select: false,
    },

    // ======================================
    // OTP PURPOSE
    // ======================================

    purpose: {
      type: String,
      enum: OTP_PURPOSES,
      default: "EMAIL_VERIFICATION",
      required: true,
    },

    // ======================================
    // OTP STATUS
    // ======================================

    isVerified: {
      type: Boolean,
      default: false,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ======================================
    // OTP EXPIRY
    // ======================================

    expiresAt: {
      type: Date,
      required: true,
      default: () =>
        new Date(Date.now() + AUTH_CONSTANTS.OTP_EXPIRY_MINUTES * 60 * 1000),
    },
  },
  {
    timestamps: true,
  },
);

// ==========================================
// QUERY INDEX
// ==========================================

otpSchema.index({
  email: 1,
  accountType: 1,
  purpose: 1,
});

// ==========================================
// TTL INDEX
// ==========================================

// Expired OTP documents are automatically
// deleted by MongoDB in the background.

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ==========================================
// EXPORT MODEL
// ==========================================

module.exports = mongoose.models.OTP || mongoose.model("OTP", otpSchema);
