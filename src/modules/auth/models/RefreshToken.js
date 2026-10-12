"use strict";

const mongoose = require("mongoose");

// ==========================================
// REFRESH TOKEN SCHEMA
// ==========================================

const refreshTokenSchema = new mongoose.Schema(
  {
    // ======================================
    // ACCOUNT REFERENCE
    // ======================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // STUDENT  -> User
    // FACULTY  -> Mentor
    // ADMIN    -> Admin (ADMIN/SUPER_ADMIN)
    // SECURITY -> Security

    accountType: {
      type: String,
      enum: ["STUDENT", "FACULTY", "ADMIN", "SECURITY"],
      required: true,
      default: "STUDENT",
      index: true,
    },

    // ======================================
    // REFRESH TOKEN
    // ======================================

    // Existing raw-token storage retained
    // for compatibility with current
    // auth.repository.js.

    token: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    // Reserved for future hashed-token
    // migration.

    tokenHash: {
      type: String,
      default: null,
      select: false,
    },

    // ======================================
    // SESSION IDENTIFIER
    // ======================================

    // Nullable to support existing legacy
    // student sessions. New sessions must
    // supply a valid sessionId.

    sessionId: {
      type: String,
      default: null,
    },

    // ======================================
    // DEVICE INFORMATION
    // ======================================

    device: {
      type: String,
      default: "Unknown Device",
      trim: true,
    },

    browser: {
      type: String,
      default: "",
      trim: true,
    },

    operatingSystem: {
      type: String,
      default: "",
      trim: true,
    },

    ipAddress: {
      type: String,
      default: "",
      trim: true,
    },

    // ======================================
    // SESSION STATUS
    // ======================================

    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    // ======================================
    // EXPIRY
    // ======================================

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
// COMPOUND INDEXES
// ==========================================

// Account-specific active session lookup.

refreshTokenSchema.index({
  accountType: 1,
  user: 1,
  isRevoked: 1,
});

// ==========================================
// UNIQUE SESSION INDEX
// ==========================================

// Only non-null string session IDs
// participate in this unique index.

refreshTokenSchema.index(
  { sessionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sessionId: {
        $type: "string",
      },
    },
  },
);

// ==========================================
// TTL INDEX
// ==========================================

// MongoDB removes expired sessions
// asynchronously in the background.

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ==========================================
// EXPORT MODEL
// ==========================================

module.exports =
  mongoose.models.RefreshToken ||
  mongoose.model("RefreshToken", refreshTokenSchema);
