// ============================================================================
// Header Mapping
// ============================================================================

const HEADER_MAPPING = {
  /*
  ============================================================
  Name
  ============================================================
  */

  student_name: "name",
  student: "name",
  name: "name",

  /*
  ============================================================
  Enrollment
  ============================================================
  */

  enrollment_number: "enrollmentNumber",
  enrollment_no: "enrollmentNumber",
  enrollment: "enrollmentNumber",

  /*
  ============================================================
  Roll Number
  ============================================================
  */

  roll_number: "rollNumber",
  roll_no: "rollNumber",
  rollno: "rollNumber",

  /*
  ============================================================
  Institute
  ============================================================
  */

  institute: "institute",

  /*
  ============================================================
  Program
  ============================================================
  */

  program: "program",
  course: "program",

  /*
  ============================================================
  Academic
  ============================================================
  */

  batch: "batch",

  semester: "semester",

  section: "section",

  group: "group",
};

// ============================================================================
// Normalize Header
// ============================================================================

const normalizeHeader = (header = "") => {
  return String(header)
    .trim()
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[_\-\s]+/g, "_");
};
// ============================================================================
// Map Single Row
// ============================================================================

const mapStudentRow = (row = {}) => {
  const student = {};

  Object.entries(row).forEach(([key, value]) => {
    const normalizedKey = normalizeHeader(key);

    const mappedKey = HEADER_MAPPING[normalizedKey];

    if (!mappedKey) return;

    student[mappedKey] = typeof value === "string" ? value.trim() : value;
  });

  return student;
};

// ============================================================================
// Map Multiple Rows
// ============================================================================

const mapStudentRows = (rows = []) => {
  return rows.map(mapStudentRow);
};

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  mapStudentRow,
  mapStudentRows,
});
