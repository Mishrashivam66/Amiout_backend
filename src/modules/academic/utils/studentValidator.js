
// ============================================================================
// Validate Required Fields
// ============================================================================
const validateRequiredFields = (student = {}) => {
  const errors = [];

  if (!student.name) {
    errors.push("Student Name is required.");
  }

  if (!student.enrollmentNumber) {
    errors.push("Enrollment Number is required.");
  }

  if (!student.rollNumber) {
    errors.push("Roll Number is required.");
  }

  if (!student.program) {
    errors.push("Program is required.");
  }

  if (!student.batch) {
    errors.push("Batch is required.");
  }

  if (!student.semester) {
    errors.push("Semester is required.");
  }

  if (!student.section) {
    errors.push("Section is required.");
  }

  return errors;
};

// ============================================================================
// Validate Enrollment Number
// ============================================================================
const validateEnrollmentNumber = (enrollmentNumber = "") => {
  const value = String(enrollmentNumber).trim().toUpperCase();

  if (value.length < 8) {
    return "Invalid Enrollment Number.";
  }

  return null;
};

// ============================================================================
// Validate Semester
// ============================================================================
const validateSemester = (semester) => {
  const number = Number(semester);

  if (Number.isNaN(number)) {
    return "Semester must be a number.";
  }

  if (number < 1 || number > 12) {
    return "Semester must be between 1 and 12.";
  }

  return null;
};

// ============================================================================
// Validate Section
// ============================================================================
const validateSection = (section = "") => {
  const value = String(section).trim().toUpperCase();

  if (!value) {
    return "Section is required.";
  }

  return null;
};

// ============================================================================
// Validate Batch
// ============================================================================
const validateBatch = (batch = "") => {
  if (!String(batch).trim()) {
    return "Batch is required.";
  }

  return null;
};

// ============================================================================
// Validate Student Record
// ============================================================================
const validateStudent = (student = {}) => {
  const errors = [];

  errors.push(...validateRequiredFields(student));

  const enrollmentError = validateEnrollmentNumber(student.enrollmentNumber);

  if (enrollmentError) {
    errors.push(enrollmentError);
  }

  const semesterError = validateSemester(student.semester);

  if (semesterError) {
    errors.push(semesterError);
  }

  const batchError = validateBatch(student.batch);

  if (batchError) {
    errors.push(batchError);
  }

  const sectionError = validateSection(student.section);

  if (sectionError) {
    errors.push(sectionError);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// ============================================================================
// Validate Multiple Students
// ============================================================================
const validateStudents = (students = []) => {
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

module.exports = Object.freeze({
  validateStudent,
  validateStudents,
});
