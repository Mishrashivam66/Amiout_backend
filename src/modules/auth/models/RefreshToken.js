const mongoose = require("mongoose");

// ==========================================
// REFRESH TOKEN SCHEMA
// ==========================================

const refreshTokenSchema = new mongoose.Schema(
  {
    // ==========================================
    // USER
    // ==========================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ==========================================
    // REFRESH TOKEN
    // ==========================================

    token: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    // ==========================================
    // DEVICE INFORMATION
    // ==========================================

    device: {
      type: String,
      default: "Unknown Device",
    },

    browser: {
      type: String,
      default: "",
    },

    operatingSystem: {
      type: String,
      default: "",
    },

    ipAddress: {
      type: String,
      default: "",
    },

    // ==========================================
    // STATUS
    // ==========================================

    isRevoked: {
      type: Boolean,
      default: false,
    },

    // ==========================================
    // EXPIRY
    // ==========================================

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// ==========================================
// TTL INDEX
// ==========================================

refreshTokenSchema.index(
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

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
