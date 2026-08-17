"use strict";

const asyncHandler = require("express-async-handler");

const studentImportService = require("../../academic/services/studentImport.service");
const mentorImportService = require("../../academic/services/mentorImport.service");
const groupService = require("../../academic/services/group.service");
const importEngineService = require("../services/import.service");

const pdfImportService = require("../services/pdfImport.service");
const { mapMentorRows } = require("../../academic/utils/mentorExcelMapper");
// ============================================================================
// Import Students
// ============================================================================
// ============================================================================
// Import Students
// ============================================================================

const importStudents = asyncHandler(async (req, res) => {
  // ============================================================================
  // Parse + Validate Excel
  // ============================================================================

  const importResult = await importEngineService.processImport({
    file: req.file,

    importType: "STUDENT",

    requiredColumns: [
      "enrollment number",
      "roll number",
      "student name",
      "batch",
      "semester",
      "section",
    ],

    uniqueField: "enrollment number",

    importedBy: req.user._id,

    ipAddress: req.ip,

    userAgent: req.get("user-agent"),
  });

  // ============================================================================
  // Save Students
  // ============================================================================

  const studentResult = await studentImportService.importStudents(
    importResult.validRecords,
  );

  // ============================================================================
  // Response
  // ============================================================================

  return res.status(201).json({
    success: true,

    message: "Students imported successfully.",

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
// ============================================================================
// Import Mentors
// ============================================================================

const importMentors = asyncHandler(async (req, res) => {
  console.log("=========== IMPORT MENTOR API HIT ===========");
  try {
    const importResult = await importEngineService.processImport({
      file: req.file,
      importType: "MENTOR",

      // Amity Excel Columns
      requiredColumns: [
        "course name",
        "semester",
        "group (as per amizone)",
        "name of mentor",
      ],

      // Employee ID Excel me nahi hai
      uniqueField: "",

      importedBy: req.user._id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    // Excel -> Internal Format
    const mappedRows = mapMentorRows(importResult.validRecords);

    const mentorResult = await mentorImportService.importMentors(mappedRows);

    return res.status(201).json({
      success: true,
      message: "Mentors imported successfully.",
      data: mentorResult,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});
// ============================================================================
// Import Groups
// ============================================================================
const importGroups = asyncHandler(async (req, res) => {
  const importResult = await importEngineService.processImport({
    file: req.file,

    importType: "GROUP",

    requiredColumns: ["group id", "name", "description"],

    uniqueField: "group id",

    importedBy: req.user._id,

    ipAddress: req.ip,

    userAgent: req.get("user-agent"),
  });

  const result = await groupService.importGroups(importResult.validRecords);

  return res.status(201).json({
    success: true,
    message: "Groups imported successfully.",
    data: result,
  });
});

// ============================================================================
// Download Student Template
// ============================================================================
const downloadStudentTemplate = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Student import template download endpoint.",
  });
});

// ============================================================================
// Download Mentor Template
// ============================================================================
const downloadMentorTemplate = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Mentor import template download endpoint.",
  });
});

// ============================================================================
// Download Group Template
// ============================================================================
const downloadGroupTemplate = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Group import template download endpoint.",
  });
});

// ============================================================================
// Get Import History
// ============================================================================

const getImportHistory = asyncHandler(async (req, res) => {
  const history = await importEngineService.getImportHistory();

  return res.status(200).json({
    success: true,
    message: "Import history fetched successfully.",
    data: history,
  });
});

// ============================================================================
// Get Import History By ID
// ============================================================================

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

// ============================================================================
// Import Students From PDF
// ============================================================================

const importStudentsFromPDF = asyncHandler(async (req, res) => {
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
