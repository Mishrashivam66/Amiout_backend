"use strict";

const express = require("express");

const dashboardRoutes = require("./routes/dashboard.routes");
const userRoutes = require("./routes/user.routes");
const importRoutes = require("./routes/import.routes");
const reportRoutes = require("./routes/report.routes");
const outpassRoutes = require("./routes/outpass.routes");

const router = express.Router();

// ============================================================================
// Admin Dashboard
// ============================================================================
router.use("/dashboard", dashboardRoutes);

// ============================================================================
// User Management
// ============================================================================
router.use("/users", userRoutes);

// ============================================================================
// Import Management
// ============================================================================
router.use("/import", importRoutes);

// ============================================================================
// Reports
// ============================================================================
router.use("/reports", reportRoutes);

// ============================================================================
// Outpass Management
// ============================================================================
router.use("/outpasses", outpassRoutes);

module.exports = Object.freeze(router);
