"use strict";

const asyncHandler = require("express-async-handler");

// ============================================================
// SERVICES
// ============================================================

const studentImportService = require("../../academic/services/studentImport.service");

const mentorImportService = require("../../academic/services/mentorImport.service");

const groupService = require("../../academic/services/group.service");

const importEngineService = require("../services/import.service");

const pdfImportService = require("../services/pdfImport.service");

const { mapMentorRows } = require("../../academic/utils/mentorExcelMapper");

// ============================================================
// IMPORT STUDENTS
// ============================================================

const importStudents = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Please upload a student Excel file.",
    });
  }

  const importResult = await importEngineService.processImport({
    file: req.file,
    importType: "STUDENT",

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

  const studentResult = await studentImportService.importStudents(
    importResult.validRecords,
  );

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
// IMPORT FACULTY / MENTORS
// ============================================================

const importMentors = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,

      message: "Please upload a Faculty Excel file.",
    });
  }

  // ========================================================
  // PARSE AND VALIDATE EXCEL
  // ========================================================

  // IMPORTANT:
  // Do not globally require Course, Semester,
  // Section or Group here.
  //
  // HOD/HOI records may legitimately leave
  // those fields blank.
  //
  // Faculty identity and role-specific academic
  // validation run in mentorImport.service.js.

  const importResult = await importEngineService.processImport({
    file: req.file,

    importType: "MENTOR",

    requiredColumns: [],

    uniqueField: "",

    importedBy: req.user._id,
    ipAddress: req.ip,

    userAgent: req.get("user-agent"),
  });

  // ========================================================
  // CHECK VALID ROWS
  // ========================================================

  if (
    !Array.isArray(importResult.validRecords) ||
    importResult.validRecords.length === 0
  ) {
    return res.status(422).json({
      success: false,

      message: "No faculty records found in Excel.",

      data: {
        summary: importResult.summary,

        validationErrors: importResult.validationErrors,

        historyId: importResult.historyId,
      },
    });
  }

  // ========================================================
  // MAP EXCEL HEADERS
  // ========================================================

  const mappedRows = mapMentorRows(importResult.validRecords);

  // ========================================================
  // SAVE FACULTY RECORDS
  // ========================================================

  const mentorResult = await mentorImportService.importMentors(mappedRows);

  const summary = mentorResult.summary;

  const acceptedRecords =
    summary.importedRecords + summary.updatedRecords + summary.duplicateRecords;

  // ========================================================
  // HANDLE ALL FAILED ROWS
  // ========================================================

  if (acceptedRecords === 0) {
    return res.status(422).json({
      success: false,

      message: "Faculty import failed. Please review row validation errors.",

      data: {
        ...mentorResult,

        historyId: importResult.historyId,
      },
    });
  }

  // ========================================================
  // SUCCESS / PARTIAL SUCCESS
  // ========================================================

  return res.status(201).json({
    success: mentorResult.success,

    message: mentorResult.success
      ? "Faculty import completed successfully."
      : "Faculty import completed with some errors. Please review the report.",

    data: {
      ...mentorResult,

      historyId: importResult.historyId,

      processingTime: importResult.processingTime,
    },
  });
});

// ============================================================
// IMPORT GROUPS
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
// DOWNLOAD STUDENT TEMPLATE
// ============================================================

const downloadStudentTemplate = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,

    message: "Student import template download endpoint.",
  });
});

// ============================================================
// DOWNLOAD MENTOR TEMPLATE
// ============================================================

const downloadMentorTemplate = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,

    message: "Mentor import template download endpoint.",
  });
});

// ============================================================
// DOWNLOAD GROUP TEMPLATE
// ============================================================

const downloadGroupTemplate = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,

    message: "Group import template download endpoint.",
  });
});

// ============================================================
// GET IMPORT HISTORY
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
// GET IMPORT HISTORY BY ID
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
// IMPORT STUDENTS FROM PDF
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
// EXPORT CONTROLLERS
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
