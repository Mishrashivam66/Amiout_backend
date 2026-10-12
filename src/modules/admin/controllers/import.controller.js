"use strict";

const asyncHandler = require("express-async-handler");

const studentImportService = require("../../academic/services/studentImport.service");

const mentorImportService = require("../../academic/services/mentorImport.service");

const groupService = require("../../academic/services/group.service");

const importEngineService = require("../services/import.service");

const pdfImportService = require("../services/pdfImport.service");

const { mapMentorRows } = require("../../academic/utils/mentorExcelMapper");

// ============================================================
// Import Students
// ============================================================

const importStudents = asyncHandler(async (req, res) => {
  // ----------------------------------------------------------
  // Validate Uploaded File
  // ----------------------------------------------------------

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Please upload a student Excel file.",
    });
  }

  // ----------------------------------------------------------
  // Parse And Validate Excel
  // ----------------------------------------------------------

  const importResult = await importEngineService.processImport({
    file: req.file,

    importType: "STUDENT",

    // Matches AMIOUT Student Bulk Upload Template.
    // Batch is generated later by studentExcelMapper.js.
    requiredColumns: [
      "enrollment number",
      "roll number",
      "student name",
      "admission year",
      "passing year",
      "semester",
      "section",
    ],

    uniqueField: "enrollment number",

    importedBy: req.user._id,

    ipAddress: req.ip,

    userAgent: req.get("user-agent"),
  });

  // ----------------------------------------------------------
  // Debug Validation Results
  // ----------------------------------------------------------

  console.log("================================");
  console.log("STUDENT IMPORT VALIDATION");
  console.log(importResult.summary);

  console.log("VALID RECORDS:");
  console.log(importResult.validRecords?.length || 0);

  console.log("VALIDATION ERRORS:");
  console.log(importResult.validationErrors?.slice(0, 10));

  // ----------------------------------------------------------
  // Handle Empty / Invalid Excel Records
  // ----------------------------------------------------------

  if (
    !Array.isArray(importResult.validRecords) ||
    importResult.validRecords.length === 0
  ) {
    return res.status(422).json({
      success: false,

      message:
        "No valid student records found. Please check the Excel template.",

      data: {
        summary: importResult.summary,

        validationErrors: importResult.validationErrors,

        duplicates: importResult.duplicates,

        historyId: importResult.historyId,
      },
    });
  }

  // ----------------------------------------------------------
  // Save Students To Student Master
  // ----------------------------------------------------------

  const studentResult = await studentImportService.importStudents(
    importResult.validRecords,
  );
  console.log("========== FINAL STUDENT IMPORT RESULT ==========");

  console.log(JSON.stringify(studentResult, null, 2));
  // ----------------------------------------------------------
  // Return Import Results
  // ----------------------------------------------------------

  return res.status(201).json({
    success: true,

    message:
      studentResult.imported > 0
        ? "Student import completed successfully."
        : "Student import completed. No new students were inserted.",

    data: {
      summary: studentResult.summary,

      preview: importResult.preview,

      validationErrors: importResult.validationErrors,

      duplicateStudents: studentResult.duplicateStudents,

      failedStudents: studentResult.failedStudents,

      historyId: importResult.historyId,

      processingTime: importResult.processingTime,

      imported: studentResult.imported,

      duplicates: studentResult.duplicates,

      failed: studentResult.failed,
    },
  });
});

// ============================================================
// Import Mentors
// ============================================================

const importMentors = asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a mentor Excel file.",
      });
    }

    const importResult = await importEngineService.processImport({
      file: req.file,

      importType: "MENTOR",

      requiredColumns: [
        "course name",
        "semester",
        "group (as per amizone)",
        "name of mentor",
      ],

      uniqueField: "",

      importedBy: req.user._id,

      ipAddress: req.ip,

      userAgent: req.get("user-agent"),
    });

    if (
      !Array.isArray(importResult.validRecords) ||
      importResult.validRecords.length === 0
    ) {
      return res.status(422).json({
        success: false,
        message: "No valid mentor records found in Excel.",
        data: {
          summary: importResult.summary,
          validationErrors: importResult.validationErrors,
          historyId: importResult.historyId,
        },
      });
    }

    // Convert Excel fields into Mentor Master fields.
    const mappedRows = mapMentorRows(importResult.validRecords);

    const mentorResult = await mentorImportService.importMentors(mappedRows);

    return res.status(201).json({
      success: true,
      message: "Mentors imported successfully.",
      data: mentorResult,
    });
  } catch (error) {
    console.error("Mentor Import Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ============================================================
// Import Groups
// ============================================================

const importGroups = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Please upload a group Excel file.",
    });
  }

  const importResult = await importEngineService.processImport({
    file: req.file,

    importType: "GROUP",

    requiredColumns: ["group id", "name", "description"],

    uniqueField: "group id",

    importedBy: req.user._id,

    ipAddress: req.ip,

    userAgent: req.get("user-agent"),
  });

  if (
    !Array.isArray(importResult.validRecords) ||
    importResult.validRecords.length === 0
  ) {
    return res.status(422).json({
      success: false,
      message: "No valid group records found in Excel.",
      data: {
        summary: importResult.summary,
        validationErrors: importResult.validationErrors,
        historyId: importResult.historyId,
      },
    });
  }

  const result = await groupService.importGroups(importResult.validRecords);

  return res.status(201).json({
    success: true,
    message: "Groups imported successfully.",
    data: result,
  });
});

// ============================================================
// Download Student Template
// ============================================================

const downloadStudentTemplate = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Student import template download endpoint.",
  });
});

// ============================================================
// Download Mentor Template
// ============================================================

const downloadMentorTemplate = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Mentor import template download endpoint.",
  });
});

// ============================================================
// Download Group Template
// ============================================================

const downloadGroupTemplate = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Group import template download endpoint.",
  });
});

// ============================================================
// Get Import History
// ============================================================

const getImportHistory = asyncHandler(async (req, res) => {
  const history = await importEngineService.getImportHistory();

  return res.status(200).json({
    success: true,
    message: "Import history fetched successfully.",
    data: history,
  });
});

// ============================================================
// Get Import History By ID
// ============================================================

const getImportHistoryById = asyncHandler(async (req, res) => {
  const history = await importEngineService.getImportHistoryById(req.params.id);

  if (!history) {
    return res.status(404).json({
      success: false,
      message: "Import history not found.",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Import history fetched successfully.",
    data: history,
  });
});

// ============================================================
// Import Students From PDF
// ============================================================

const importStudentsFromPDF = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Please upload a student PDF file.",
    });
  }

  try {
    const result = await pdfImportService.importStudentsFromPDF(req.file);

    return res.status(201).json({
      success: true,
      message: "Students imported successfully from PDF.",
      data: result,
    });
  } catch (error) {
    console.error("PDF Import Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ============================================================
// Export Controllers
// ============================================================

module.exports = Object.freeze({
  importStudents,
  importMentors,
  importGroups,
  importStudentsFromPDF,
  getImportHistory,
  getImportHistoryById,
  downloadStudentTemplate,
  downloadMentorTemplate,
  downloadGroupTemplate,
});
