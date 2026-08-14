"use strict";
const mongoose = require("mongoose");

// ============================================================================
// Import History Schema
// ============================================================================

const importHistorySchema = new mongoose.Schema(
  {
    // ============================================================================
// Import Type
// ============================================================================

    type: {
      type: String,
      enum: ["STUDENT", "MENTOR", "GROUP"],
      required: true,
      uppercase: true,
      trim: true,
    },

    // ============================================================================
// Uploaded File
// ============================================================================

    fileName: {
      type: String,
      required: true,
      trim: true,
    },

    fileSize: {
      type: Number,
      default: 0,
    },

    // ============================================================================
// Imported By
// ============================================================================

    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ============================================================================
// Statistics
// ============================================================================

    totalRecords: {
      type: Number,
      default: 0,
    },

    importedRecords: {
      type: Number,
      default: 0,
    },

    failedRecords: {
      type: Number,
      default: 0,
    },

    duplicateRecords: {
      type: Number,
      default: 0,
    },

    skippedRecords: {
      type: Number,
      default: 0,
    },

    // ============================================================================
// Processing Time
// ============================================================================

    processingTime: {
      type: Number,
      default: 0,
    },

    // ============================================================================
// Import Status
// ============================================================================

    status: {
      type: String,
      enum: ["PROCESSING", "COMPLETED", "FAILED", "PARTIAL_SUCCESS"],
      default: "PROCESSING",
    },

    // ============================================================================
// Validation Errors
// ============================================================================

    validationErrors: [
      {
        row: Number,

        field: String,

        value: String,

        message: String,
      },
    ],

    // ============================================================================
// Duplicate Records
// ============================================================================

    duplicates: [
      {
        row: Number,

        identifier: String,

        reason: String,
      },
    ],

    // ============================================================================
// Remarks
// ============================================================================

    remarks: {
      type: String,
      trim: true,
      default: "",
    },

    // ============================================================================
// Import Log File
// ============================================================================

    logFile: {
      type: String,
      default: "",
    },

    // ============================================================================
// Metadata
// ============================================================================

    ipAddress: {
      type: String,
      default: "",
    },

    userAgent: {
      type: String,
      default: "",
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

importHistorySchema.index({
  type: 1,
  createdAt: -1,
});

importHistorySchema.index({
  importedBy: 1,
  createdAt: -1,
});

// ============================================================================
// Export
// ============================================================================

module.exports = mongoose.model("ImportHistory", importHistorySchema);
