const studentRepository = require("../repositories/studentMaster.repository");
const instituteRepository = require("../repositories/institute.repository");
const programRepository = require("../repositories/program.repository");

const { mapStudentRows } = require("../utils/studentExcelMapper");

const { validateStudents } = require("../utils/studentValidator");
const { parsePDF } = require("../../admin/utils/pdfParser");


// ============================================================================
// Default Import Configuration
// ============================================================================

const DEFAULT_INSTITUTE_CODE = "ASET";
const DEFAULT_PROGRAM_CODE = "CSE";

// ============================================================================
// Resolve Institute
// ============================================================================

const resolveInstitute = async () => {
  const institute = await instituteRepository.getInstituteByCode(
    DEFAULT_INSTITUTE_CODE,
  );

  if (!institute) {
    throw new Error(`Institute '${DEFAULT_INSTITUTE_CODE}' not found.`);
  }

  return institute;
};

// ============================================================================
// Resolve Program
// ============================================================================

const resolveProgram = async () => {
  const program =
    await programRepository.getProgramByCode(DEFAULT_PROGRAM_CODE);

  if (!program) {
    throw new Error(`Program '${DEFAULT_PROGRAM_CODE}' not found.`);
  }

  return program;
};

// ============================================================================
// Build Student Payload
// ============================================================================

const buildStudentPayload = (student, instituteId, programId) => {
  return {
    name: student.name,

    enrollmentNumber: student.enrollmentNumber.toUpperCase(),

    rollNumber: student.rollNumber,

    institute: instituteId,

    program: programId,

    batch: student.batch,

    semester: Number(student.semester),

    section: student.section.toUpperCase(),

    group: student.group ? student.group.toUpperCase() : null,

    isRegistered: false,

    isActive: true,
  };
};

// ============================================================================
// Import Students
// ============================================================================
const importStudents = async (records = []) => {
  // ============================================================================
// Validate Input
// ============================================================================

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Student data is required.");
  }

  // ============================================================================
// Step 1 : Map Student Records
// ============================================================================

  const mappedStudents =
    records.length > 0 &&
    records[0].enrollmentNumber &&
    records[0].rollNumber &&
    records[0].name
      ? records
      : mapStudentRows(records);

  const isMappedStudent = (record = {}) =>
    record.name && record.enrollmentNumber && record.rollNumber;


  // ============================================================================
// Step 2 : Business Validation
// ============================================================================

  const { validStudents, invalidStudents } = validateStudents(mappedStudents);

  // ============================================================================
// Step 3 : Resolve Academic References
// ============================================================================

  const institute = await resolveInstitute();

  const program = await resolveProgram();

  // ============================================================================
// Collections
// ============================================================================

  const studentsToInsert = [];

  const duplicateStudents = [];

  const failedStudents = [...invalidStudents];

  // ============================================================================
// Duplicate Detection
// ============================================================================

  const enrollmentSet = new Set();

  // ============================================================================
// Step 4 : Process Valid Students
// ============================================================================

  for (const student of validStudents) {
    const enrollment = student.enrollmentNumber.toUpperCase();

    // ============================================================================
// Duplicate In Uploaded File
// ============================================================================

    if (enrollmentSet.has(enrollment)) {
      duplicateStudents.push({
        enrollmentNumber: enrollment,

        reason: "Duplicate enrollment number found in uploaded file.",
      });

      continue;
    }

    enrollmentSet.add(enrollment);

    // ============================================================================
// Duplicate In Database
// ============================================================================

    const exists = await studentRepository.getStudentByEnrollment(enrollment);

    if (exists) {
      duplicateStudents.push({
        enrollmentNumber: enrollment,

        reason: "Student already exists in database.",
      });

      continue;
    }

    // ============================================================================
// Mongo Payload
// ============================================================================

    studentsToInsert.push(
      buildStudentPayload(student, institute._id, program._id),
    );
  }

  // ============================================================================
// Part 5B starts here...
// ============================================================================
  // ============================================================================
// Step 5 : Bulk Insert Students
// ============================================================================

  let importedCount = 0;

  if (studentsToInsert.length > 0) {
    try {
      await studentRepository.insertManyStudents(studentsToInsert);

      importedCount = studentsToInsert.length;
    } catch (error) {
      console.error("Student Bulk Import Error:", error.message);

      throw new Error("Unable to import student records.");
    }
  }

  // ============================================================================
// Step 6 : Prepare Import Summary
// ============================================================================

  const summary = {
    totalRecords: records.length,

    validRecords: validStudents.length,

    importedRecords: importedCount,

    duplicateRecords: duplicateStudents.length,

    failedRecords: failedStudents.length,
  };

  // ============================================================================
// Step 7 : Return Enterprise Response
// ============================================================================

  return {
    success: true,

    message: "Student import completed successfully.",

    summary,

    imported: importedCount,

    duplicates: duplicateStudents.length,

    failed: failedStudents.length,

    duplicateStudents,

    failedStudents,

    importedStudents: studentsToInsert,
  };
};

// ============================================================================
// Import Students From PDF
// ============================================================================

const importStudentsFromPDF = async (file) => {
  if (!file) {
    throw new Error("PDF file is required.");
  }

  // ============================================================================
// Parse PDF
// ============================================================================

  const pdfResult = await parsePDF(file);

  if (!pdfResult.students.length) {
    throw new Error("No students found in PDF.");
  }

  // ============================================================================
// Convert PDF Students
// ============================================================================

  const records = pdfResult.students.map((student) => ({
    name: student.name,

    enrollmentNumber: student.enrollmentNumber,

    rollNumber: student.rollNumber,

    program: DEFAULT_PROGRAM_CODE,

    batch: pdfResult.header.batch,

    semester: pdfResult.header.semester,

    section: pdfResult.header.section,

    group: student.assignedGroup === "No Group" ? "" : student.assignedGroup,
  }));

  // ============================================================================
// Reuse Existing Excel Import Logic
// ============================================================================

  return importStudents(records);
};

// ============================================================================
// Get All Students
// ============================================================================

const getAllStudents = async () => {
  return studentRepository.getAllStudents();
};

// ============================================================================
// Get Student By Enrollment
// ============================================================================

const getStudentByEnrollment = async (enrollmentNumber) => {
  const student =
    await studentRepository.getStudentByEnrollment(enrollmentNumber);

  if (!student) {
    throw new Error("Student not found.");
  }

  return student;
};

// ============================================================================
// Update Student
// ============================================================================

const updateStudent = async (id, payload) => {
  const student = await studentRepository.getStudentById(id);

  if (!student) {
    throw new Error("Student not found.");
  }

  return studentRepository.updateStudent(id, payload);
};

// ============================================================================
// Delete Student
// ============================================================================

const deleteStudent = async (id) => {
  const student = await studentRepository.getStudentById(id);

  if (!student) {
    throw new Error("Student not found.");
  }

  return studentRepository.deleteStudent(id);
};

// ============================================================================
// Export Service
// ============================================================================

module.exports = Object.freeze({
  importStudents,

  importStudentsFromPDF,

  getAllStudents,

  getStudentByEnrollment,

  updateStudent,

  deleteStudent,
});
