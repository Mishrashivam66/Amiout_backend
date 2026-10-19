"use strict";

const express = require("express");
const router = express.Router();

const mentorController = require("../controllers/mentorController");

const { protect } = require("../../../middlewares/auth.middleware");

const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

// ============================================================
// AMIOUT ENTERPRISE - MENTOR ROUTES
// ============================================================

// Authentication required for every route.
router.use(protect);

// Existing faculty dashboard compatibility.
// Faculty can hold multiple roles.
router.use(authorize(ROLES.MENTOR, ROLES.COORDINATOR, ROLES.HOD, ROLES.HOI));

// ============================================================
// DASHBOARD
// ============================================================

router.get("/dashboard", mentorController.getDashboard);

// ============================================================
// FACULTY PROFILE
// ============================================================

router.get("/profile", mentorController.getProfile);

// Existing profile update retained for compatibility.
// Review whether this should remain editable.
router.put("/profile", mentorController.updateProfile);

// ============================================================
// FACULTY AVAILABILITY
// ============================================================

router.patch("/availability", mentorController.updateAvailability);

// ============================================================
// MENTOR STUDENTS
// ============================================================

router.get("/students", mentorController.getStudents);

router.get("/students/:studentId", mentorController.getStudentDetails);

router.patch(
  "/students/:studentId/unlock",
  authorize(ROLES.MENTOR),
  mentorController.unlockStudent,
);

// ============================================================
// MENTOR OUTPASS LISTS
// ============================================================

router.get("/outpass/pending", mentorController.getPendingRequests);

router.get("/outpass/approved", mentorController.getApprovedRequests);

router.get("/outpass/rejected", mentorController.getRejectedRequests);

// ============================================================
// OUTPASS DETAILS
// ============================================================

router.get("/outpass/:outpassId", mentorController.getOutpassDetails);

// ============================================================
// MENTOR APPROVAL
//
// Only an authenticated MENTOR role can use this API.
//
// The unified approval service additionally verifies:
// - Actual mapped primary/backup mentor
// - Current assignment
// - Academic scope
// - Parent decision
// - Faculty-authorized bypass audit
// - Daily outpass limits
// - QR generation
// ============================================================

router.patch(
  "/outpass/:outpassId/approve",
  authorize(ROLES.MENTOR),
  mentorController.approveOutpass,
);

// ============================================================
// MENTOR REJECTION
//
// Only Mentor role can access.
//
// IMPORTANT:
// Legacy rejectOutpassService still needs its
// atomic status and assignment checks reviewed.
// ============================================================

router.patch(
  "/outpass/:outpassId/reject",
  authorize(ROLES.MENTOR),
  mentorController.rejectOutpass,
);

// ============================================================
// HISTORY
// ============================================================

router.get("/history", mentorController.getHistory);

// ============================================================
// EXPORT
// ============================================================

module.exports = router;
