"use strict";

const mongoose = require("mongoose");

const studentMasterSchema = new mongoose.Schema(
  {
    // ============================================================
    // Student Identity
    // ============================================================

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    enrollmentNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },

    rollNumber: {
      type: String,
      required: true,
      trim: true,
    },

    // ============================================================
    // Official Contact Information
    // ============================================================

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: undefined,
      validate: {
        validator: function (value) {
          return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        },
        message: "Invalid student email address.",
      },
    },

    mobileNumber: {
      type: String,
      trim: true,
      default: "",
    },

    // ============================================================
    // Parent / Guardian Information
    // ============================================================

    parentName: {
      type: String,
      trim: true,
      maxlength: 150,
      default: "",
    },

    parentMobileNumber: {
      type: String,
      trim: true,
      default: "",
      validate: {
        validator: function (value) {
          return !value || /^[0-9]{10}$/.test(value);
        },
        message: "Parent mobile number must contain 10 digits.",
      },
    },

    // ============================================================
    // Academic References
    // ============================================================

    institute: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Institute",
      required: true,
      index: true,
    },

    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },

    // ============================================================
    // Academic Details
    // ============================================================

    batch: {
      type: String,
      required: true,
      trim: true,
    },

    admissionYear: {
      type: Number,
      min: 2000,
      max: 2100,
      default: undefined,
    },

    passingYear: {
      type: Number,
      min: 2000,
      max: 2100,
      default: undefined,
    },

    semester: {
      type: Number,
      required: true,
      min: 1,
    },

    section: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    group: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    // ============================================================
    // Mentor Mapping
    // ============================================================

    mentorGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
      index: true,
    },

    primaryMentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MentorMaster",
      default: null,
      index: true,
    },

    backupMentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MentorMaster",
      default: null,
      index: true,
    },

    // ============================================================
    // Registration Status
    // ============================================================

    isRegistered: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ============================================================
    // Active Status
    // ============================================================

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ============================================================
    // Soft Delete
    // ============================================================

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// ============================================================
// Indexes
// ============================================================

studentMasterSchema.index({
  institute: 1,
  program: 1,
});

studentMasterSchema.index({
  semester: 1,
  section: 1,
  group: 1,
});

// Optional email, unique when supplied.
studentMasterSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: "string" },
    },
  },
);

// ============================================================
// JSON Transform
// ============================================================

studentMasterSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret.__v;
    delete ret.isDeleted;
    return ret;
  },
});

// ============================================================
// Export Model
// ============================================================

module.exports = mongoose.model("StudentMaster", studentMasterSchema);
