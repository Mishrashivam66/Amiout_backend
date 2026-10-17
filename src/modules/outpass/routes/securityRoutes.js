"use strict";

const express = require("express");

const router = express.Router();

const {
  protect,
  requireRoles,
  requirePasswordSetupComplete,
} = require("../../../middlewares/auth.middleware");

const {
  previewOutpassController,
  verifyExitController,
  verifyEntryController,
} = require("../controllers/securityController");

// Require valid login.
router.use(protect);

// Require password setup.
router.use(requirePasswordSetupComplete);

// Only Security Guard.
router.use(requireRoles("SECURITY"));

// SCAN QR -> VIEW DETAILS ONLY.
router.post("/:id/preview", previewOutpassController);

// CONFIRM EXIT.
router.patch("/:id/verify-exit", verifyExitController);

// CONFIRM ENTRY.
router.patch("/:id/verify-entry", verifyEntryController);

module.exports = router;
