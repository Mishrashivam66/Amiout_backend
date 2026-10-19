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

const {
  getSecurityProfile,
  getSecurityGateHistory,
} = require("../controllers/securityAccountController");

// ============================================================
// SECURITY AUTHENTICATION
// ============================================================

// Valid login required.
router.use(protect);

// First-login password setup required.
router.use(requirePasswordSetupComplete);

// Only authorized Security accounts.
router.use(requireRoles("SECURITY"));

// ============================================================
// SECURITY PROFILE
// ============================================================

router.get("/profile", getSecurityProfile);

// ============================================================
// SECURITY GATE HISTORY
// ============================================================

router.get("/history", getSecurityGateHistory);

// ============================================================
// QR SCAN - READ ONLY PREVIEW
// ============================================================

router.post("/:id/preview", previewOutpassController);

// ============================================================
// CONFIRM EXIT
// ============================================================

router.patch("/:id/verify-exit", verifyExitController);

// ============================================================
// CONFIRM ENTRY
// ============================================================

router.patch("/:id/verify-entry", verifyEntryController);

// ============================================================
// EXPORT
// ============================================================

module.exports = router;
