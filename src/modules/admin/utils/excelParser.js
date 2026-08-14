"use strict";


const XLSX = require("xlsx");

// ============================================================================
// Normalize Header
// ============================================================================

const normalizeHeader = (header = "") => {
  return header
    .toString()
    .trim()
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
};

// ============================================================================
// Normalize Value
// ============================================================================

const normalizeValue = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return value.toString().trim();
};

// ============================================================================
// Parse Excel
// ============================================================================

const parseExcel = (file) => {
  if (!file) {
    throw new Error("Excel file not found.");
  }

  // ==========================================================
  // Read Workbook
  // ==========================================================

  const workbook = XLSX.readFile(file.path);

  // ==========================================================
  // First Sheet
  // ==========================================================

  const firstSheet = workbook.SheetNames[0];

  if (!firstSheet) {
    throw new Error("No worksheet found.");
  }

  // ==========================================================
  // Worksheet
  // ==========================================================

  const worksheet = workbook.Sheets[firstSheet];

  // ==========================================================
  // Convert Excel To JSON
  // Row 4 becomes Header (0-based index = 2)
  // ==========================================================

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    range: 2,
    defval: "",
    raw: false,
  });

  // ==========================================================
  // Clean Headers & Values
  // ==========================================================

  const cleanedRows = rows.map((row) => {
    const cleaned = {};

    Object.keys(row).forEach((key) => {
      cleaned[normalizeHeader(key)] = normalizeValue(row[key]);
    });

    return cleaned;
  });

  // ==========================================================
  // Fill Merged Course Name Cells
  // ==========================================================

  let lastCourse = "";

  cleanedRows.forEach((row) => {
    if (row["course name"] && row["course name"].trim() !== "") {
      lastCourse = row["course name"];
    } else {
      row["course name"] = lastCourse;
    }
  });

  // ==========================================================
  // Return Parsed Data
  // ==========================================================

  return {
    sheetName: firstSheet,
    totalRows: cleanedRows.length,
    headers: cleanedRows.length ? Object.keys(cleanedRows[0]) : [],
    data: cleanedRows,
  };
};

// ============================================================================
// Get Workbook Info
// ============================================================================

const getWorkbookInfo = (file) => {
  const workbook = XLSX.readFile(file.path);

  return {
    totalSheets: workbook.SheetNames.length,
    sheetNames: workbook.SheetNames,
  };
};

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  parseExcel,
  getWorkbookInfo,
});
