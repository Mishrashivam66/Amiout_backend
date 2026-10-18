"use strict";

const mongoose = require("mongoose");

const credentialDispatchSchema = new mongoose.Schema(
  {
    accountType: {
      type: String,
      enum: ["STUDENT", "FACULTY"],
      required: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    status: {
      type: String,
      enum: ["PENDING", "SENDING", "SENT", "FAILED"],
      default: "PENDING",
    },

    attempts: {
      type: Number,
      default: 0,
    },

    lastAttemptAt: {
      type: Date,
      default: null,
    },

    sentAt: {
      type: Date,
      default: null,
    },

    lastError: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

credentialDispatchSchema.index({ accountType: 1, email: 1 }, { unique: true });

module.exports =
  mongoose.models.CredentialDispatch ||
  mongoose.model("CredentialDispatch", credentialDispatchSchema);
