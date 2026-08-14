const mongoose = require("mongoose");

const studentActivitySchema = new mongoose.Schema(
  {
    /**
     * Student Reference
     */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /**
     * Activity Title
     */
    title: {
      type: String,
      required: true,
      trim: true,
    },

    /**
     * Activity Description
     */
    description: {
      type: String,
      required: true,
      trim: true,
    },

    /**
     * Activity Type
     */
    type: {
      type: String,
      enum: [
        "PROFILE_UPDATED",
        "OUTPASS_APPLIED",
        "OUTPASS_APPROVED",
        "OUTPASS_REJECTED",
        "OUTPASS_CANCELLED",
        "QR_GENERATED",
        "EXIT_VERIFIED",
        "ENTRY_VERIFIED",
        "ACCOUNT_HOLD",
        "ACCOUNT_ACTIVE",
        "SYSTEM",
      ],
      required: true,
    },

    /**
     * Related Outpass
     */
    outpass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Outpass",
      default: null,
    },

    /**
     * Activity Icon
     */
    icon: {
      type: String,
      default: "activity",
    },

    /**
     * Activity Color
     */
    color: {
      type: String,
      default: "blue",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

studentActivitySchema.index({
  user: 1,
  createdAt: -1,
});

module.exports = mongoose.model("StudentActivity", studentActivitySchema);
