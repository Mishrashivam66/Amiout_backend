"use strict";

// ==========================================
// SEMESTER MAPPING
// ==========================================

const semesterMap = {
  "I SEMESTER": 1,
  "II SEMESTER": 2,
  "III SEMESTER": 3,
  "IV SEMESTER": 4,
  "V SEMESTER": 5,
  "VI SEMESTER": 6,
  "VII SEMESTER": 7,
  "VIII SEMESTER": 8,
};

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

    if (value !== undefined && clean(value) !== "") {
      return value;
    }
  }

  return "";
};

// ==========================================
// SEMESTER
// ==========================================

const parseSemester = (value) => {
  const normalized = upper(value);

  if (!normalized) return null;

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
// ROLES ARRAY
// ==========================================

const parseRoles = (value) => {
  const raw = clean(value);

  if (!raw) return [];

  const roles = raw
    .replace(/[\[\]"]/g, "")
    .split(/[,;+]/)
    .map(upper)
    .filter(Boolean);

  return [...new Set(roles)];
};

// ==========================================
// COORDINATOR GROUPS ARRAY
// ==========================================

const parseGroups = (value) => {
  const raw = clean(value);

  if (!raw) return [];

  return [...new Set(raw.split(/[,;]+/).map(upper).filter(Boolean))];
};

// ==========================================
// MAP MENTOR / FACULTY EXCEL ROWS
// ==========================================

const mapMentorRows = (rows = []) => {
  if (!Array.isArray(rows)) {
    throw new TypeError("Excel rows must be an array.");
  }

  return rows.map((originalRow, index) => {
    const row = normalizeRow(originalRow);

    const facultyId = upper(
      getValue(row, "Faculty ID", "Employee ID", "Faculty Code"),
    );

    const mentorName = clean(
      getValue(row, "Faculty Name", "Mentor Name", "Name of Mentor", "Name"),
    );

    const mentorEmail = lower(
      getValue(row, "Faculty Email", "Official Email", "Mentor Email", "Email"),
    );

    const designation = clean(getValue(row, "Designation"));

    const institute = upper(getValue(row, "Institute", "Institute Code"));

    const department = upper(getValue(row, "Department", "Department Code"));

    const program = upper(getValue(row, "Program", "Program Code"));

    const semester = parseSemester(getValue(row, "Semester"));

    const section = upper(getValue(row, "Section"));

    const group = upper(
      getValue(row, "Mentor Group", "Group", "Group (as per Amizone)"),
    );

    const coordinatorGroups = parseGroups(getValue(row, "Coordinator Groups"));

    const rawRoles = getValue(row, "Roles", "Role");

    const roles = parseRoles(rawRoles);

    // Legacy Excel did not contain roles.
    const finalRoles = clean(rawRoles) === "" ? ["MENTOR"] : roles;

    const course =
      upper(getValue(row, "Course Name", "Course")) ||
      (program && section ? `${program}, SECTION ${section}` : program);

    const coordinator = clean(
      getValue(row, "Name of Class Coordinator", "Coordinator Name"),
    );

    const totalStudentsRaw = getValue(
      row,
      "Total No. of Students",
      "No.of Students",
      "Total Students",
    );

    const totalStudents = Math.max(0, Number(totalStudentsRaw) || 0);

    const invalidRoles = finalRoles.filter((role) => !VALID_ROLES.has(role));

    return {
      rowNumber: index + 2,

      facultyId,
      mentorName,
      mentorEmail,
      designation,

      roles: finalRoles,
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
    };
  });
};

// ==========================================
// EXPORT
// ==========================================

module.exports = Object.freeze({
  mapMentorRows,
  parseRoles,
  parseGroups,
  parseSemester,
});
