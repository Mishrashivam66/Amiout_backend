"use strict";

const XLSX = require("xlsx");

// ============================================================
// Normalize Header
// ============================================================

const normalizeHeader = (header = "") => {
  return String(header ?? "")
    .trim()
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
};

// ============================================================
// Normalize Value
// ============================================================

const normalizeValue = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
};

// ============================================================
// Header Aliases
// ============================================================

const HEADER_ALIASES = {
  enrollmentno: "enrollment number",
  "enrollment no": "enrollment number",
  "enrollment no.": "enrollment number",
  enrollmentnumber: "enrollment number",
  "enrollment number": "enrollment number",

  rollno: "roll number",
  "roll no": "roll number",
  "roll no.": "roll number",
  rollnumber: "roll number",
  "roll number": "roll number",

  studentname: "student name",
  "student name": "student name",

  admissionyear: "admission year",
  passingyear: "passing year",
  mobilenumber: "mobile number",
  phonenumber: "phone number",

  coursename: "course name",
  "course name": "course name",

  "group (as per amizone)": "group (as per amizone)",
  "name of mentor": "name of mentor",
  nameofmentor: "name of mentor",

  emailid: "email",
  "email id": "email",
  "email address": "email",
};

// ============================================================
// Canonical Header
// ============================================================

const canonicalHeader = (header) => {
  const normalized = normalizeHeader(header);

  return HEADER_ALIASES[normalized] || normalized;
};

// ============================================================
// Recognized Headers
// ============================================================

const STUDENT_HEADERS = new Set([
  "enrollment number",
  "roll number",
  "student name",
  "batch",
  "semester",
  "section",
  "email",
  "mobile number",
  "admission year",
  "passing year",
]);

const MENTOR_HEADERS = new Set([
  "course name",
  "semester",
  "group (as per amizone)",
  "name of mentor",
]);

// ============================================================
// Find Header Row
// ============================================================

const findHeaderRow = (allRows) => {
  let bestIndex = -1;
  let bestScore = 0;

  const limit = Math.min(allRows.length, 30);

  for (let index = 0; index < limit; index++) {
    const row = allRows[index];

    if (!Array.isArray(row)) {
      continue;
    }

    const headers = row.map(canonicalHeader);

    const studentScore = headers.filter((header) =>
      STUDENT_HEADERS.has(header),
    ).length;

    const mentorScore = headers.filter((header) =>
      MENTOR_HEADERS.has(header),
    ).length;

    const score = Math.max(studentScore, mentorScore);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  if (bestIndex === -1 || bestScore < 2) {
    throw new Error(
      "Unable to identify Excel headers. Please use the correct import template.",
    );
  }

  return bestIndex;
};

// ============================================================
// Parse Excel
// ============================================================

const parseExcel = (file) => {
  if (!file) {
    throw new Error("Excel file not found.");
  }

  // ----------------------------------------------------------
  // Read Workbook
  // ----------------------------------------------------------

  const workbook = file.buffer
    ? XLSX.read(file.buffer, { type: "buffer" })
    : file.path
      ? XLSX.readFile(file.path)
      : null;

  if (!workbook) {
    throw new Error("Invalid uploaded Excel file.");
  }

  // ----------------------------------------------------------
  // Get First Sheet
  // ----------------------------------------------------------

  const firstSheet = workbook.SheetNames[0];

  if (!firstSheet) {
    throw new Error("No worksheet found in Excel.");
  }

  const worksheet = workbook.Sheets[firstSheet];

  // ----------------------------------------------------------
  // Read All Rows
  // ----------------------------------------------------------

  const allRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });

  if (!allRows.length) {
    throw new Error("Excel sheet is empty.");
  }

  // ----------------------------------------------------------
  // Detect Header Row
  // ----------------------------------------------------------

  const headerIndex = findHeaderRow(allRows);

  const headers = allRows[headerIndex].map(canonicalHeader);

  // ----------------------------------------------------------
  // Validate Header Duplicates
  // ----------------------------------------------------------

  const nonEmptyHeaders = headers.filter(Boolean);

  const duplicateHeaders = nonEmptyHeaders.filter(
    (header, index) => nonEmptyHeaders.indexOf(header) !== index,
  );

  if (duplicateHeaders.length > 0) {
    throw new Error(
      `Duplicate Excel headers found: ${[...new Set(duplicateHeaders)].join(
        ", ",
      )}`,
    );
  }

  // ----------------------------------------------------------
  // Convert Rows Into Objects
  // ----------------------------------------------------------

  const data = allRows
    .slice(headerIndex + 1)
    .map((row) => {
      const record = {};

      headers.forEach((header, index) => {
        if (!header) {
          return;
        }

        record[header] = normalizeValue(row[index]);
      });

      return record;
    })
    .filter((record) => Object.values(record).some((value) => value !== ""));

  if (!data.length) {
    throw new Error("No student or mentor records found in Excel.");
  }

  // ----------------------------------------------------------
  // Preserve Merged Course Name Cells For Mentor Import
  // ----------------------------------------------------------

  let lastCourse = "";

  data.forEach((row) => {
    if (Object.prototype.hasOwnProperty.call(row, "course name")) {
      if (row["course name"]) {
        lastCourse = row["course name"];
      } else {
        row["course name"] = lastCourse;
      }
    }
  });

  // ----------------------------------------------------------
  // Return Parsed Result
  // ----------------------------------------------------------

  return {
    sheetName: firstSheet,
    headerRow: headerIndex + 1,
    totalRows: data.length,
    headers: nonEmptyHeaders,
    data,
  };
};

// ============================================================
// Get Workbook Information
// ============================================================

const getWorkbookInfo = (file) => {
  if (!file) {
    throw new Error("Excel file not found.");
  }

  const workbook = file.buffer
    ? XLSX.read(file.buffer, { type: "buffer" })
    : file.path
      ? XLSX.readFile(file.path)
      : null;

  if (!workbook) {
    throw new Error("Invalid uploaded Excel file.");
  }

  return {
    totalSheets: workbook.SheetNames.length,
    sheetNames: workbook.SheetNames,
  };
};

// ============================================================
// Export
// ============================================================

module.exports = Object.freeze({
  parseExcel,
  getWorkbookInfo,
});
