
const express = require("express");

const router = express.Router();

const studentController = require("../controllers/studentController");

const { protect } = require("../../../middlewares/auth.middleware");

const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

// ============================================================================
// Protected Student Routes
// ============================================================================

router.use(protect);

router.use(authorize(ROLES.STUDENT));

// ============================================================================
// Apply Outpass
// ============================================================================

router.post("/apply", studentController.applyOutpass);

// ============================================================================
// Get Active Outpass
// ============================================================================

router.get("/active", studentController.getActiveOutpass);

// ============================================================================
// Get History
// ============================================================================

router.get("/history", studentController.getHistory);

// ============================================================================
// Get Outpass Details
// ============================================================================

router.get("/:outpassId", studentController.getOutpassDetails);

// ============================================================================
// Cancel Outpass
// ============================================================================

router.patch("/:outpassId/cancel", studentController.cancelOutpass);

// ============================================================================
// Export Router
// ============================================================================

module.exports = router;
