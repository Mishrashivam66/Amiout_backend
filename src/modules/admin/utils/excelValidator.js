"use strict";

const isValidEmail = (email = "") => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

// ============================================================================
// Validate Records
// ============================================================================

const validateExcel = ({
  records = [],
  requiredColumns = [],
  uniqueField = "",
}) => {
  const validRecords = [];

  const validationErrors = [];

  const duplicates = [];

  const seen = new Set();

  records.forEach((record, index) => {
    const row = index + 2;

    let valid = true;

    // ============================================================================
// Required Fields
// ============================================================================

    requiredColumns.forEach((column) => {
      if (
        record[column] === undefined ||
        record[column] === null ||
        record[column].toString().trim() === ""
      ) {
        validationErrors.push({
          row,
          field: column,
          value: "",
          message: `${column} is required.`,
        });

        valid = false;
      }
    });

    // ============================================================================
// Email Validation
// ============================================================================

    if (record.email && !isValidEmail(record.email)) {
      validationErrors.push({
        row,
        field: "email",
        value: record.email,
        message: "Invalid email address.",
      });

      valid = false;
    }

    // ============================================================================
// Duplicate Check (Inside Excel)
// ============================================================================

    if (uniqueField && record[uniqueField]) {
      const key = record[uniqueField].toString().trim().toLowerCase();

      if (seen.has(key)) {
        duplicates.push({
          row,
          identifier: record[uniqueField],
          reason: `${uniqueField} already exists in uploaded Excel.`,
        });

        valid = false;
      } else {
        seen.add(key);
      }
    }

    // ============================================================================
// Save Valid Record
// ============================================================================

    if (valid) {
      validRecords.push(record);
    }
  });

  // ============================================================================
// Summary
// ============================================================================

  return {
    summary: {
      total: records.length,
      valid: validRecords.length,
      invalid: validationErrors.length,
      duplicates: duplicates.length,
    },

    validRecords,

    validationErrors,

    duplicates,
  };
};

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  validateExcel,
});
