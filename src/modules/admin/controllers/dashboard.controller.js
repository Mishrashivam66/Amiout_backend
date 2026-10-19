"use strict";

const asyncHandler = require("express-async-handler");

const dashboardService = require("../services/dashboard.service");

// ============================================================
// AMIOUT ENTERPRISE - ADMIN DASHBOARD CONTROLLER
//
// Authorized through dashboard.routes.js
// ============================================================

// ============================================================
// GET /api/v1/admin/dashboard
// ============================================================

const getDashboard = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const dashboard = await dashboardService.getDashboard();

  return res.status(200).json({
    success: true,
    message: "Dashboard statistics fetched successfully.",
    data: dashboard,
  });
});

// ============================================================
// GET /api/v1/admin/dashboard/analytics
// ============================================================

const getAnalytics = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const analytics = await dashboardService.getAnalytics();

  return res.status(200).json({
    success: true,
    message: "Dashboard analytics fetched successfully.",
    data: analytics,
  });
});

// ============================================================
// GET /api/v1/admin/dashboard/recent-activities
// ============================================================

const getRecentActivities = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const activities = await dashboardService.getRecentActivities(8);

  return res.status(200).json({
    success: true,
    message: "Recent outpass updates fetched successfully.",
    data: activities,
  });
});

// ============================================================
// GET /api/v1/admin/dashboard/summary
// ============================================================

const getSummary = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const summary = await dashboardService.getSummary();

  return res.status(200).json({
    success: true,
    message: "Dashboard summary fetched successfully.",
    data: summary,
  });
});

module.exports = Object.freeze({
  getDashboard,
  getAnalytics,
  getRecentActivities,
  getSummary,
});
