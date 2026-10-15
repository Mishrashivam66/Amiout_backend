"use strict";

const express = require("express");
const router = express.Router();

const {
  protect,
  requireRoles,
  requirePasswordSetupComplete,
} = require("../../../middlewares/auth.middleware");

const {
  verifyExitController,
  verifyEntryController,
} = require("../controllers/securityController");

// All routes require authenticated Security Guard.
router.use(protect);

// Temporary password must be changed first.
router.use(requirePasswordSetupComplete);

// Only SECURITY role can access these routes.
router.use(requireRoles("SECURITY"));

// QR-based EXIT verification.
router.patch("/:id/verify-exit", verifyExitController);

// QR-based ENTRY verification.
router.patch("/:id/verify-entry", verifyEntryController);

module.exports = router;
