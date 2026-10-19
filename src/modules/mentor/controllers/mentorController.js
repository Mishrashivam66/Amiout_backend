"use strict";

const asyncHandler = require("express-async-handler");

const mentorDashboardService = require("../services/mentorDashboardService");

const outpassService = require("../../outpass/services");

const coordinatorOutpassService = require("../services/coordinatorOutpassService");

const {
  approveOutpassForRole,
} = require("../../outpass/services/sharedApprovalService");

const facultyScopeOutpassService = require("../services/facultyScopeOutpassService");

// ============================================================
// COMMON HELPERS
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
// MENTOR PENDING REQUESTS
// ============================================================

const getPendingRequests = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.getPendingRequests(
    getFacultyId(req),
    Number(req.query.page) || 1,
    Number(req.query.limit) || 10,
    req.query.search || "",
  );

  return res.status(200).json(result);
});

// ============================================================
// MENTOR APPROVED REQUESTS
// ============================================================

const getApprovedRequests = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.getApprovedRequests(
    getFacultyId(req),
    Number(req.query.page) || 1,
    Number(req.query.limit) || 10,
  );

  return res.status(200).json(result);
});

// ============================================================
// MENTOR REJECTED REQUESTS
// ============================================================

const getRejectedRequests = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.getRejectedRequests(
    getFacultyId(req),
    Number(req.query.page) || 1,
    Number(req.query.limit) || 10,
  );

  return res.status(200).json(result);
});

// ============================================================
// COMMON AUTHORIZED APPROVAL HANDLER
//
// Role comes from the protected backend route.
// Never accept an arbitrary role from req.body.
// ============================================================

const approveForRole = (role) =>
  asyncHandler(async (req, res) => {
    const facultyId = getFacultyId(req);

    if (!facultyId) {
      return res.status(401).json({
        success: false,
        message: "Faculty authentication required.",
      });
    }

    const remark =
      typeof req.body?.remark === "string" ? req.body.remark.trim() : "";

    const result = await approveOutpassForRole(
      facultyId,
      req.params.outpassId,
      remark,
      role,
    );

    return sendServiceResult(res, result, 400);
  });

// ============================================================
// MENTOR APPROVAL
//
// Handles mapped Primary / Backup Mentor.
// The shared service checks assignment and scope.
// ============================================================

const approveOutpass = approveForRole("MENTOR");

// ============================================================
// COORDINATOR APPROVAL
//
// Coordinator can directly approve requests
// belonging to their authorized section.
// ============================================================

const approveAsCoordinator = approveForRole("COORDINATOR");

// ============================================================
// HOD APPROVAL
//
// HOD can directly approve requests belonging
// to their authorized department.
// ============================================================

const approveAsHOD = approveForRole("HOD");

// ============================================================
// HOI APPROVAL
//
// HOI can directly approve requests belonging
// to their authorized institute.
// ============================================================

const approveAsHOI = approveForRole("HOI");

// ============================================================
// REJECT OUTPASS
//
// Existing rejection service preserved for now.
// Separate role-scoped rejection review is needed.
// ============================================================

const rejectOutpass = asyncHandler(async (req, res) => {
  const result = await outpassService.rejectOutpass(
    getFacultyId(req),
    req.params.outpassId,
    req.body?.remark || "",
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
  const result = await mentorDashboardService.getHistory(
    getFacultyId(req),
    Number(req.query.page) || 1,
    Number(req.query.limit) || 10,
    req.query.search || "",
  );

  return res.status(200).json(result);
});

// ============================================================
// MENTOR OUTPASS DETAILS
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
// ============================================================

const unlockStudent = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.unlockStudent(
    getFacultyId(req),
    req.params.studentId,
  );

  return sendServiceResult(res, result, 400);
});

// ============================================================
// UPDATE PROFILE
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
//
// Existing faculty availability service preserved.
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
// FACULTY PROFILE
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
// COORDINATOR PENDING REQUESTS
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

// ============================================================
// COORDINATOR HISTORY
// ============================================================

const getCoordinatorHistory = asyncHandler(async (req, res) => {
  const result = await coordinatorOutpassService.getCoordinatorHistory(
    getFacultyId(req),
    req.query.page,
    req.query.limit,
    req.query.search,
  );

  return sendServiceResult(res, result);
});

// ============================================================
// COORDINATOR OUTPASS DETAILS
// ============================================================

const getCoordinatorOutpassDetails = asyncHandler(async (req, res) => {
  const result = await coordinatorOutpassService.getCoordinatorOutpassDetails(
    getFacultyId(req),
    req.params.outpassId,
  );

  return sendServiceResult(res, result, 404);
});

// ============================================================
// HOD - ALL DEPARTMENT OUTPASSES
// ============================================================

const getHODOutpasses = asyncHandler(async (req, res) => {
  const result = await facultyScopeOutpassService.listOutpasses(
    getFacultyId(req),
    "HOD",
    req.query,
  );

  return sendServiceResult(res, result);
});

// ============================================================
// HOI - ALL INSTITUTE OUTPASSES
// ============================================================

const getHOIOutpasses = asyncHandler(async (req, res) => {
  const result = await facultyScopeOutpassService.listOutpasses(
    getFacultyId(req),
    "HOI",
    req.query,
  );

  return sendServiceResult(res, result);
});

// ============================================================
// HOD OUTPASS DETAILS
// ============================================================

const getHODOutpassDetails = asyncHandler(async (req, res) => {
  const result = await facultyScopeOutpassService.getOutpassDetails(
    getFacultyId(req),
    "HOD",
    req.params.outpassId,
  );

  return sendServiceResult(res, result, 404);
});

// ============================================================
// HOI OUTPASS DETAILS
// ============================================================

const getHOIOutpassDetails = asyncHandler(async (req, res) => {
  const result = await facultyScopeOutpassService.getOutpassDetails(
    getFacultyId(req),
    "HOI",
    req.params.outpassId,
  );

  return sendServiceResult(res, result, 404);
});

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  // Dashboards
  getDashboard,
  getCoordinatorDashboard,

  // Outpass lists
  getPendingRequests,
  getApprovedRequests,
  getRejectedRequests,

  // Faculty approvals
  approveOutpass,
  approveAsCoordinator,
  approveAsHOD,
  approveAsHOI,

  // Rejection
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

  // Profile
  getProfile,
  updateProfile,
  updateAvailability,

  // HOD/HOI monitoring
  getHODOutpasses,
  getHOIOutpasses,
  getHODOutpassDetails,
  getHOIOutpassDetails,
});
