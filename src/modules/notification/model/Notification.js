const mongoose = require("mongoose");

const {
  NOTIFICATION_TYPES,
} = require("../../../shared/types/notificationTypes");

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    // ============================================================================
    // Notification Message
    // ============================================================================
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    // ============================================================================
    // Notification Type
    // ============================================================================
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      required: true,
      index: true,
    },

    // ============================================================================
    // Sender
    // ============================================================================
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ============================================================================
    // Receiver
    // ============================================================================
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ============================================================================
    // Receiver Role
    // ============================================================================
    role: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // ============================================================================
    // Related Outpass
    // ============================================================================
    relatedOutpass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Outpass",
      default: null,
    },

    // ============================================================================
    // Read Status
    // ============================================================================
    isRead: {
      type: Boolean,
      default: false,
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

notificationSchema.index({
  receiver: 1,
  createdAt: -1,
});

notificationSchema.index({
  receiver: 1,
  isRead: 1,
});

notificationSchema.index({
  type: 1,
  createdAt: -1,
});

notificationSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 60 * 60 * 24,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

// ============================================================================
// JSON Transform
// ============================================================================

notificationSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret.__v;
    delete ret.isDeleted;

    return ret;
  },
});

module.exports = mongoose.model("Notification", notificationSchema);
