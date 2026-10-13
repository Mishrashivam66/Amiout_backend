"use strict";

const mongoose = require("mongoose");

const VALID_ROLES = ["MENTOR", "COORDINATOR", "HOD", "HOI"];

const mentorMasterSchema = new mongoose.Schema(
  {
    // ==========================================
    // FACULTY BASIC INFORMATION
    // ==========================================

    facultyId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    designation: {
      type: String,
      trim: true,
      default: "",
    },

    roles: {
      type: [
        {
          type: String,
          enum: VALID_ROLES,
          uppercase: true,
          trim: true,
        },
      ],
      default: ["MENTOR"],
    },

    // ==========================================
    // ACADEMIC INFORMATION
    // ==========================================

    institute: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    department: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    program: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    course: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },

    section: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    group: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // ==========================================
    // FACULTY EMAIL
    // ==========================================

    mentorEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
    },

    // ==========================================
    // COORDINATOR INFORMATION
    // ==========================================

    coordinatorGroups: {
      type: [
        {
          type: String,
          trim: true,
          uppercase: true,
        },
      ],
      default: [],
    },

    coordinator: {
      type: String,
      trim: true,
      default: "",
    },

    // ==========================================
    // STUDENT INFORMATION
    // ==========================================

    totalStudents: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ==========================================
    // FACULTY LOGIN ACCOUNT LINK
    // ==========================================

    mentorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mentor",
      default: null,
      index: true,
    },

    // ==========================================
    // RECORD STATUS
    // ==========================================

    availabilityStatus: {
      type: String,
      enum: ["AVAILABLE", "UNAVAILABLE"],
      default: "AVAILABLE",
      index: true,
    },

    availabilityUpdatedAt: {
      type: Date,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

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

// ==========================================
// INDEXES
// ==========================================

// Faculty ID is NOT unique here.
// One faculty can have multiple group assignments.
mentorMasterSchema.index({
  facultyId: 1,
  isDeleted: 1,
});

// Academic group lookup
mentorMasterSchema.index({
  institute: 1,
  program: 1,
  semester: 1,
  section: 1,
  group: 1,
  isDeleted: 1,
});

// Legacy course lookup
mentorMasterSchema.index({
  course: 1,
  semester: 1,
  section: 1,
  group: 1,
});

// Faculty name lookup
mentorMasterSchema.index({
  name: 1,
});

// ==========================================
// JSON TRANSFORM
// ==========================================

mentorMasterSchema.set("toJSON", {
  virtuals: true,

  transform(doc, ret) {
    delete ret.__v;
    delete ret.isDeleted;
    return ret;
  },
});

// ==========================================
// EXPORT MODEL
// ==========================================

module.exports = mongoose.model("MentorMaster", mentorMasterSchema);
