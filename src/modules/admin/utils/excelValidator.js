"use strict";

// ============================================================
// HELPERS
// ============================================================

const clean = (value) => String(value ?? "").trim();

const isValidEmail = (email = "") => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(email));
};

const isMissing = (value) => {
  return value === undefined || value === null || clean(value) === "";
};

// ============================================================
// VALIDATE EXCEL RECORDS
// ============================================================

const validateExcel = ({
  records = [],
  requiredColumns = [],
  uniqueField = "",
}) => {
  if (!Array.isArray(records)) {
    throw new TypeError("Excel records must be an array.");
  }

  const validRecords = [];
  const validationErrors = [];
  const duplicates = [];

  const seen = new Set();

  let invalidRows = 0;
  let duplicateRows = 0;

  // ==========================================================
  // PROCESS RECORDS
  // ==========================================================

  records.forEach((record, index) => {
    const row = index + 2;

    let valid = true;
    let isDuplicate = false;

    if (!record || typeof record !== "object" || Array.isArray(record)) {
      validationErrors.push({
        row,
        field: "record",
        value: "",
        message: "Invalid Excel row.",
      });

      invalidRows++;
      return;
    }

    // ========================================================
    // REQUIRED COLUMNS
    // ========================================================

    for (const column of requiredColumns) {
      const value = record[column];

      if (isMissing(value)) {
        validationErrors.push({
          row,
          field: column,
          value: "",
          message: `${column} is required.`,
        });

        valid = false;
      }
    }

    // ========================================================
    // OPTIONAL EMAIL VALIDATION
    // ========================================================

    // Existing Student Excel behavior is preserved.
    // Faculty official email is also validated later
    // by mentorImport.service.js.

    if (!isMissing(record.email) && !isValidEmail(record.email)) {
      validationErrors.push({
        row,
        field: "email",
        value: record.email,
        message: "Invalid email address.",
      });

      valid = false;
    }

    // ========================================================
    // DUPLICATE CHECK INSIDE EXCEL
    // ========================================================

    if (uniqueField && !isMissing(record[uniqueField])) {
      const identifier = clean(record[uniqueField]);

      const key = identifier.toLowerCase();

      if (seen.has(key)) {
        duplicates.push({
          row,
          identifier,
          reason: `${uniqueField} already exists in uploaded Excel.`,
        });

        isDuplicate = true;
        valid = false;
      } else {
        seen.add(key);
      }
    }

    // ========================================================
    // TRACK RESULT
    // ========================================================

    if (valid) {
      validRecords.push(record);
    } else if (isDuplicate) {
      duplicateRows++;

      // A duplicate row may also contain other errors.
      // Track those separately without double-counting
      // the same row as both invalid and duplicate.

      const hasValidationError = validationErrors.some(
        (error) => error.row === row,
      );

      if (hasValidationError) {
        invalidRows++;
      }
    } else {
      invalidRows++;
    }
  });

  // ==========================================================
  // FINAL SUMMARY
  // ==========================================================

  return {
    summary: {
      total: records.length,
      valid: validRecords.length,
      invalid: invalidRows,
      duplicates: duplicateRows,
    },

    validRecords,
    validationErrors,
    duplicates,
  };
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  validateExcel,
});
