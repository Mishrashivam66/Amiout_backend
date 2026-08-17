const mongoose = require("mongoose");

const mentorMasterSchema = new mongoose.Schema(
  {
    // ============================================================================
    // Mentor Name
    // ============================================================================
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    // ============================================================================
    // Course Name
    // ============================================================================
    course: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // ============================================================================
    // Semester
    // ============================================================================
    semester: {
      type: Number,
      required: true,
      min: 1,
    },
    section: {
      type: String,

      trim: true,
      uppercase: true,
    },
    mentorEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
    },
    // ============================================================================
    // Group
    // ============================================================================
    group: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // ============================================================================
    // Coordinator Name
    // ============================================================================
    coordinator: {
      type: String,
      default: "",
      trim: true,
    },

    totalStudents: {
      type: Number,
      default: 0,
      min: 0,
    },

    mentorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mentor",
      default: null,
      index: true,
    },

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

mentorMasterSchema.index({
  course: 1,
  semester: 1,
  section: 1,
  group: 1,
});

mentorMasterSchema.index({
  name: 1,
});

// ============================================================================
// JSON Transform
// ============================================================================

mentorMasterSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret.__v;
    delete ret.isDeleted;
    return ret;
  },
});

module.exports = mongoose.model("MentorMaster", mentorMasterSchema);
