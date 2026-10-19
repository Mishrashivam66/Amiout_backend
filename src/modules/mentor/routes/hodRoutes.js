"use strict";

const express = require("express");
const router = express.Router();

const mentorController = require("../controllers/mentorController");

const hodController = require("../../hod/controllers/hod.controller");

const facultyAvailabilityController = require("../../hod/controllers/hodFacultyAvailabilityController");

const { protect } = require("../../../middlewares/auth.middleware");

const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

// ============================================================
// AMIOUT ENTERPRISE - HOD AUTHENTICATED ROUTES
// ============================================================

router.use(protect);
router.use(authorize(ROLES.HOD));

// ============================================================
// HOD PROFILE & AVAILABILITY
// ============================================================

router.get("/profile", hodController.getHODProfile);

router.patch("/availability", hodController.setHODAvailability);

// ============================================================
// DEPARTMENT STUDENTS
// ============================================================

router.get("/students", hodController.getDepartmentStudents);

router.get("/students/:studentId", hodController.getDepartmentStudentDetails);

// ============================================================
// FACULTY AVAILABILITY MONITORING - READ ONLY
// ============================================================

router.get(
  "/faculty-availability",
  facultyAvailabilityController.getAvailabilityDashboard,
);

// ============================================================
// EXISTING OUTPASS MONITORING
// ============================================================

router.get("/outpasses", mentorController.getHODOutpasses);

router.get("/outpass/:outpassId", mentorController.getHODOutpassDetails);

// ============================================================
// EXISTING SECURE HOD APPROVAL
// ============================================================

router.patch("/outpass/:outpassId/approve", mentorController.approveAsHOD);

module.exports = router;
