"use strict";

const asyncHandler = require("express-async-handler");

const reportService = require("../services/report.service");


// ============================================================================
// Student Reports
// ============================================================================

const getStudentSummary = asyncHandler(async (req, res) => {
  const data = await reportService.getStudentSummary();

  return res.status(200).json({
    success: true,
    message: "Student summary fetched successfully.",
    data,
  });
});

const getStudentDetailedReport = asyncHandler(async (req, res) => {
  const data = await reportService.getStudentDetailedReport(req.query);

  return res.status(200).json({
    success: true,
    message: "Student report fetched successfully.",
    data,
  });
});

// ============================================================================
// Mentor Reports
// ============================================================================

const getMentorSummary = asyncHandler(async (req, res) => {
  const data = await reportService.getMentorSummary();

  return res.status(200).json({
    success: true,
    message: "Mentor summary fetched successfully.",
    data,
  });
});

const getMentorDetailedReport = asyncHandler(async (req, res) => {
  const data = await reportService.getMentorDetailedReport(req.query);

  return res.status(200).json({
    success: true,
    message: "Mentor report fetched successfully.",
    data,
  });
});

// ============================================================================
// Outpass Reports
// ============================================================================

const getOutpassSummary = asyncHandler(async (req, res) => {
  const data = await reportService.getOutpassSummary();

  return res.status(200).json({
    success: true,
    message: "Outpass summary fetched successfully.",
    data,
  });
});

const getOutpassStatusReport = asyncHandler(async (req, res) => {
  const data = await reportService.getOutpassStatusReport();

  return res.status(200).json({
    success: true,
    message: "Outpass status report fetched successfully.",
    data,
  });
});

const getOutpassDateRangeReport = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const data = await reportService.getOutpassDateRangeReport(
    startDate,
    endDate,
  );

  return res.status(200).json({
    success: true,
    message: "Date range report fetched successfully.",
    data,
  });
});

const getOutpassStudentReport = asyncHandler(async (req, res) => {
  const data = await reportService.getOutpassStudentReport();

  return res.status(200).json({
    success: true,
    message: "Student wise report fetched successfully.",
    data,
  });
});

const getOutpassMentorReport = asyncHandler(async (req, res) => {
  const data = await reportService.getOutpassMentorReport();

  return res.status(200).json({
    success: true,
    message: "Mentor wise report fetched successfully.",
    data,
  });
});

const getOutpassMonthlyReport = asyncHandler(async (req, res) => {
  const year = req.query.year;

  const data = await reportService.getOutpassMonthlyReport(year);

  return res.status(200).json({
    success: true,
    message: "Monthly report fetched successfully.",
    data,
  });
});

const getOutpassDetailedReport = asyncHandler(async (req, res) => {
  const data = await reportService.getOutpassDetailedReport(req.query);

  return res.status(200).json({
    success: true,
    message: "Detailed report fetched successfully.",
    data,
  });
});

// ============================================================================
// Security Reports
// ============================================================================

const getSecuritySummary = asyncHandler(async (req, res) => {
  const data = await reportService.getSecuritySummary();

  return res.status(200).json({
    success: true,
    message: "Security summary fetched successfully.",
    data,
  });
});

const getExitVerificationReport = asyncHandler(async (req, res) => {
  const data = await reportService.getExitVerificationReport();

  return res.status(200).json({
    success: true,
    message: "Exit verification report fetched successfully.",
    data,
  });
});

const getEntryVerificationReport = asyncHandler(async (req, res) => {
  const data = await reportService.getEntryVerificationReport();

  return res.status(200).json({
    success: true,
    message: "Entry verification report fetched successfully.",
    data,
  });
});

const getPendingVerificationReport = asyncHandler(async (req, res) => {
  const data = await reportService.getPendingVerificationReport();

  return res.status(200).json({
    success: true,
    message: "Pending verification report fetched successfully.",
    data,
  });
});

const getSecurityMonthlyReport = asyncHandler(async (req, res) => {
  const year = req.query.year;

  const data = await reportService.getSecurityMonthlyReport(year);

  return res.status(200).json({
    success: true,
    message: "Monthly security report fetched successfully.",
    data,
  });
});

const getSecurityDetailedReport = asyncHandler(async (req, res) => {
  const data = await reportService.getSecurityDetailedReport(req.query);

  return res.status(200).json({
    success: true,
    message: "Detailed security report fetched successfully.",
    data,
  });
});

module.exports = Object.freeze({
  getStudentSummary,
  getStudentDetailedReport,

  getMentorSummary,
  getMentorDetailedReport,

  getOutpassSummary,
  getOutpassStatusReport,
  getOutpassDateRangeReport,
  getOutpassStudentReport,
  getOutpassMentorReport,
  getOutpassMonthlyReport,
  getOutpassDetailedReport,

  getSecuritySummary,
  getExitVerificationReport,
  getEntryVerificationReport,
  getPendingVerificationReport,
  getSecurityMonthlyReport,
  getSecurityDetailedReport,
});
