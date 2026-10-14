"use strict";

const express = require("express");

const router = express.Router();

const mentorController = require("../controllers/mentorController");

const { protect } = require("../../../middlewares/auth.middleware");

const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

// ============================================================
// COORDINATOR AUTHENTICATION
// ============================================================

router.use(protect);

// Verify Coordinator access.
// The service independently verifies the faculty's
// active SECTION role assignment and academic scope.
router.use(authorize(ROLES.COORDINATOR));

// ============================================================
// COORDINATOR DASHBOARD
// ============================================================

router.get("/dashboard", mentorController.getCoordinatorDashboard);

// ============================================================
// COORDINATOR STUDENTS
// ============================================================

router.get("/students", mentorController.getCoordinatorStudents);

// ============================================================
// FACULTY PROFILE
// ============================================================

router.get("/profile", mentorController.getProfile);

// ============================================================
// EXPORT
// ============================================================

module.exports = router;
