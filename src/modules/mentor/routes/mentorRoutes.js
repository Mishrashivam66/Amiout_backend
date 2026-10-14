"use strict";

const express = require("express");
const router = express.Router();

const mentorController = require("../controllers/mentorController");

const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

// ============================================================
// PROTECTED MENTOR ROUTES
// ============================================================

router.use(protect);
router.use(authorize(ROLES.MENTOR));

// ============================================================
// DASHBOARD
// ============================================================

router.get("/dashboard", mentorController.getDashboard);

// ============================================================
// MENTOR PROFILE
// ============================================================

// Read-only profile from MentorMaster + Mentor account
router.get("/profile", mentorController.getProfile);

// Legacy update route retained for compatibility.
// Disable separately if manual edits must be prohibited.
router.put("/profile", mentorController.updateProfile);

// Availability is saved in Mentor account
router.patch("/availability", mentorController.updateAvailability);

// ============================================================
// STUDENTS
// ============================================================

router.get("/students", mentorController.getStudents);

router.get("/students/:studentId", mentorController.getStudentDetails);

router.patch("/students/:studentId/unlock", mentorController.unlockStudent);

// ============================================================
// OUTPASS REQUESTS
// ============================================================

router.get("/outpass/pending", mentorController.getPendingRequests);

router.get("/outpass/approved", mentorController.getApprovedRequests);

router.get("/outpass/rejected", mentorController.getRejectedRequests);

router.get("/outpass/:outpassId", mentorController.getOutpassDetails);

// ============================================================
// MENTOR ACTIONS
// ============================================================

router.patch("/outpass/:outpassId/approve", mentorController.approveOutpass);

router.patch("/outpass/:outpassId/reject", mentorController.rejectOutpass);

// ============================================================
// HISTORY
// ============================================================

router.get("/history", mentorController.getHistory);

// ============================================================
// EXPORT
// ============================================================

module.exports = router;
