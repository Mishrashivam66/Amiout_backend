"use strict";

const express = require("express");
const router = express.Router();

const outpassRoutes = require("./outpassRoutes");
const securityRoutes = require("./securityRoutes");
const parentApprovalRoutes = require("./parentApprovalRoutes");

// 1. Parent approval routes
// Public access through secure, expiring, single-use tokens.
router.use("/parent", parentApprovalRoutes);

// 2. Security Guard routes
// Must have their own SECURITY authentication and authorization.
router.use("/security", securityRoutes);

// 3. Student routes
// Keep last because student router uses "/" and auth middleware.
router.use("/", outpassRoutes);

module.exports = router;
