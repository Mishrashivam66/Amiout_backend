"use strict";

const asyncHandler = require("express-async-handler");

const dashboardService = require("../services/dashboardService");

// ============================================================
// GET STUDENT DASHBOARD
// GET /student/dashboard
// ============================================================

const getDashboard = asyncHandler(async (req, res) => {
  const studentId = req.user?._id || req.user?.id;

  if (!studentId) {
    return res.status(401).json({
      success: false,
      message: "Student authentication required.",
    });
  }

  const dashboard = await dashboardService.getDashboard(studentId);

  return res.status(200).json({
    success: true,
    message: "Dashboard fetched successfully.",
    data: dashboard,
  });
});

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  getDashboard,
};
