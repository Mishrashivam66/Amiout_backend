const asyncHandler = require("express-async-handler");

const mentorDashboardService = require("../services/mentorDashboardService");

const outpassService = require("../../outpass/services");

// ============================================================================
// Mentor Dashboard
// ============================================================================
const getDashboard = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.getDashboard(req.user.id);

  return res.status(200).json(result);
});

// ============================================================================
// Pending Requests
// ============================================================================
const getPendingRequests = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const search = req.query.search || "";

  const result = await mentorDashboardService.getPendingRequests(
    req.user.id,
    page,
    limit,
    search,
  );

  return res.status(200).json(result);
});

// ============================================================================
// Approved Requests
// ============================================================================
const getApprovedRequests = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;

  const limit = Number(req.query.limit) || 10;

  const result = await mentorDashboardService.getApprovedRequests(
    req.user.id,
    page,
    limit,
  );

  return res.status(200).json(result);
});

// ============================================================================
// Rejected Requests
// ============================================================================
const getRejectedRequests = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;

  const limit = Number(req.query.limit) || 10;

  const result = await mentorDashboardService.getRejectedRequests(
    req.user.id,
    page,
    limit,
  );

  return res.status(200).json(result);
});

// ============================================================================
// Approve Outpass
// ============================================================================
const approveOutpass = asyncHandler(async (req, res) => {
  const result = await outpassService.approveOutpass(
    req.user.id,
    req.params.outpassId,
    req.body.remark,
  );

  const statusCode = result.success ? 200 : 400;

  return res.status(statusCode).json(result);
});

// ============================================================================
// Reject Outpass
// ============================================================================
const rejectOutpass = asyncHandler(async (req, res) => {
  const result = await outpassService.rejectOutpass(
    req.user.id,
    req.params.outpassId,
    req.body.remark,
  );

  const statusCode = result.success ? 200 : 400;

  return res.status(statusCode).json(result);
});
const getStudents = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.getStudents(req.user.id);

  return res.status(200).json(result);
});
const getStudentDetails = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.getStudentDetails(
    req.user.id,
    req.params.studentId,
  );

  return res.status(200).json(result);
});
// ============================================================================
// Export Controller
// ============================================================================
const getHistory = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const search = req.query.search || "";

  const result = await mentorDashboardService.getHistory(
    req.user.id,
    page,
    limit,
    search,
  );

  return res.status(200).json(result);
});
// ============================================================================
// Outpass Details
// ============================================================================

const getOutpassDetails = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.getOutpassDetails(
    req.user.id,
    req.params.outpassId,
  );

  return res.status(200).json(result);
});

// ============================================================================
// Unlock Student Profile
// ============================================================================
const unlockStudent = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.unlockStudent(
    req.user.id,
    req.params.studentId,
  );

  const statusCode = result.success ? 200 : 400;

  return res.status(statusCode).json(result);
});

const updateProfile = async (req, res, next) => {
  try {
    const result = await mentorDashboardService.updateProfile(
      req.user.id,
      req.body,
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("FULL ERROR:", err);
    console.error(err.stack);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ============================================================================
// Update Mentor Availability
// ============================================================================

const updateAvailability = asyncHandler(async (req, res) => {
  const result = await mentorDashboardService.updateAvailability(
    req.user.id,
    req.body.availabilityStatus,
  );

  return res.status(result.success ? 200 : 400).json(result);
});
module.exports = Object.freeze({
  getDashboard,
  getPendingRequests,
  getApprovedRequests,
  getRejectedRequests,
  approveOutpass,
  rejectOutpass,
  getStudents,
  getStudentDetails,
  getHistory,
  getOutpassDetails,
  unlockStudent,
  updateProfile,
  updateAvailability,
});
