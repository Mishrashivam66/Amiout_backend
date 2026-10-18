"use strict";

const asyncHandler = require("express-async-handler");

const mentorDashboardService = require("../services/mentorDashboardService");

const outpassService = require("../../outpass/services");
const coordinatorOutpassService = require("../services/coordinatorOutpassService");
// ============================================================
// HELPERS
// ============================================================
const {
  approveOutpassForRole,
} = require("../../outpass/services/sharedApprovalService");

const facultyScopeOutpassService = require("../services/facultyScopeOutpassService");

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
  const facultyId = getFacultyId(req);

  if (!facultyId) {
    return res.status(401).json({
      success: false,
      message: "Faculty authentication required.",
    });
  }

  const availabilityStatus = String(req.body?.availabilityStatus || "")
    .trim()
    .toUpperCase();

  if (!["AVAILABLE", "UNAVAILABLE"].includes(availabilityStatus)) {
    return res.status(400).json({
      success: false,
      message: "Invalid availability status.",
    });
  }

  const result = await mentorDashboardService.updateAvailability(
    facultyId,
    availabilityStatus,
  );

  return res.status(result?.success ? 200 : 400).json(result);
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
const getCoordinatorPendingRequests = asyncHandler(async (req, res) => {
  const result = await coordinatorOutpassService.getCoordinatorPendingRequests(
    getFacultyId(req),
    req.query.page,
    req.query.limit,
    req.query.search,
  );

  return sendServiceResult(res, result);
});

const getCoordinatorHistory = asyncHandler(async (req, res) => {
  const result = await coordinatorOutpassService.getCoordinatorHistory(
    getFacultyId(req),
    req.query.page,
    req.query.limit,
    req.query.search,
  );

  return sendServiceResult(res, result);
});

const getCoordinatorOutpassDetails = asyncHandler(async (req, res) => {
  const result = await coordinatorOutpassService.getCoordinatorOutpassDetails(
    getFacultyId(req),
    req.params.outpassId,
  );

  return sendServiceResult(res, result, 404);
});

const approveAsHOD = asyncHandler(async (req, res) => {
  const result = await approveOutpassForRole(
    getFacultyId(req),
    req.params.outpassId,
    typeof req.body?.remark === "string" ? req.body.remark.trim() : "",
    "HOD",
  );

  return sendServiceResult(res, result, 400);
});

const approveAsHOI = asyncHandler(async (req, res) => {
  const result = await approveOutpassForRole(
    getFacultyId(req),
    req.params.outpassId,
    typeof req.body?.remark === "string" ? req.body.remark.trim() : "",
    "HOI",
  );

  return sendServiceResult(res, result, 400);
});

const getHODOutpasses = asyncHandler(async (req, res) => {
  const result = await facultyScopeOutpassService.listOutpasses(
    getFacultyId(req),
    "HOD",
    req.query,
  );

  return sendServiceResult(res, result);
});

const getHOIOutpasses = asyncHandler(async (req, res) => {
  const result = await facultyScopeOutpassService.listOutpasses(
    getFacultyId(req),
    "HOI",
    req.query,
  );

  return sendServiceResult(res, result);
});

const getHODOutpassDetails = asyncHandler(async (req, res) => {
  const result = await facultyScopeOutpassService.getOutpassDetails(
    getFacultyId(req),
    "HOD",
    req.params.outpassId,
  );

  return sendServiceResult(res, result, 404);
});

const getHOIOutpassDetails = asyncHandler(async (req, res) => {
  const result = await facultyScopeOutpassService.getOutpassDetails(
    getFacultyId(req),
    "HOI",
    req.params.outpassId,
  );

  return sendServiceResult(res, result, 404);
});

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
  getCoordinatorPendingRequests,
  getCoordinatorHistory,
  getCoordinatorOutpassDetails,

  // Faculty profile
  getProfile,
  updateProfile,
  updateAvailability,
  approveAsHOD,
  approveAsHOI,
  getHODOutpasses,
  getHOIOutpasses,
  getHODOutpassDetails,
  getHOIOutpassDetails,
});
