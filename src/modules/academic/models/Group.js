const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema(
  {
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
    // Semester
    // ============================================================================
    semester: {
      type: Number,
      required: true,
      min: 1,
    },

    // ============================================================================
    // Section
    // ============================================================================
    section: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    groupName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // ============================================================================
    // Primary Mentor
    // ============================================================================
    primaryMentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MentorMaster",
      default: null,
    },

    // ============================================================================
    // Backup Mentor
    // ============================================================================
    backupMentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MentorMaster",
      default: null,
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

groupSchema.index(
  {
    institute: 1,
    program: 1,
    batch: 1,
    semester: 1,
    section: 1,
    groupName: 1,
  },
  {
    unique: true,
  },
);

groupSchema.index({
  primaryMentor: 1,
});

groupSchema.index({
  backupMentor: 1,
});

// ============================================================================
// JSON Transform
// ============================================================================

groupSchema.set("toJSON", {
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

module.exports = mongoose.model("Group", groupSchema);
