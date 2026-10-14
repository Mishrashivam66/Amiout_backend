"use strict";

const asyncHandler = require("express-async-handler");

const mentorDashboardService = require("../services/mentorDashboardService");

const outpassService = require("../../outpass/services");

// ============================================================
// HELPERS
// ============================================================

const getFacultyId = (req) => req.user?._id || req.user?.id;

const sendServiceResult = (res, result, failureStatus = 403) => {
  return res.status(result?.success ? 200 : failureStatus).json(result);
};

// ============================================================
// MENTOR DASHBOARD
// ============================================================

const getDashboard = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.getDashboard(getFacultyId(req));

  return sendServiceResult(res, result);
});

// ============================================================
// COORDINATOR DASHBOARD
// ============================================================

const getCoordinatorDashboard = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.getCoordinatorDashboard(
    getFacultyId(req),
  );

  return sendServiceResult(res, result);
});

// ============================================================
// MENTOR PENDING OUTPASSES
// ============================================================

const getPendingRequests = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const search = req.query.search || "";

  const result = await mentorDashboardService.getPendingRequests(
    getFacultyId(req),
    page,
    limit,
    search,
  );

  return res.status(200).json(result);
});

// ============================================================
// MENTOR APPROVED OUTPASSES
// ============================================================

const getApprovedRequests = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;

  const result = await mentorDashboardService.getApprovedRequests(
    getFacultyId(req),
    page,
    limit,
  );

  return res.status(200).json(result);
});

// ============================================================
// MENTOR REJECTED OUTPASSES
// ============================================================

const getRejectedRequests = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;

  const result = await mentorDashboardService.getRejectedRequests(
    getFacultyId(req),
    page,
    limit,
  );

  return res.status(200).json(result);
});

// ============================================================
// APPROVE OUTPASS
// Existing mentor approval logic preserved.
// ============================================================

const approveOutpass = asyncHandler(async (req, res) => {
  const result = await outpassService.approveOutpass(
    getFacultyId(req),
    req.params.outpassId,
    req.body.remark,
  );

  return sendServiceResult(res, result, 400);
});

// ============================================================
// REJECT OUTPASS
// Existing mentor rejection logic preserved.
// ============================================================

const rejectOutpass = asyncHandler(async (req, res) => {
  const result = await outpassService.rejectOutpass(
    getFacultyId(req),
    req.params.outpassId,
    req.body.remark,
  );

  return sendServiceResult(res, result, 400);
});

// ============================================================
// MENTOR STUDENTS
// ============================================================

const getStudents = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.getStudents(getFacultyId(req));

  return sendServiceResult(res, result);
});

// ============================================================
// COORDINATOR STUDENTS
// ============================================================

const getCoordinatorStudents = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.getCoordinatorStudents(
    getFacultyId(req),
  );

  return sendServiceResult(res, result);
});

// ============================================================
// STUDENT DETAILS
// ============================================================

const getStudentDetails = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.getStudentDetails(
    getFacultyId(req),
    req.params.studentId,
  );

  return res.status(200).json(result);
});

// ============================================================
// MENTOR HISTORY
// ============================================================

const getHistory = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const search = req.query.search || "";

  const result = await mentorDashboardService.getHistory(
    getFacultyId(req),
    page,
    limit,
    search,
  );

  return res.status(200).json(result);
});

// ============================================================
// OUTPASS DETAILS
// ============================================================

const getOutpassDetails = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.getOutpassDetails(
    getFacultyId(req),
    req.params.outpassId,
  );

  return res.status(200).json(result);
});

// ============================================================
// LEGACY UNLOCK STUDENT
// Preserved for existing integrations.
// ============================================================

const unlockStudent = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.unlockStudent(
    getFacultyId(req),
    req.params.studentId,
  );

  return sendServiceResult(res, result, 400);
});

// ============================================================
// LEGACY UPDATE PROFILE
// ============================================================

const updateProfile = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.updateProfile(
    getFacultyId(req),
    req.body,
  );

  return res.status(200).json({
    success: true,
    data: result,
  });
});

// ============================================================
// UPDATE FACULTY AVAILABILITY
// ============================================================

const updateAvailability = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.updateAvailability(
    getFacultyId(req),
    req.body.availabilityStatus,
  );

  return sendServiceResult(res, result, 400);
});

// ============================================================
// GET OFFICIAL FACULTY PROFILE
// ============================================================

const getProfile = asyncHandler(async (req, res) => {
  const facultyId = getFacultyId(req);

  if (!facultyId) {
    return res.status(401).json({
      success: false,
      message: "Faculty authentication required.",
    });
  }

  const result = await mentorDashboardService.getProfile(facultyId);

  return sendServiceResult(res, result, 404);
});

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  // Dashboards
  getDashboard,
  getCoordinatorDashboard,

  // Requests
  getPendingRequests,
  getApprovedRequests,
  getRejectedRequests,
  approveOutpass,
  rejectOutpass,

  // Students
  getStudents,
  getCoordinatorStudents,
  getStudentDetails,
  unlockStudent,

  // History and details
  getHistory,
  getOutpassDetails,

  // Faculty profile
  getProfile,
  updateProfile,
  updateAvailability,
});
