"use strict";

// ============================================================
// Excel Header Mapping
// ============================================================

const HEADER_MAPPING = {
  // Student Identity
  student_name: "name",
  studentname: "name",
  name: "name",
  student: "name",

  enrollment_number: "enrollmentNumber",
  enrollment_no: "enrollmentNumber",
  enrollmentno: "enrollmentNumber",
  enrollmentnumber: "enrollmentNumber",
  enrollment: "enrollmentNumber",

  roll_number: "rollNumber",
  roll_no: "rollNumber",
  rollnumber: "rollNumber",
  rollno: "rollNumber",

  // Student Contact Information
  email: "email",
  email_id: "email",
  email_address: "email",

  mobile_number: "mobileNumber",
  mobilenumber: "mobileNumber",
  phone_number: "mobileNumber",
  phone: "mobileNumber",

  // Parent / Guardian Information
  parent_name: "parentName",
  parentname: "parentName",
  parents_name: "parentName",
  guardian_name: "parentName",
  father_name: "parentName",
  mother_name: "parentName",

  parent_mobile_number: "parentMobileNumber",
  parent_mobilenumber: "parentMobileNumber",
  parent_phone_number: "parentMobileNumber",
  parent_contact_number: "parentMobileNumber",
  parent_mobile: "parentMobileNumber",
  parent_phone: "parentMobileNumber",
  guardian_mobile_number: "parentMobileNumber",
  guardian_phone_number: "parentMobileNumber",

  // Institute
  institute: "institute",
  institute_code: "institute",

  // Department
  department: "department",
  department_name: "department",

  // Course / Degree
  course: "degree",
  course_name: "degree",
  degree: "degree",

  // Branch
  branch: "branch",
  branch_name: "branch",
  specialization: "branch",

  // Program Code
  program: "program",
  program_code: "program",

  // Batch and Academic Years
  batch: "batch",

  admission_year: "admissionYear",
  admissionyear: "admissionYear",

  passing_year: "passingYear",
  passingyear: "passingYear",

  // Class Details
  semester: "semester",
  section: "section",
  group: "group",
};

// ============================================================
// Normalize Excel Header
// ============================================================

const normalizeHeader = (header = "") => {
  return String(header ?? "")
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[_\-\s]+/g, "_");
};

// ============================================================
// Map Single Student Row
// ============================================================

const mapStudentRow = (row = {}) => {
  const student = {};

  Object.entries(row).forEach(([key, value]) => {
    const normalizedKey = normalizeHeader(key);
    const mappedKey = HEADER_MAPPING[normalizedKey];

    if (!mappedKey) return;

    student[mappedKey] = typeof value === "string" ? value.trim() : value;
  });

  // Student Identifiers
  if (student.enrollmentNumber) {
    student.enrollmentNumber = String(student.enrollmentNumber)
      .trim()
      .toUpperCase();
  }

  if (student.rollNumber) {
    student.rollNumber = String(student.rollNumber).trim();
  }

  // Student Contact
  if (student.email) {
    student.email = String(student.email).trim().toLowerCase();
  }

  if (student.mobileNumber != null) {
    student.mobileNumber = String(student.mobileNumber).trim();
  }

  // Parent / Guardian Details
  if (student.parentName != null) {
    student.parentName = String(student.parentName).trim();
  }

  if (student.parentMobileNumber != null) {
    student.parentMobileNumber = String(student.parentMobileNumber).trim();
  }

  // Institute and Program Codes
  if (student.institute) {
    student.institute = String(student.institute).trim().toUpperCase();
  }

  if (student.program) {
    student.program = String(student.program).trim().toUpperCase();
  }

  // Section and Group
  if (student.section) {
    student.section = String(student.section).trim().toUpperCase();
  }

  if (student.group) {
    student.group = String(student.group).trim().toUpperCase();
  }

  // Derive Batch
  if (!student.batch && student.admissionYear && student.passingYear) {
    student.batch = `${student.admissionYear}-${student.passingYear}`;
  }

  return student;
};

// ============================================================
// Map Multiple Student Rows
// ============================================================

const mapStudentRows = (rows = []) => {
  if (!Array.isArray(rows)) {
    throw new Error("Student rows must be an array.");
  }

  return rows.map(mapStudentRow);
};

// ============================================================
// Export
// ============================================================

module.exports = Object.freeze({
  mapStudentRow,
  mapStudentRows,
});
