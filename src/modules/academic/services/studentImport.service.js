"use strict";

const studentRepository = require("../repositories/studentMaster.repository");
const instituteRepository = require("../repositories/institute.repository");
const programRepository = require("../repositories/program.repository");
const { runAutomaticMapping } = require("./autoMapping.service");
const { mapStudentRows } = require("../utils/studentExcelMapper");
const { validateStudents } = require("../utils/studentValidator");

const { parsePDF } = require("../../admin/utils/pdfParser");

// ============================================================
// Configuration
// ============================================================

// Approved institute names.
// Unknown institute codes must be registered by Admin first.
const INSTITUTE_NAMES = Object.freeze({
  ASET: "Amity School of Engineering and Technology",
  ABS: "Amity Business School",
});

// Legacy PDF defaults
const PDF_DEFAULT_INSTITUTE_CODE = "ASET";
const PDF_DEFAULT_PROGRAM_CODE = "CSE";

// ============================================================
// Helpers
// ============================================================

const normalizeCode = (value) => {
  return String(value ?? "")
    .trim()
    .toUpperCase();
};

// ============================================================
// Build Program Details
// ============================================================

const buildProgramDetails = (student, instituteId) => {
  const code = normalizeCode(student.program);

  const degree = String(student.degree || student.course || "").trim();

  const admissionYear = Number(student.admissionYear);
  const passingYear = Number(student.passingYear);

  if (!code || !degree) {
    throw new Error(
      "Program code and Course are required to create a Program Master.",
    );
  }

  const duration = passingYear - admissionYear;

  if (!Number.isInteger(duration) || duration <= 0 || duration > 10) {
    throw new Error(`Invalid admission/passing years for program '${code}'.`);
  }

  // Currently configured for four-year B.Tech programs.
  if (normalizeCode(degree) !== "B.TECH" || duration !== 4) {
    throw new Error(
      `Automatic program creation for '${degree}' (${duration} years) ` +
        "is not configured. Please verify its duration and semester structure.",
    );
  }

  const department = String(student.department || student.branch || "").trim();

  return {
    institute: instituteId,
    name: department ? `${degree} ${department}` : code,
    code,
    degree,
    duration,
    totalSemesters: 8,
    isActive: true,
    isDeleted: false,
  };
};

// ============================================================
// Resolve or Automatically Create Institute
// ============================================================

const resolveInstitute = async (instituteCode) => {
  const code = normalizeCode(instituteCode);

  if (!code) {
    throw new Error("Institute code is required.");
  }

  // Includes active, inactive and soft-deleted records.
  let institute =
    await instituteRepository.getInstituteByCodeIncludingDeleted(code);

  // Reuse existing active institute.
  if (institute) {
    if (institute.isDeleted || !institute.isActive) {
      throw new Error(
        `Institute '${code}' is inactive or deleted. ` +
          "Please reactivate it from Institute Master.",
      );
    }

    return institute;
  }

  // Find approved official name.
  const instituteName = INSTITUTE_NAMES[code];

  if (!instituteName) {
    throw new Error(
      `Unknown institute code '${code}'. ` +
        "Please register its official name in Institute Master.",
    );
  }

  // Create institute automatically.
  try {
    institute = await instituteRepository.createInstitute({
      name: instituteName,
      code,
      description: "",
      isActive: true,
      isDeleted: false,
    });

    return institute;
  } catch (error) {
    // Handle concurrent imports.
    if (error.code === 11000) {
      institute =
        await instituteRepository.getInstituteByCodeIncludingDeleted(code);

      if (institute && institute.isActive && !institute.isDeleted) {
        return institute;
      }
    }

    throw error;
  }
};

// ============================================================
// Resolve or Automatically Create Program
// ============================================================

const resolveProgram = async (student, instituteId, options = {}) => {
  const code = normalizeCode(student.program);

  if (!code) {
    throw new Error("Program code is required.");
  }

  let program = await programRepository.getProgramByCodeAndInstitute(
    code,
    instituteId,
  );

  if (program) {
    if (!program.isActive || program.isDeleted) {
      throw new Error(`Program '${code}' is inactive.`);
    }

    return program;
  }

  // Preserve legacy PDF behavior.
  if (options.source === "PDF") {
    throw new Error(`Program '${code}' not found for the selected institute.`);
  }

  const payload = buildProgramDetails(student, instituteId);

  try {
    program = await programRepository.createProgram(payload);

    return program;
  } catch (error) {
    // Another import may have created this program.
    if (error.code === 11000) {
      program = await programRepository.getProgramByCodeAndInstitute(
        code,
        instituteId,
      );

      if (program && program.isActive && !program.isDeleted) {
        return program;
      }
    }

    throw error;
  }
};

// ============================================================
// Build Student Payload
// ============================================================

const buildStudentPayload = (student, instituteId, programId) => {
  return {
    name: String(student.name).trim(),

    enrollmentNumber: normalizeCode(student.enrollmentNumber),

    rollNumber: String(student.rollNumber).trim(),

    email: student.email
      ? String(student.email).trim().toLowerCase()
      : undefined,

    mobileNumber: String(student.mobileNumber ?? "").trim(),

    // Parent / Guardian Details
    parentName: String(student.parentName ?? "").trim(),

    parentMobileNumber: String(student.parentMobileNumber ?? "").trim(),

    // Academic Details
    admissionYear: student.admissionYear
      ? Number(student.admissionYear)
      : undefined,

    passingYear: student.passingYear ? Number(student.passingYear) : undefined,

    institute: instituteId,
    program: programId,

    batch: String(student.batch).trim(),

    semester: Number(student.semester),

    section: normalizeCode(student.section),

    group: student.group ? normalizeCode(student.group) : null,

    isRegistered: true,
    isActive: true,
  };
};

// ============================================================
// Normalize Student
// ============================================================

const normalizeStudent = (student) => {
  const normalized = { ...student };

  normalized.institute = normalizeCode(normalized.institute);

  normalized.program = normalizeCode(normalized.program);

  if (!normalized.batch && normalized.admissionYear && normalized.passingYear) {
    normalized.batch = `${normalized.admissionYear}-${normalized.passingYear}`;
  }

  return normalized;
};

// ============================================================
// Import Students From Excel
// ============================================================

const importStudents = async (records = [], options = {}) => {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Student data is required.");
  }

  // Step 1: Map Excel records.
  const mappedStudents = records.map((record) => {
    const alreadyMapped =
      Object.prototype.hasOwnProperty.call(record, "enrollmentNumber") &&
      Object.prototype.hasOwnProperty.call(record, "rollNumber") &&
      Object.prototype.hasOwnProperty.call(record, "name");

    const mapped = alreadyMapped ? record : mapStudentRows([record])[0];

    return normalizeStudent(mapped);
  });

  // Step 2: Legacy PDF defaults.
  if (options.source === "PDF") {
    mappedStudents.forEach((student) => {
      if (!student.institute) {
        student.institute = PDF_DEFAULT_INSTITUTE_CODE;
      }

      if (!student.program) {
        student.program = PDF_DEFAULT_PROGRAM_CODE;
      }
    });
  }

  // Step 3: Validate students.
  const { validStudents, invalidStudents } = validateStudents(mappedStudents);

  const studentsToInsert = [];
  const duplicateStudents = [];
  const failedStudents = [...invalidStudents];

  const enrollmentSet = new Set();

  const instituteCache = new Map();
  const programCache = new Map();

  // Step 4: Process valid students.
  for (const student of validStudents) {
    const enrollment = normalizeCode(student.enrollmentNumber);

    // Duplicate inside uploaded Excel.
    if (enrollmentSet.has(enrollment)) {
      duplicateStudents.push({
        enrollmentNumber: enrollment,
        reason: "Duplicate enrollment number found in uploaded file.",
      });

      continue;
    }

    enrollmentSet.add(enrollment);

    // Duplicate in database.
    const exists = await studentRepository.getStudentByEnrollment(enrollment);

    if (exists) {
      duplicateStudents.push({
        enrollmentNumber: enrollment,
        reason: "Student already exists in database.",
      });

      continue;
    }

    const instituteCode = normalizeCode(student.institute);

    const programCode = normalizeCode(student.program);

    if (!instituteCode) {
      failedStudents.push({
        enrollmentNumber: enrollment,
        errors: ["Institute code is required."],
      });

      continue;
    }

    if (!programCode) {
      failedStudents.push({
        enrollmentNumber: enrollment,
        errors: ["Program code is required."],
      });

      continue;
    }

    let institute;
    let program;

    try {
      // Resolve Institute
      if (instituteCache.has(instituteCode)) {
        institute = instituteCache.get(instituteCode);
      } else {
        institute = await resolveInstitute(instituteCode);

        instituteCache.set(instituteCode, institute);
      }

      // Resolve Program
      const programCacheKey = `${institute._id}:${programCode}`;

      if (programCache.has(programCacheKey)) {
        program = programCache.get(programCacheKey);
      } else {
        program = await resolveProgram(student, institute._id, options);

        programCache.set(programCacheKey, program);
      }
    } catch (error) {
      failedStudents.push({
        enrollmentNumber: enrollment,
        errors: [error.message],
      });

      continue;
    }

    // Build StudentMaster document.
    studentsToInsert.push(
      buildStudentPayload(student, institute._id, program._id),
    );
  }

  // Step 5: Insert students.
  let importedCount = 0;

  if (studentsToInsert.length > 0) {
    try {
      const inserted =
        await studentRepository.insertManyStudents(studentsToInsert);

      importedCount = Array.isArray(inserted)
        ? inserted.length
        : studentsToInsert.length;
    } catch (error) {
      console.error("Student Bulk Import Error:", error);

      throw new Error("Unable to import student records: " + error.message);
    }
  }

  // ============================================================
  // STEP 5.1: AUTOMATIC MENTOR MAPPING AFTER STUDENT IMPORT
  // ============================================================

  // ============================================================
  // AUTOMATIC MAPPING AFTER STUDENT IMPORT
  // ============================================================

  let mentorMapping = {
    triggered: false,
    success: null,
    mapped: 0,
    failed: 0,
    errors: [],
    message: "No new students imported.",
  };

  if (importedCount > 0) {
    mentorMapping = await runAutomaticMapping("STUDENT_IMPORT");
  }

  // ============================================================
  // STEP 6: SUMMARY
  // ============================================================

  // Step 6: Summary.
  const summary = {
    totalRecords: records.length,
    validRecords: validStudents.length,
    importedRecords: importedCount,
    duplicateRecords: duplicateStudents.length,
    failedRecords: failedStudents.length,
  };

  // Step 7: Result.
  return {
    success: true,
    message:
      importedCount > 0
        ? "Student import completed successfully."
        : "No new students were imported.",

    summary,

    imported: importedCount,
    duplicates: duplicateStudents.length,
    failed: failedStudents.length,

    duplicateStudents,
    failedStudents,

    importedStudents: studentsToInsert,
    mentorMapping,
  };
};

// ============================================================
// Legacy PDF Import
// ============================================================

const importStudentsFromPDF = async (file) => {
  if (!file) {
    throw new Error("PDF file is required.");
  }

  const pdfResult = await parsePDF(file);

  if (!pdfResult.students.length) {
    throw new Error("No students found in PDF.");
  }

  const records = pdfResult.students.map((student) => ({
    name: student.name,
    enrollmentNumber: student.enrollmentNumber,
    rollNumber: student.rollNumber,

    institute: PDF_DEFAULT_INSTITUTE_CODE,
    program: PDF_DEFAULT_PROGRAM_CODE,

    batch: pdfResult.header.batch,
    semester: pdfResult.header.semester,
    section: pdfResult.header.section,

    group: student.assignedGroup === "No Group" ? "" : student.assignedGroup,
  }));

  return importStudents(records, {
    source: "PDF",
  });
};

// ============================================================
// Get All Students
// ============================================================

const getAllStudents = async () => {
  return studentRepository.getAllStudents();
};

// ============================================================
// Get Student By Enrollment
// ============================================================

const getStudentByEnrollment = async (enrollmentNumber) => {
  const student =
    await studentRepository.getStudentByEnrollment(enrollmentNumber);

  if (!student) {
    throw new Error("Student not found.");
  }

  return student;
};

// ============================================================
// Update Student
// ============================================================

const updateStudent = async (id, payload) => {
  const student = await studentRepository.getStudentById(id);

  if (!student) {
    throw new Error("Student not found.");
  }

  return studentRepository.updateStudent(id, payload);
};

// ============================================================
// Delete Student
// ============================================================

const deleteStudent = async (id) => {
  const student = await studentRepository.getStudentById(id);

  if (!student) {
    throw new Error("Student not found.");
  }

  return studentRepository.deleteStudent(id);
};

// ============================================================
// Exports
// ============================================================

module.exports = Object.freeze({
  importStudents,
  importStudentsFromPDF,
  getAllStudents,
  getStudentByEnrollment,
  updateStudent,
  deleteStudent,
});
