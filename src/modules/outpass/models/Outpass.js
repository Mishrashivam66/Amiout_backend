const mongoose = require("mongoose");

const {
  OUTPASS_STATUS,
  ACTIVE_OUTPASS_STATUS,
} = require("../constants/outpassStatus");

const { OUTPASS_TIMELINE } = require("../constants/outpassTimeline");

const {
  OUT_TIME_SLOTS,
  EXPECTED_RETURN_OPTIONS,
} = require("../constants/timeSlots");


const outpassSchema = new mongoose.Schema(
  {
    outpassId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // ============================================================================
// Student Reference
// ============================================================================
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ============================================================================
// Mentor Reference
// ============================================================================
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mentor", // ✅ User ki jagah Mentor
      default: null,
      index: true,
    },


    studentName: {
      type: String,
      required: true,
      trim: true,
    },

    enrollmentNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    branch: {
      type: String,
      required: true,
      trim: true,
    },

    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },

    course: {
      type: String,
      required: true,
      trim: true,
    },
    section: {
      type: String,
      required: true,
      trim: true,
    },
    group: {
      type: String,
      default: "",
      trim: true,
    },
    // ============================================================================
// Parent Information Snapshot
// ============================================================================

    parentName: {
      type: String,
      required: true,
      trim: true,
    },

    parentEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    parentMobileNumber: {
      type: String,
      required: true,
      trim: true,
    },
    parentApprovalEmailSent: {
      type: Boolean,
      default: false,
    },
    parentRejectionEmailSent: {
      type: Boolean,
      default: false,
    },

    // ============================================================================
// Outpass Details
// ============================================================================

    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 300,
    },

    destination: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    outDate: {
      type: Date,
      required: true,
    },

    outTime: {
      type: String,
      required: true,
      enum: OUT_TIME_SLOTS.map((slot) => slot.value),
    },

    expectedReturn: {
      type: String,
      required: true,
      enum: EXPECTED_RETURN_OPTIONS.map((option) => option.value),
    },

    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledReason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },

    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ============================================================================
// Current Status
// ============================================================================

    status: {
      type: String,
      enum: Object.values(OUTPASS_STATUS),
      default: OUTPASS_STATUS.PENDING,
      index: true,
    },
    // ============================================================================
// Mentor Action
// ============================================================================

    approvalRemark: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    rejectionRemark: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    // ============================================================================
// QR Information
// ============================================================================

    qrGenerated: {
      type: Boolean,
      default: false,
      index: true,
    },

    qrGeneratedAt: {
      type: Date,
      default: null,
    },

    qrToken: {
      type: String,
      sparse: true,
    },

    // ============================================================================
// Security Verification
// ============================================================================

    exitVerified: {
      type: Boolean,
      default: false,
    },

    exitVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    exitVerifiedAt: {
      type: Date,
      default: null,
    },

    entryVerified: {
      type: Boolean,
      default: false,
    },

    entryVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    entryVerifiedAt: {
      type: Date,
      default: null,
    },

    // ============================================================================
// Timeline
// ============================================================================

    timeline: [
      {
        event: {
          type: String,
          enum: Object.values(OUTPASS_TIMELINE),
          required: true,
        },

        title: {
          type: String,
          required: true,
          trim: true,
        },

        description: {
          type: String,
          default: "",
          trim: true,
        },

        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },

        performedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // ============================================================================
// Email Tracking
// ============================================================================

    parentEmailSent: {
      type: Boolean,
      default: false,
    },

    studentEmailSent: {
      type: Boolean,
      default: false,
    },

    // ============================================================================
// Soft Delete
// ============================================================================

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// ============================================================================
// Database Indexes
// ============================================================================

outpassSchema.index({ student: 1, createdAt: -1 });

outpassSchema.index({ mentor: 1, status: 1 });

outpassSchema.index({ status: 1, createdAt: -1 });

outpassSchema.index({ outDate: 1, status: 1 });

outpassSchema.index(
  {
    student: 1,
    outDate: 1,
  },
  {
    unique: false,
  },
);

// ============================================================================
// Virtual
// ============================================================================

outpassSchema.virtual("isApproved").get(function () {
  return this.status === OUTPASS_STATUS.APPROVED;
});

outpassSchema.virtual("isRejected").get(function () {
  return this.status === OUTPASS_STATUS.REJECTED;
});

outpassSchema.virtual("isPending").get(function () {
  return this.status === OUTPASS_STATUS.PENDING;
});

outpassSchema.virtual("isCompleted").get(function () {
  return this.status === OUTPASS_STATUS.COMPLETED;
});

// ============================================================================
// Instance Methods
// ============================================================================

outpassSchema.methods.addTimelineEvent = function ({
  event,
  title,
  description = "",
  performedBy = null,
}) {
  this.timeline.push({
    event,
    title,
    description,
    performedBy,
    performedAt: new Date(),
  });

  return this;
};

// ============================================================================
// Static Methods
// ============================================================================

outpassSchema.statics.findActiveOutpass = function (studentId) {
  return this.findOne({
    student: studentId,
    status: {
      $in: ACTIVE_OUTPASS_STATUS,
    },
    isDeleted: false,
  });
};

// ============================================================================
// Pre Save Hook
// ============================================================================

outpassSchema.pre("save", async function () {
  if (this.reason) {
    this.reason = this.reason.trim();
  }

  if (this.destination) {
    this.destination = this.destination.trim();
  }

  if (this.studentName) {
    this.studentName = this.studentName.trim();
  }

  if (this.parentName) {
    this.parentName = this.parentName.trim();
  }

  if (this.parentEmail) {
    this.parentEmail = this.parentEmail.trim().toLowerCase();
  }

  if (this.parentMobileNumber) {
    this.parentMobileNumber = this.parentMobileNumber.trim();
  }
});
// ============================================================================
// JSON Transform
// ============================================================================

outpassSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret.__v;
    delete ret.qrToken;

    // Internal Fields
    delete ret.isDeleted;
    delete ret.deletedAt;
    delete ret.deletedBy;
    return ret;
  },
});

module.exports = mongoose.model("Outpass", outpassSchema);
