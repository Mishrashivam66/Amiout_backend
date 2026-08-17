"use strict";

const ImportHistory = require("../models/ImportHistory");
const { parseExcel } = require("../utils/excelParser");
const { validateExcel } = require("../utils/excelValidator");

// ============================================================================
// Process Import
// ============================================================================

const processImport = async ({
  file,
  importType,
  requiredColumns,
  uniqueField,
  importedBy,
  ipAddress = "",
  userAgent = "",
}) => {
  const startTime = Date.now();

  // ==========================================================
  // Parse Excel
  // ==========================================================

  const parsed = parseExcel(file);

  console.log("================================");
  console.log("HEADERS");
  console.log(parsed.headers);

  console.log("================================");
  console.log("FIRST ROW");
  console.log(parsed.data[0]);

  // ==========================================================
  // Validate
  // ==========================================================

  const validation = validateExcel({
    records: parsed.data,
    requiredColumns,
    uniqueField,
  });
  console.log("VALIDATION SUMMARY");
  console.log(validation.summary);

  console.log("VALIDATION ERRORS");
  console.log(validation.validationErrors.slice(0, 10));
  // ==========================================================
  // Processing Time
  // ==========================================================

  const processingTime = Number(((Date.now() - startTime) / 1000).toFixed(2));

  // ==========================================================
  // Save Import History
  // ==========================================================

  let history;

  try {
    history = await ImportHistory.create({
      type: importType,
      fileName: file.originalname,
      fileSize: file.size,
      importedBy,

      totalRecords: validation.summary.total,
      importedRecords: validation.summary.valid,
      failedRecords: validation.summary.invalid,
      duplicateRecords: validation.summary.duplicates,
      skippedRecords: 0,

      processingTime,

      status:
        validation.summary.invalid > 0 || validation.summary.duplicates > 0
          ? "PARTIAL_SUCCESS"
          : "COMPLETED",

      validationErrors: validation.validationErrors,
      duplicates: validation.duplicates,

      ipAddress,
      userAgent,
    });
  } catch (err) {
    console.error("========== IMPORT HISTORY ERROR ==========");
    console.error(err);
    throw err;
  }

  // ==========================================================
  // Return
  // ==========================================================

  return {
    historyId: history._id,
    summary: validation.summary,
    preview: parsed.data.slice(0, 10),
    validRecords: validation.validRecords,
    validationErrors: validation.validationErrors,
    duplicates: validation.duplicates,
    processingTime,
  };
};

// ============================================================================
// Get Import History
// ============================================================================

const getImportHistory = async (limit = 20) => {
  return ImportHistory.find()
    .populate("importedBy", "name email role")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

// ============================================================================
// Get Single History
// ============================================================================

const getImportHistoryById = async (id) => {
  return ImportHistory.findById(id)
    .populate("importedBy", "name email role")
    .lean();
};

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  processImport,
  getImportHistory,
  getImportHistoryById,
});
