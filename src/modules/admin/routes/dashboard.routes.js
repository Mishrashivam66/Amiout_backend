"use strict";

const express = require("express");

const dashboardController = require("../controllers/dashboard.controller");

const outpassController = require("../controllers/outpass.controller");

const { protect } = require("../../../middlewares/auth.middleware");

const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

const router = express.Router();

// ============================================================
// AMIOUT ENTERPRISE - ADMIN DASHBOARD ROUTES
//
// All endpoints require authenticated ADMIN access.
// Existing Outpass endpoint is preserved.
// ============================================================

// ============================================================
// MAIN DASHBOARD
// GET /api/v1/admin/dashboard
// ============================================================

router.get(
  "/",
  protect,
  authorize(ROLES.ADMIN),
  dashboardController.getDashboard,
);

// ============================================================
// MONTHLY ANALYTICS
// GET /api/v1/admin/dashboard/analytics
// ============================================================

router.get(
  "/analytics",
  protect,
  authorize(ROLES.ADMIN),
  dashboardController.getAnalytics,
);

// ============================================================
// RECENT REAL OUTPASS UPDATES
// GET /api/v1/admin/dashboard/recent-activities
// ============================================================

router.get(
  "/recent-activities",
  protect,
  authorize(ROLES.ADMIN),
  dashboardController.getRecentActivities,
);

// ============================================================
// DASHBOARD SUMMARY
// GET /api/v1/admin/dashboard/summary
// ============================================================

router.get(
  "/summary",
  protect,
  authorize(ROLES.ADMIN),
  dashboardController.getSummary,
);

// ============================================================
// EXISTING OUTPASS MONITORING
// GET /api/v1/admin/dashboard/outpasses
// ============================================================

router.get(
  "/outpasses",
  protect,
  authorize(ROLES.ADMIN),
  outpassController.getAllOutpasses,
);

module.exports = Object.freeze(router);
