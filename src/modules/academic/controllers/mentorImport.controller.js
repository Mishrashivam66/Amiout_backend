"use strict";

const asyncHandler = require("express-async-handler");
const XLSX = require("xlsx");

const mentorImportService = require("../services/mentorImport.service");

// Adjust path if mapper is in another folder
const { mapMentorRows } = require("../utils/mentorExcelMapper");

// ==========================================
// IMPORT FACULTY / MENTORS
// ==========================================

const importMentors = asyncHandler(async (req, res) => {
  let records = [];

  // ======================================
  // EXCEL FILE UPLOAD
  // ======================================

  if (req.file) {
    const fileName = String(req.file.originalname || "").toLowerCase();

    if (!fileName.endsWith(".xlsx")) {
      return res.status(400).json({
        success: false,
        message: "Only .xlsx Excel files are supported.",
      });
    }

    if (!req.file.buffer) {
      return res.status(400).json({
        success: false,
        message:
          "Excel file buffer is missing. Configure Multer memoryStorage.",
      });
    }

    let workbook;

    try {
      workbook = XLSX.read(req.file.buffer, {
        type: "buffer",
        cellDates: false,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid or corrupted Excel file.",
      });
    }

    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      return res.status(400).json({
        success: false,
        message: "Excel workbook contains no sheets.",
      });
    }

    const worksheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      defval: "",
      raw: false,
      blankrows: false,
    });

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Excel sheet is empty.",
      });
    }

    records = mapMentorRows(rows);
  }

  // ======================================
  // EXISTING JSON IMPORT SUPPORT
  // ======================================
  else if (Array.isArray(req.body?.mentors)) {
    records = req.body.mentors;
  } else {
    return res.status(400).json({
      success: false,
      message: "Upload an Excel file or provide a mentors array.",
    });
  }

  // ======================================
  // IMPORT SERVICE
  // ======================================

  const result = await mentorImportService.importMentors(records);

  return res.status(result.summary?.failedRecords > 0 ? 207 : 201).json({
    success: result.success,
    message: result.message,
    data: result,
  });
});

// ==========================================
// GET ALL MENTORS
// ==========================================

const getAllMentors = asyncHandler(async (req, res) => {
  const mentors = await mentorImportService.getAllMentors();

  return res.status(200).json({
    success: true,
    count: mentors.length,
    data: mentors,
  });
});

// ==========================================
// GET MENTOR BY EMPLOYEE ID
// ==========================================

const getMentorByEmployeeId = asyncHandler(async (req, res) => {
  const mentor = await mentorImportService.getMentorByEmployeeId(
    req.params.employeeId,
  );

  return res.status(200).json({
    success: true,
    data: mentor,
  });
});

// ==========================================
// UPDATE MENTOR
// ==========================================

const updateMentor = asyncHandler(async (req, res) => {
  const mentor = await mentorImportService.updateMentor(
    req.params.id,
    req.body,
  );

  return res.status(200).json({
    success: true,
    message: "Mentor updated successfully.",
    data: mentor,
  });
});

// ==========================================
// DELETE MENTOR
// ==========================================

const deleteMentor = asyncHandler(async (req, res) => {
  await mentorImportService.deleteMentor(req.params.id);

  return res.status(200).json({
    success: true,
    message: "Mentor deleted successfully.",
  });
});

// ==========================================
// EXPORT
// ==========================================

module.exports = Object.freeze({
  importMentors,
  getAllMentors,
  getMentorByEmployeeId,
  updateMentor,
  deleteMentor,
});
