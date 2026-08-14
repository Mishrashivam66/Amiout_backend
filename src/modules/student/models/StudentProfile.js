const mongoose = require("mongoose");

const {
  ACCOUNT_STATUS,
  PROFILE_STATUS,
} = require("../constants/studentConstants");

const studentProfileSchema = new mongoose.Schema(
  {
    /**
     * Reference to Auth User
     */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    /**
     * Mentor Mapping
     */
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    section: {
      type: String,
      trim: true,
      default: "",
    },

    group: {
      type: String,
      trim: true,
      default: "",
    },

    /**
     * Parent Details
     */
    parentName: {
      type: String,
      trim: true,
      default: "",
    },

    parentEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    parentMobileNumber: {
      type: String,
      trim: true,
      default: "",
    },

    /**
     * Profile Status
     */
    profileCompleted: {
      type: Boolean,
      default: false,
    },

    profileLocked: {
      type: Boolean,
      default: false,
    },

    profileStatus: {
      type: String,
      enum: Object.values(PROFILE_STATUS),
      default: PROFILE_STATUS.INCOMPLETE,
    },

    /**
     * Account Status
     */
    accountStatus: {
      type: String,
      enum: Object.values(ACCOUNT_STATUS),
      default: ACCOUNT_STATUS.ACTIVE,
    },

    holdReason: {
      type: String,
      trim: true,
      default: "",
    },

    /**
     * Mentor/Admin Unlock Tracking
     */
    profileUnlockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    profileUnlockedAt: {
      type: Date,
      default: null,
    },

    /**
     * Last Profile Update
     */
    lastProfileUpdatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);
studentProfileSchema.index({
  mentor: 1,
  accountStatus: 1,
});

studentProfileSchema.index({
  profileStatus: 1,
  accountStatus: 1,
});

module.exports = mongoose.model("StudentProfile", studentProfileSchema);
