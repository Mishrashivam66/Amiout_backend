const express = require("express");

const router = express.Router();

const mentorController = require("../controllers/mentorController");

const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

// ============================================================================
// Protected Mentor Routes
// ============================================================================

router.use(protect);
router.use(authorize(ROLES.MENTOR));

// ============================================================================
// Dashboard
// ============================================================================

router.get("/dashboard", mentorController.getDashboard);

// ============================================================================
// Outpass Requests
// ============================================================================
router.get("/students", mentorController.getStudents);
router.get("/outpass/pending", mentorController.getPendingRequests);

router.get("/outpass/approved", mentorController.getApprovedRequests);

router.put("/profile", mentorController.updateProfile);
router.get("/outpass/rejected", mentorController.getRejectedRequests);
router.get("/students/:studentId", mentorController.getStudentDetails);
router.patch("/students/:studentId/unlock", mentorController.unlockStudent);
router.get("/history", mentorController.getHistory);
router.get("/outpass/:outpassId", mentorController.getOutpassDetails);
// ============================================================================
// Mentor Actions
// ============================================================================

router.patch("/outpass/:outpassId/approve", mentorController.approveOutpass);

router.patch("/outpass/:outpassId/reject", mentorController.rejectOutpass);

// ============================================================================
// Export Router
// ============================================================================

module.exports = router;
