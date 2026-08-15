const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const { ROLES, AUTH_CONSTANTS } = require("../constants");

// ==========================================
// MENTOR SCHEMA
// ==========================================

const mentorSchema = new mongoose.Schema(
  {
    // ==========================================
    // BASIC INFORMATION
    // ==========================================

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

    profilePhoto: {
      type: String,
      default: "",
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },

    department: {
      type: String,
      default: "",
      trim: true,
    },

    // ==========================================
    // AUTHENTICATION
    // ==========================================

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    role: {
      type: String,
      enum: [ROLES.MENTOR],
      default: ROLES.MENTOR,
    },

    // ==========================================
    // ACCOUNT STATUS
    // ==========================================

    isVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Mentor availability for outpass routing
    availabilityStatus: {
      type: String,
      enum: ["AVAILABLE", "UNAVAILABLE"],
      default: "AVAILABLE",
    },

    availabilityUpdatedAt: {
      type: Date,
      default: Date.now,
    },
    lastLogin: {
      type: Date,
      default: null,
    },

    // ==========================================
    // SECURITY
    // ==========================================

    refreshToken: {
      type: String,
      default: null,
      select: false,
    },

    passwordChangedAt: {
      type: Date,
      default: null,
    },

    // ==========================================
    // PASSWORD RESET
    // ==========================================

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
// HASH PASSWORD
// ==========================================

mentorSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(10);

  this.password = await bcrypt.hash(this.password, salt);
});

// ==========================================
// MATCH PASSWORD
// ==========================================

mentorSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// ==========================================
// GENERATE PASSWORD RESET TOKEN
// ==========================================

mentorSchema.methods.generatePasswordResetToken = function () {
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

module.exports = mongoose.model("Mentor", mentorSchema);
