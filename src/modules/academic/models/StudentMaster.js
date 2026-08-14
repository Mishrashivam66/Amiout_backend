const mongoose = require("mongoose");

const studentMasterSchema = new mongoose.Schema(
  {
    // ============================================================================
    // Student Name
    // ============================================================================
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    // ============================================================================
    // Enrollment Number
    // ============================================================================
    enrollmentNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },

    // ============================================================================
    // Roll Number
    // ============================================================================
    rollNumber: {
      type: String,
      required: true,
      trim: true,
    },

    // ============================================================================
    // Institute
    // ============================================================================
    institute: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Institute",
      required: true,
      index: true,
    },

    // ============================================================================
    // Program
    // ============================================================================
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },

    batch: {
      type: String,
      required: true,
      trim: true,
    },

    // ============================================================================
    // Current Semester
    // ============================================================================
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
    // ============================================================================
    // Academic Group Reference
    // ============================================================================
    mentorGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
      index: true,
    },

    // ============================================================================
    // Primary Mentor
    // ============================================================================
    primaryMentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MentorMaster",
      default: null,
      index: true,
    },

    // ============================================================================
    // Backup Mentor
    // ============================================================================
    backupMentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MentorMaster",
      default: null,
      index: true,
    },

    // ============================================================================
    // Registration Status
    // ============================================================================
    isRegistered: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ============================================================================
    // Active Status
    // ============================================================================
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ============================================================================
    // Soft Delete
    // ============================================================================
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

// ============================================================================
// Indexes
// ============================================================================

studentMasterSchema.index({
  institute: 1,
  program: 1,
});

studentMasterSchema.index({
  semester: 1,
  section: 1,
  group: 1,
});

// ============================================================================
// JSON Transform
// ============================================================================

studentMasterSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret.__v;
    delete ret.isDeleted;

    return ret;
  },
});

// ============================================================================
// Export Model
// ============================================================================

module.exports = mongoose.model("StudentMaster", studentMasterSchema);
