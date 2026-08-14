const mongoose = require("mongoose");

const programSchema = new mongoose.Schema(
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
    // Program Name
    // ============================================================================
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 30,
    },

    degree: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },

    // ============================================================================
    // Duration (Years)
    // ============================================================================
    duration: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },

    // ============================================================================
    // Total Semesters
    // ============================================================================
    totalSemesters: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
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

programSchema.index({
  institute: 1,
  code: 1,
});

programSchema.index({
  institute: 1,
  name: 1,
});

// ============================================================================
// JSON Transform
// ============================================================================

programSchema.set("toJSON", {
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

module.exports = mongoose.model("Program", programSchema);
