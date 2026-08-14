const asyncHandler = require("express-async-handler");

const outpassService = require("../services");

// ============================================================================
// Apply Outpass
// ============================================================================
const applyOutpass = asyncHandler(async (req, res) => {
  const result = await outpassService.applyOutpass(req.user.id, req.body);

  const statusCode = result.success ? 201 : 400;

  return res.status(statusCode).json(result);
});

// ============================================================================
// Get Student History
// ============================================================================
const getHistory = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;

  const limit = Number(req.query.limit) || 10;

  const result = await outpassService.getStudentHistory(
    req.user.id,
    page,
    limit,
  );

  return res.status(200).json(result);
});

// ============================================================================
// Get Active Outpass
// ============================================================================
const getActiveOutpass = asyncHandler(async (req, res) => {
  const result = await outpassService.getActiveOutpass(req.user.id);

  const statusCode = result.success ? 200 : 404;

  return res.status(statusCode).json(result);
});

// ============================================================================
// Get Outpass Details
// ============================================================================
const getOutpassDetails = asyncHandler(async (req, res) => {
  const result = await outpassService.getOutpassDetails(req.params.outpassId);

  const statusCode = result.success ? 200 : 404;

  return res.status(statusCode).json(result);
});

// ============================================================================
// Cancel Outpass
// ============================================================================
const cancelOutpass = asyncHandler(async (req, res) => {
  const result = await outpassService.cancelOutpass(
    req.user.id,
    req.params.outpassId,
  );

  const statusCode = result.success ? 200 : 400;

  return res.status(statusCode).json(result);
});

// ============================================================================
// Export Controller
// ============================================================================

module.exports = Object.freeze({
  applyOutpass,
  getHistory,
  getActiveOutpass,
  getOutpassDetails,
  cancelOutpass,
});
