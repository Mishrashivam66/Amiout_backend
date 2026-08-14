const mongoose = require("mongoose");

const { AUTH_CONSTANTS } = require("../constants");

// ==========================================
// OTP SCHEMA
// ==========================================

const otpSchema = new mongoose.Schema(
  {
    // ==========================================
    // USER EMAIL
    // ==========================================

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    // ==========================================
    // OTP
    // ==========================================

    otp: {
      type: String,
      required: true,
      select: false,
    },

    // ==========================================
    // PURPOSE
    // ==========================================

    purpose: {
      type: String,
      enum: ["EMAIL_VERIFICATION", "PASSWORD_RESET"],
      default: "EMAIL_VERIFICATION",
    },

    // ==========================================
    // OTP STATUS
    // ==========================================

    isVerified: {
      type: Boolean,
      default: false,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    // ==========================================
    // EXPIRY
    // ==========================================

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
// AUTO DELETE EXPIRED OTP
// ==========================================

otpSchema.index(
  {
    expiresAt: 1,
  },
  {
    expireAfterSeconds: 0,
  },
);

// ==========================================
// EXPORT MODEL
// ==========================================

module.exports = mongoose.model("OTP", otpSchema);
