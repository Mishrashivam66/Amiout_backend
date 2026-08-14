const path = require("path");

const asyncHandler = require("express-async-handler");

const studentImportService = require("../services/studentImport.service");

const { parseAndNormalizeExcel } = require("../utils/excelParser");

// ============================================================================
// Import Students From Excel
// ============================================================================
const importStudents = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Please upload an Excel file.",
    });
  }

  const filePath = path.resolve(req.file.path);

  const students = parseAndNormalizeExcel(filePath);

  const result = await studentImportService.importStudents(students);

  return res.status(201).json({
    success: true,
    message: "Students imported successfully.",
    data: result,
  });
});

// ============================================================================
// Get All Students
// ============================================================================
const getAllStudents = asyncHandler(async (req, res) => {
  const students = await studentImportService.getAllStudents();

  return res.status(200).json({
    success: true,
    count: students.length,
    data: students,
  });
});

// ============================================================================
// Get Student By Enrollment Number
// ============================================================================
const getStudentByEnrollment = asyncHandler(async (req, res) => {
  const student = await studentImportService.getStudentByEnrollment(
    req.params.enrollmentNumber,
  );

  return res.status(200).json({
    success: true,
    data: student,
  });
});

// ============================================================================
// Update Student
// ============================================================================
const updateStudent = asyncHandler(async (req, res) => {
  const student = await studentImportService.updateStudent(
    req.params.id,
    req.body,
  );

  return res.status(200).json({
    success: true,
    message: "Student updated successfully.",
    data: student,
  });
});

// ============================================================================
// Delete Student
// ============================================================================
const deleteStudent = asyncHandler(async (req, res) => {
  await studentImportService.deleteStudent(req.params.id);

  return res.status(200).json({
    success: true,
    message: "Student deleted successfully.",
  });
});

// ============================================================================
// Import Students From PDF
// ============================================================================

const importStudentsFromPDF = asyncHandler(async (req, res) => {
  const result = await studentImportService.importStudentsFromPDF(req.file);

  return res.status(200).json({
    success: true,
    message: "Students imported successfully from PDF.",
    data: result,
  });
});

module.exports = Object.freeze({
  importStudents,
  getAllStudents,
  getStudentByEnrollment,
  updateStudent,
  deleteStudent,
  importStudentsFromPDF,
});
