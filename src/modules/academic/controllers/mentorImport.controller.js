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

    if (!workbook.SheetNames.length) {
      return res.status(400).json({
        success: false,
        message: "Excel workbook contains no sheets.",
      });
    }

    console.log("\n========== EXCEL STRUCTURE ==========");

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];

      const matrix = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
        blankrows: true,
      });

      console.log("SHEET:", sheetName);
      console.log("TOTAL ROWS:", matrix.length);

      matrix.slice(0, 20).forEach((row, index) => {
        console.log(`ROW ${index + 1}:`, JSON.stringify(row));
      });
    }

    console.log("=====================================\n");

    // ======================================
    // NORMALIZE EXCEL HEADERS
    // ======================================

    const normalizeHeader = (value) =>
      String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    const facultyIdHeaders = ["facultyid", "employeeid", "mentorid"];

    const facultyNameHeaders = ["facultyname", "mentorname", "name"];

    const facultyEmailHeaders = [
      "facultyofficialemail",
      "facultyemail",
      "mentoremail",
      "officialemail",
      "email",
    ];

    // ======================================
    // AUTO DETECT SHEET AND HEADER ROW
    // ======================================

    let detectedSheet = null;
    let detectedHeaderRow = -1;
    let rows = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet || !worksheet["!ref"]) {
        continue;
      }

      const matrix = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
        blankrows: false,
      });

      const headerIndex = matrix.findIndex((row) => {
        const headers = row.map(normalizeHeader);

        const hasFacultyId = facultyIdHeaders.some((key) =>
          headers.includes(key),
        );

        const hasFacultyName = facultyNameHeaders.some((key) =>
          headers.includes(key),
        );

        const hasFacultyEmail = facultyEmailHeaders.some((key) =>
          headers.includes(key),
        );

        return hasFacultyId && hasFacultyName && hasFacultyEmail;
      });

      if (headerIndex === -1) {
        continue;
      }

      // Convert matrix row index to actual
      // worksheet row index.
      const sheetRange = XLSX.utils.decode_range(worksheet["!ref"]);

      const actualHeaderRow = sheetRange.s.r + headerIndex;

      rows = XLSX.utils.sheet_to_json(worksheet, {
        range: actualHeaderRow,
        defval: "",
        raw: false,
        blankrows: false,
      });

      detectedSheet = sheetName;
      detectedHeaderRow = actualHeaderRow + 1;

      break;
    }

    if (!detectedSheet) {
      return res.status(400).json({
        success: false,
        message:
          "Faculty headers not found. Excel must contain Faculty ID, Faculty Name and Faculty Official Email columns.",
      });
    }

    // ======================================
    // REMOVE COMPLETELY EMPTY ROWS
    // ======================================

    rows = rows.filter((row) =>
      Object.values(row).some((value) => String(value ?? "").trim() !== ""),
    );

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No faculty records found below the Excel header row.",
      });
    }

    // ======================================
    // MAP EXCEL DATA
    // ======================================

    records = mapMentorRows(rows);

    console.log("FACULTY SHEET:", detectedSheet);

    console.log("FACULTY HEADER ROW:", detectedHeaderRow);

    console.log("FACULTY RECORDS:", records.length);

    console.log("MAPPED FIRST RECORD:", JSON.stringify(records[0], null, 2));
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

  console.log("FACULTY IMPORT RESULT:", JSON.stringify(result, null, 2));

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
