"use strict";

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

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

// ============================================================
// CONSTANTS
// ============================================================

const AUTHORITY_ROLES = [
  "MENTOR",
  "BACKUP_MENTOR",
  "COORDINATOR",
  "HOD",
  "HOI",
];

const PARENT_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

const PARENT_METHODS = ["SMS_LINK", "PHONE_CALL"];

const SMS_STATUSES = ["NOT_SENT", "PENDING", "SENT", "FAILED"];

const EMAIL_STATUSES = ["NOT_SENT", "PENDING", "SENT", "FAILED"];

const ASSIGNMENT_REASONS = [
  "INITIAL_ASSIGNMENT",
  "FACULTY_UNAVAILABLE",
  "FACULTY_DISABLED",
  "MANUAL_REASSIGNMENT",
  "AUTHORITY_ESCALATION",
];

// ============================================================
// PARENT DECISION SCHEMA
// ============================================================

const parentDecisionSchema = new Schema(
  {
    status: {
      type: String,
      enum: PARENT_STATUSES,
      default: "PENDING",
    },

    method: {
      type: String,
      enum: PARENT_METHODS,
      default: null,
    },

    decidedAt: {
      type: Date,
      default: null,
    },

    // SHA-256 hash only.
    // Never store a raw parent approval token.
    tokenHash: {
      type: String,
      default: null,
      select: false,
    },

    tokenExpiresAt: {
      type: Date,
      default: null,
    },

    tokenUsedAt: {
      type: Date,
      default: null,
    },

    // Used for verified phone-call consent.
    verifiedByFaculty: {
      type: ObjectId,
      ref: "Mentor",
      default: null,
    },

    verifiedByRole: {
      type: String,
      enum: AUTHORITY_ROLES,
      default: null,
    },

    callOutcome: {
      type: String,
      enum: ["CONSENT", "REJECTED", "UNREACHABLE"],
      default: null,
    },

    callRemarks: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    callVerifiedAt: {
      type: Date,
      default: null,
    },

    callNumberLast4: {
      type: String,
      default: "",
      select: false,
    },
  },
  {
    _id: false,
  },
);

// ============================================================
// FACULTY ASSIGNMENT HISTORY
// ============================================================

const assignmentHistorySchema = new Schema(
  {
    fromFaculty: {
      type: ObjectId,
      ref: "Mentor",
      default: null,
    },

    toFaculty: {
      type: ObjectId,
      ref: "Mentor",
      default: null,
    },

    fromRole: {
      type: String,
      enum: AUTHORITY_ROLES,
      default: null,
    },

    toRole: {
      type: String,
      enum: AUTHORITY_ROLES,
      default: null,
    },

    reason: {
      type: String,
      enum: ASSIGNMENT_REASONS,
      required: true,
    },

    transferredBy: {
      type: ObjectId,
      ref: "Mentor",
      default: null,
    },

    transferredAt: {
      type: Date,
      default: Date.now,
    },

    remarks: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  {
    _id: true,
  },
);

// ============================================================
// MAIN OUTPASS SCHEMA
// ============================================================

const outpassSchema = new Schema(
  {
    // ========================================================
    // OUTPASS IDENTIFICATION
    // ========================================================

    outpassId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // ========================================================
    // AUTHENTICATED STUDENT
    // ========================================================

    student: {
      type: ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ========================================================
    // MENTOR REFERENCES
    // ========================================================

    // Legacy mentor field retained.
    mentor: {
      type: ObjectId,
      ref: "Mentor",
      default: null,
      index: true,
    },

    // Current assigned approving authority.
    assignedFaculty: {
      type: ObjectId,
      ref: "Mentor",
      default: null,
      index: true,
    },

    assignedRole: {
      type: String,
      enum: AUTHORITY_ROLES,
      default: null,
    },

    assignmentHistory: {
      type: [assignmentHistorySchema],
      default: [],
    },

    // ========================================================
    // STUDENTMASTER SNAPSHOT
    // ========================================================

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

    course: {
      type: String,
      required: true,
      trim: true,
    },

    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },

    section: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    group: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // ========================================================
    // ACADEMIC SCOPE
    // ========================================================

    academicInstitute: {
      type: ObjectId,
      ref: "Institute",
      default: null,
      index: true,
    },

    academicProgram: {
      type: ObjectId,
      ref: "Program",
      default: null,
    },

    academicDepartment: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
      index: true,
    },

    academicBatch: {
      type: String,
      trim: true,
      default: "",
    },

    // ========================================================
    // PARENT DETAILS
    // SOURCE: STUDENTMASTER
    // ========================================================

    parentName: {
      type: String,
      required: true,
      trim: true,
    },

    // Optional: Parent approval uses SMS.
    parentEmail: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
      default: "",
    },

    parentMobileNumber: {
      type: String,
      required: true,
      trim: true,
      match: /^[6-9][0-9]{9}$/,
    },

    parentApprovalEmailSent: {
      type: Boolean,
      default: false,
    },

    parentRejectionEmailSent: {
      type: Boolean,
      default: false,
    },

    // ========================================================
    // PARENT APPROVAL / REJECTION
    // ========================================================

    parentDecision: {
      type: parentDecisionSchema,
      default: () => ({}),
    },

    // ========================================================
    // PARENT SMS
    // ========================================================

    parentSMSStatus: {
      type: String,
      enum: SMS_STATUSES,
      default: "NOT_SENT",
    },

    parentSMSSentAt: {
      type: Date,
      default: null,
    },

    parentSMSLastAttemptAt: {
      type: Date,
      default: null,
    },

    parentSMSAttempts: {
      type: Number,
      min: 0,
      default: 0,
    },

    parentSMSProviderId: {
      type: String,
      trim: true,
      default: "",
      select: false,
    },

    // ========================================================
    // STUDENT OUTPASS REQUEST
    // ========================================================

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

    // Expected campus return time (optional).
    // Actual return is recorded through Security QR ENTRY.
    inTime: {
      type: String,
      required: false,
      enum: [...OUT_TIME_SLOTS.map((slot) => slot.value), null],
      default: null,
    },

    // Legacy field retained for older outpass records.
    expectedReturn: {
      type: String,
      required: false,
      enum: EXPECTED_RETURN_OPTIONS.map((option) => option.value),
      default: undefined,
    },

    // Day scholars are not required to return.
    // Kept for existing records and API compatibility.
    expectedReturn: {
      type: String,
      required: false,
      enum: EXPECTED_RETURN_OPTIONS.map((option) => option.value),
      default: undefined,
    },

    // ========================================================
    // TWO APPROVED OUTPASSES PER IST DAY
    // ========================================================

    outpassDayIST: {
      type: String,
      trim: true,
      default: "",
      match: /^$|^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },

    // Set during faculty approval, not application.
    dailyTripNumber: {
      type: Number,
      enum: [1, 2],
      default: null,
    },

    // ========================================================
    // CANCELLATION
    // ========================================================

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
      type: ObjectId,
      ref: "User",
      default: null,
    },

    // ========================================================
    // REQUEST STATUS
    // ========================================================

    status: {
      type: String,
      enum: Object.values(OUTPASS_STATUS),
      default: OUTPASS_STATUS.PENDING,
      index: true,
    },

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

    // ========================================================
    // LEGACY APPROVAL FIELDS
    // ========================================================

    approvedBy: {
      type: ObjectId,
      ref: "User",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    rejectedBy: {
      type: ObjectId,
      ref: "User",
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    // ========================================================
    // FACULTY APPROVAL
    // ========================================================

    approvedByFaculty: {
      type: ObjectId,
      ref: "Mentor",
      default: null,
    },

    approvedAuthorityRole: {
      type: String,
      enum: AUTHORITY_ROLES,
      default: null,
    },

    rejectedByFaculty: {
      type: ObjectId,
      ref: "Mentor",
      default: null,
    },

    rejectedAuthorityRole: {
      type: String,
      enum: AUTHORITY_ROLES,
      default: null,
    },

    // ========================================================
    // HIGHER AUTHORITY BYPASS AUDIT
    // ========================================================

    approvalBypass: {
      used: {
        type: Boolean,
        default: false,
      },

      performedBy: {
        type: ObjectId,
        ref: "Mentor",
        default: null,
      },

      authorityRole: {
        type: String,
        enum: AUTHORITY_ROLES,
        default: null,
      },

      bypassedRoles: {
        type: [
          {
            type: String,
            enum: AUTHORITY_ROLES,
          },
        ],
        default: [],
      },

      reason: {
        type: String,
        trim: true,
        maxlength: 500,
        default: "",
      },

      performedAt: {
        type: Date,
        default: null,
      },
    },

    // ========================================================
    // QR PASS
    // ========================================================

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
      default: null,
      select: false,
    },

    // Allowed: 09:15 AM to 05:15 PM IST.
    // The approval service sets these fields.
    qrValidFrom: {
      type: Date,
      default: null,
    },

    qrExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    qrRevokedAt: {
      type: Date,
      default: null,
    },

    // ========================================================
    // SECURITY EXIT
    // ========================================================

    exitVerified: {
      type: Boolean,
      default: false,
    },

    exitVerifiedBy: {
      type: ObjectId,
      ref: "User",
      default: null,
    },

    exitVerifiedAt: {
      type: Date,
      default: null,
    },

    // ========================================================
    // SECURITY ENTRY
    // OPTIONAL - ONLY WHEN STUDENT RETURNS
    // ========================================================

    entryVerified: {
      type: Boolean,
      default: false,
    },

    entryVerifiedBy: {
      type: ObjectId,
      ref: "User",
      default: null,
    },

    entryVerifiedAt: {
      type: Date,
      default: null,
    },

    // ========================================================
    // TIMELINE
    // ========================================================

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
          trim: true,
          default: "",
        },

        performedBy: {
          type: ObjectId,
          ref: "User",
          default: null,
        },

        performedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // ========================================================
    // EMAIL TRACKING
    // ========================================================

    parentEmailSent: {
      type: Boolean,
      default: false,
    },

    studentEmailSent: {
      type: Boolean,
      default: false,
    },

    facultyAssignmentEmailStatus: {
      type: String,
      enum: EMAIL_STATUSES,
      default: "NOT_SENT",
    },

    facultyAssignmentEmailSentAt: {
      type: Date,
      default: null,
    },

    facultyAssignmentEmailLastAttemptAt: {
      type: Date,
      default: null,
    },

    // ========================================================
    // SOFT DELETE
    // ========================================================

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
      type: ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// ============================================================
// DATABASE INDEXES
// ============================================================

outpassSchema.index({
  student: 1,
  createdAt: -1,
});

outpassSchema.index({
  mentor: 1,
  status: 1,
});

outpassSchema.index({
  assignedFaculty: 1,
  status: 1,
});

outpassSchema.index({
  status: 1,
  createdAt: -1,
});

outpassSchema.index({
  outDate: 1,
  status: 1,
});

outpassSchema.index({
  student: 1,
  outDate: 1,
});

outpassSchema.index({
  student: 1,
  outpassDayIST: 1,
  status: 1,
});

outpassSchema.index({
  academicInstitute: 1,
  academicDepartment: 1,
  status: 1,
});

// Parent approval token lookup.
// Sparse + partial index avoids indexing all
// outpasses without generated parent tokens.
// ============================================================
// QR TOKEN - PARTIAL UNIQUE INDEX
// Allow multiple pending outpasses with qrToken: null.
// Enforce uniqueness only for actual QR token strings.
// ============================================================

outpassSchema.index(
  { qrToken: 1 },
  {
    name: "qrToken_1",
    unique: true,
    partialFilterExpression: {
      qrToken: { $type: "string" },
    },
  },
);
outpassSchema.index(
  {
    "parentDecision.tokenHash": 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      "parentDecision.tokenHash": {
        $type: "string",
      },
    },
  },
);

// Prevent two approved outpasses from occupying
// the same daily trip slot.
//
// NOTE:
// Approval service must still allocate trip
// numbers atomically and handle E11000 errors.
outpassSchema.index(
  {
    student: 1,
    outpassDayIST: 1,
    dailyTripNumber: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      dailyTripNumber: {
        $in: [1, 2],
      },
      outpassDayIST: {
        $type: "string",
      },
      isDeleted: false,
    },
  },
);

// ============================================================
// VIRTUALS
// ============================================================

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

// ============================================================
// ADD TIMELINE EVENT
// ============================================================

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

// ============================================================
// PARENT CONSENT CHECK
// ============================================================

outpassSchema.methods.hasParentConsent = function () {
  const decision = this.parentDecision;

  if (decision?.status !== "APPROVED") {
    return false;
  }

  if (decision.method === "SMS_LINK") {
    return Boolean(decision.decidedAt && decision.tokenUsedAt);
  }

  if (decision.method === "PHONE_CALL") {
    return (
      decision.callOutcome === "CONSENT" &&
      Boolean(decision.verifiedByFaculty) &&
      Boolean(decision.verifiedByRole) &&
      Boolean(decision.callVerifiedAt)
    );
  }

  return false;
};

// ============================================================
// EXPLICIT PARENT REJECTION
// ============================================================

outpassSchema.methods.isParentRejected = function () {
  return this.parentDecision?.status === "REJECTED";
};

// ============================================================
// QR TIME WINDOW CHECK
// ============================================================

outpassSchema.methods.isQrWithinTimeWindow = function (now = new Date()) {
  const current = new Date(now);

  return (
    this.status === OUTPASS_STATUS.APPROVED &&
    this.qrGenerated === true &&
    Boolean(this.qrValidFrom) &&
    Boolean(this.qrExpiresAt) &&
    !this.qrRevokedAt &&
    current >= this.qrValidFrom &&
    current < this.qrExpiresAt
  );
};

// ============================================================
// ACTIVE OUTPASS
// LEGACY METHOD
// ============================================================

outpassSchema.statics.findActiveOutpass = function (studentId) {
  return this.findOne({
    student: studentId,
    status: {
      $in: ACTIVE_OUTPASS_STATUS,
    },
    isDeleted: false,
  });
};

// ============================================================
// COUNT APPROVED OUTPASSES FOR IST DAY
// ============================================================

outpassSchema.statics.countApprovedForISTDay = function (studentId, dayKey) {
  const start = new Date(`${dayKey}T00:00:00+05:30`);

  const end = new Date(start.getTime() + 86400000);

  return this.countDocuments({
    student: studentId,
    isDeleted: false,

    // Count approved history even when
    // later status changes from APPROVED.
    $and: [
      {
        $or: [
          {
            outpassDayIST: dayKey,
          },
          {
            outDate: {
              $gte: start,
              $lt: end,
            },
            outpassDayIST: {
              $in: ["", null],
            },
          },
        ],
      },
      {
        $or: [
          {
            approvedAt: {
              $ne: null,
            },
          },
          {
            status: {
              $in: [OUTPASS_STATUS.APPROVED, OUTPASS_STATUS.COMPLETED].filter(
                Boolean,
              ),
            },
          },
        ],
      },
    ],
  });
};

// ============================================================
// PRE-SAVE DATA NORMALIZATION
// ============================================================

outpassSchema.pre("save", function () {
  if (this.studentName) {
    this.studentName = this.studentName.trim();
  }

  if (this.enrollmentNumber) {
    this.enrollmentNumber = this.enrollmentNumber.trim().toUpperCase();
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

  if (this.reason) {
    this.reason = this.reason.trim();
  }

  if (this.destination) {
    this.destination = this.destination.trim();
  }
});

// ============================================================
// JSON RESPONSE SAFETY
// ============================================================

outpassSchema.set("toJSON", {
  virtuals: true,

  transform(_doc, ret) {
    delete ret.__v;

    // Internal secure tokens.
    delete ret.qrToken;

    if (ret.parentDecision) {
      delete ret.parentDecision.tokenHash;
      delete ret.parentDecision.callNumberLast4;
    }

    delete ret.parentSMSProviderId;

    // Internal soft-delete metadata.
    delete ret.isDeleted;
    delete ret.deletedAt;
    delete ret.deletedBy;

    return ret;
  },
});

// ============================================================
// EXPORT
// ============================================================

module.exports =
  mongoose.models.Outpass || mongoose.model("Outpass", outpassSchema);
