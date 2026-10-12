"use strict";

// ============================================================
// Helpers
// ============================================================

const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

// ============================================================
// Validate Required Fields
// ============================================================

const validateRequiredFields = (student = {}) => {
  const errors = [];

  const requiredFields = [
    ["name", "Student Name"],
    ["enrollmentNumber", "Enrollment Number"],
    ["rollNumber", "Roll Number"],
    ["email", "Student Email"],
    ["institute", "Institute"],
    ["program", "Program"],
    ["degree", "Course"],
    ["batch", "Batch"],
    ["semester", "Semester"],
    ["section", "Section"],

    // Parent / Guardian Information
    ["parentName", "Parent Name"],
    ["parentMobileNumber", "Parent Mobile Number"],
  ];

  for (const [field, label] of requiredFields) {
    if (!hasValue(student[field])) {
      errors.push(`${label} is required.`);
    }
  }

  return errors;
};

// ============================================================
// Validate Enrollment Number
// ============================================================

const validateEnrollmentNumber = (enrollmentNumber) => {
  if (!hasValue(enrollmentNumber)) return null;

  const value = String(enrollmentNumber).trim().toUpperCase();

  if (value.length < 8) {
    return "Invalid Enrollment Number.";
  }

  return null;
};

// ============================================================
// Validate Semester
// ============================================================

const validateSemester = (semester) => {
  if (!hasValue(semester)) return null;

  const number = Number(semester);

  if (!Number.isInteger(number)) {
    return "Semester must be a whole number.";
  }

  if (number < 1 || number > 12) {
    return "Semester must be between 1 and 12.";
  }

  return null;
};

// ============================================================
// Validate Student Email
// ============================================================

const validateEmail = (email) => {
  if (!hasValue(email)) return null;

  const value = String(email).trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "Invalid Student Email.";
  }

  return null;
};

// ============================================================
// Validate Parent Name
// ============================================================

const validateParentName = (parentName) => {
  if (!hasValue(parentName)) return null;

  const value = String(parentName).trim();

  if (value.length < 2 || value.length > 150) {
    return "Parent Name must contain 2 to 150 characters.";
  }

  return null;
};

// ============================================================
// Validate Parent Mobile Number
// ============================================================

const validateParentMobileNumber = (number) => {
  if (!hasValue(number)) return null;

  const value = String(number).trim();

  if (!/^[0-9]{10}$/.test(value)) {
    return "Parent Mobile Number must contain exactly 10 digits.";
  }

  return null;
};

// ============================================================
// Validate Academic Years
// ============================================================

const validateAcademicYears = (student = {}) => {
  const errors = [];

  const hasAdmission = hasValue(student.admissionYear);
  const hasPassing = hasValue(student.passingYear);

  if (hasAdmission) {
    const year = Number(student.admissionYear);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      errors.push("Invalid Admission Year.");
    }
  }

  if (hasPassing) {
    const year = Number(student.passingYear);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      errors.push("Invalid Passing Year.");
    }
  }

  if (hasAdmission && hasPassing) {
    const admission = Number(student.admissionYear);
    const passing = Number(student.passingYear);

    if (
      Number.isInteger(admission) &&
      Number.isInteger(passing) &&
      passing <= admission
    ) {
      errors.push("Passing Year must be greater than Admission Year.");
    }
  }

  return errors;
};

// ============================================================
// Validate Single Student
// ============================================================

const validateStudent = (student = {}) => {
  const errors = validateRequiredFields(student);

  const checks = [
    validateEnrollmentNumber(student.enrollmentNumber),
    validateSemester(student.semester),
    validateEmail(student.email),
    validateParentName(student.parentName),
    validateParentMobileNumber(student.parentMobileNumber),
  ];

  for (const error of checks) {
    if (error) {
      errors.push(error);
    }
  }

  errors.push(...validateAcademicYears(student));

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// ============================================================
// Validate Multiple Students
// ============================================================

const validateStudents = (students = []) => {
  if (!Array.isArray(students)) {
    throw new Error("Students must be an array.");
  }

  const validStudents = [];
  const invalidStudents = [];

  students.forEach((student, index) => {
    const validation = validateStudent(student);

    if (validation.isValid) {
      validStudents.push(student);
    } else {
      invalidStudents.push({
        row: index + 2,
        enrollmentNumber: student.enrollmentNumber || null,
        errors: validation.errors,
      });
    }
  });

  return {
    validStudents,
    invalidStudents,
  };
};

// ============================================================
// Exports
// ============================================================

module.exports = Object.freeze({
  validateStudent,
  validateStudents,
});
