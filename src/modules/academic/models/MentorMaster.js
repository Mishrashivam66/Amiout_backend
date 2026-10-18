"use strict";

const mongoose = require("mongoose");

// ============================================================
// FACULTY ROLES
// ============================================================

const VALID_ROLES = ["MENTOR", "COORDINATOR", "HOD", "HOI"];

// ============================================================
// ROLE HELPERS
// ============================================================

const hasRole = (document, role) => {
  return Array.isArray(document?.roles) && document.roles.includes(role);
};

const isGroupLevelFaculty = (document) => {
  return hasRole(document, "MENTOR") || hasRole(document, "COORDINATOR");
};

// ============================================================
// MENTOR MASTER SCHEMA
// ============================================================

const mentorMasterSchema = new mongoose.Schema(
  {
    // ========================================================
    // FACULTY BASIC INFORMATION
    // ========================================================

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

    // ========================================================
    // ACADEMIC INFORMATION
    // ========================================================

    institute: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    department: {
      type: String,
      required: function () {
        return hasRole(this, "HOD");
      },
      trim: true,
      uppercase: true,
      default: "",
    },

    program: {
      type: String,
      required: function () {
        return isGroupLevelFaculty(this);
      },
      trim: true,
      uppercase: true,
      default: "",
    },

    course: {
      type: String,
      required: function () {
        return hasRole(this, "MENTOR");
      },
      trim: true,
      uppercase: true,
      default: "",
    },

    semester: {
      type: Number,
      required: function () {
        return isGroupLevelFaculty(this);
      },
      default: null,
      min: 1,
      max: 12,
    },

    section: {
      type: String,
      required: function () {
        return isGroupLevelFaculty(this);
      },
      trim: true,
      uppercase: true,
      default: "",
    },

    group: {
      type: String,
      required: function () {
        return hasRole(this, "MENTOR");
      },
      trim: true,
      uppercase: true,
      default: "",
    },

    // ========================================================
    // FACULTY EMAIL
    // ========================================================

    mentorEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
    },

    // ========================================================
    // COORDINATOR INFORMATION
    // ========================================================

    coordinatorGroups: {
      type: [
        {
          type: String,
          trim: true,
          uppercase: true,
        },
      ],
      default: [],

      validate: {
        validator: function (groups) {
          if (!hasRole(this, "COORDINATOR")) {
            return true;
          }

          return Array.isArray(groups) && groups.length > 0;
        },
        message: "Coordinator Groups are required for COORDINATOR role.",
      },
    },

    coordinator: {
      type: String,
      trim: true,
      default: "",
    },

    // ========================================================
    // STUDENT INFORMATION
    // ========================================================

    totalStudents: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ========================================================
    // FACULTY LOGIN ACCOUNT LINK
    // ========================================================

    mentorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mentor",
      default: null,
      index: true,
    },

    // ========================================================
    // FACULTY AVAILABILITY
    // ========================================================

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

    // ========================================================
    // RECORD STATUS
    // ========================================================

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

// ============================================================
// INDEXES
// ============================================================

// Faculty ID is NOT unique.
// One faculty can have multiple academic assignments.

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

// Department lookup for HOD

mentorMasterSchema.index({
  institute: 1,
  department: 1,
  isDeleted: 1,
});

// Institute lookup for HOI

mentorMasterSchema.index({
  institute: 1,
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

// ============================================================
// JSON TRANSFORM
// ============================================================

mentorMasterSchema.set("toJSON", {
  virtuals: true,

  transform(doc, ret) {
    delete ret.__v;
    delete ret.isDeleted;

    return ret;
  },
});

// ============================================================
// EXPORT
// ============================================================

module.exports = mongoose.model("MentorMaster", mentorMasterSchema);
