const asyncHandler = require("express-async-handler");

const dashboardService = require("../services/dashboard.service");

// ============================================================================
// Get Dashboard Statistics
// ============================================================================
const getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await dashboardService.getDashboard();

  return res.status(200).json({
    success: true,
    message: "Dashboard statistics fetched successfully.",
    data: dashboard,
  });
});

module.exports = Object.freeze({
  getDashboard,
});
