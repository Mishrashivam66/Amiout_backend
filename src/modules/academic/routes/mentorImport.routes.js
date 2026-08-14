const express = require("express");

const router = express.Router();

const mentorImportController = require("../controllers/mentorImport.controller");

const { protect } = require("../../../middlewares/auth.middleware");

const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

// ============================================================================
// Protected Routes
// ============================================================================

router.use(protect);

router.use(authorize(ROLES.ADMIN));

// ============================================================================
// Mentor Import Routes
// ============================================================================

/**
 * Import Mentors
 */
router.post("/import", mentorImportController.importMentors);

/**
 * Get All Mentors
 */
router.get("/", mentorImportController.getAllMentors);

/**
 * Get Mentor By Employee ID
 */
router.get(
  "/employee/:employeeId",
  mentorImportController.getMentorByEmployeeId,
);

/**
 * Update Mentor
 */
router.put("/:id", mentorImportController.updateMentor);

/**
 * Delete Mentor
 */
router.delete("/:id", mentorImportController.deleteMentor);

// ============================================================================
// Export Router
// ============================================================================

module.exports = router;
