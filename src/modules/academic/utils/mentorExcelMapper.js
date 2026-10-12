"use strict";

// ==========================================
// SEMESTER MAPPING
// ==========================================

const semesterMap = Object.freeze({
  "I SEMESTER": 1,
  "II SEMESTER": 2,
  "III SEMESTER": 3,
  "IV SEMESTER": 4,
  "V SEMESTER": 5,
  "VI SEMESTER": 6,
  "VII SEMESTER": 7,
  "VIII SEMESTER": 8,
});

const VALID_ROLES = new Set(["MENTOR", "COORDINATOR", "HOD", "HOI"]);

// ==========================================
// NORMALIZATION HELPERS
// ==========================================

const clean = (value) => String(value ?? "").trim();

const upper = (value) => clean(value).toUpperCase();

const lower = (value) => clean(value).toLowerCase();

const normalizeHeader = (header) =>
  lower(header).replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();

const normalizeRow = (row = {}) => {
  const result = {};

  for (const [key, value] of Object.entries(row)) {
    result[normalizeHeader(key)] = value;
  }

  return result;
};

const getValue = (row, ...headers) => {
  for (const header of headers) {
    const value = row[normalizeHeader(header)];

    if (value !== undefined && value !== null && clean(value) !== "") {
      return value;
    }
  }

  return "";
};

// ==========================================
// SEMESTER PARSER
// ==========================================

const parseSemester = (value) => {
  const normalized = upper(value);

  if (!normalized) {
    return null;
  }

  if (semesterMap[normalized]) {
    return semesterMap[normalized];
  }

  const number = Number(normalized);

  if (Number.isInteger(number) && number >= 1 && number <= 12) {
    return number;
  }

  return null;
};

// ==========================================
// ROLES PARSER
// ==========================================

const parseRoles = (value) => {
  const values = Array.isArray(value)
    ? value
    : clean(value)
        .replace(/[\[\]"]/g, "")
        .split(/[,;+]/);

  return [
    ...new Set(
      values
        .flatMap((item) => clean(item).split(/[,;+]/))
        .map(upper)
        .filter(Boolean),
    ),
  ];
};

// ==========================================
// COORDINATOR GROUPS PARSER
// ==========================================

const parseGroups = (value) => {
  const values = Array.isArray(value) ? value : clean(value).split(/[,;]+/);

  return [
    ...new Set(
      values
        .flatMap((item) => clean(item).split(/[,;]+/))
        .map(upper)
        .filter(Boolean),
    ),
  ];
};

// ==========================================
// FACULTY EXCEL MAPPER
// ==========================================

const mapMentorRows = (rows = []) => {
  if (!Array.isArray(rows)) {
    throw new TypeError("Excel rows must be an array.");
  }

  return rows.map((originalRow, index) => {
    const row = normalizeRow(originalRow);

    // ======================================
    // FACULTY IDENTITY
    // ======================================

    const facultyId = upper(
      getValue(row, "Faculty ID", "Employee ID", "Faculty Code"),
    );

    const mentorName = clean(
      getValue(row, "Faculty Name", "Mentor Name", "Name of Mentor", "Name"),
    );

    const mentorEmail = lower(
      getValue(
        row,
        "Faculty Official Email",
        "Faculty Email",
        "Official Email",
        "Mentor Email",
        "Email",
      ),
    );

    const designation = clean(getValue(row, "Designation"));

    // ======================================
    // FACULTY ROLES
    // ======================================

    const rawRoles = getValue(row, "Roles", "Role", "Role(s)");

    const roles = clean(rawRoles) === "" ? ["MENTOR"] : parseRoles(rawRoles);

    const invalidRoles = roles.filter((role) => !VALID_ROLES.has(role));

    // ======================================
    // ACADEMIC DETAILS
    // ======================================

    const institute = upper(getValue(row, "Institute", "Institute Code"));

    const department = upper(getValue(row, "Department", "Department Code"));

    const program = upper(getValue(row, "Program", "Program Code"));

    const semester = parseSemester(getValue(row, "Semester"));

    const section = upper(getValue(row, "Section"));

    const group = upper(
      getValue(row, "Mentor Group", "Group", "Group (as per Amizone)"),
    );

    // ======================================
    // COORDINATOR GROUPS
    // ======================================

    const coordinatorGroups = parseGroups(
      getValue(
        row,
        "Coordinator Groups (comma separated)",
        "Coordinator Groups",
        "Coordinator Group",
        "Groups Coordinated",
      ),
    );

    // ======================================
    // COURSE
    // ======================================

    // Only use a course if it is explicitly
    // provided. Do not invent a course name
    // from Program + Section.

    const course =
      upper(getValue(row, "Course Name", "Course", "Course Code")) || program;

    // ======================================
    // COORDINATOR NAME
    // ======================================

    const coordinator = clean(
      getValue(
        row,
        "Name of Class Coordinator",
        "Coordinator Name",
        "Coordinator",
      ),
    );

    // ======================================
    // TOTAL STUDENTS
    // ======================================

    const totalStudentsRaw = getValue(
      row,
      "Total No. of Students",
      "No.of Students",
      "Total Students",
    );

    const totalStudentsNumber = Number(totalStudentsRaw);

    const totalStudents =
      clean(totalStudentsRaw) !== "" && Number.isFinite(totalStudentsNumber)
        ? Math.max(0, Math.floor(totalStudentsNumber))
        : 0;

    // ======================================
    // ADDITIONAL EXCEL DETAILS
    // ======================================

    const contactNumber = clean(
      getValue(
        row,
        "Contact Number (optional)",
        "Contact Number",
        "Mobile Number",
        "Phone Number",
      ),
    );

    const notes = clean(getValue(row, "Notes (optional)", "Notes", "Remarks"));

    // ======================================
    // FINAL MAPPED RECORD
    // ======================================

    return {
      rowNumber: index + 2,

      facultyId,
      mentorName,
      mentorEmail,
      designation,

      roles,
      invalidRoles,

      institute,
      department,
      program,

      course,
      semester,
      section,
      group,

      coordinatorGroups,
      coordinator,
      totalStudents,

      contactNumber,
      notes,
    };
  });
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = Object.freeze({
  mapMentorRows,
  parseRoles,
  parseGroups,
  parseSemester,
});
