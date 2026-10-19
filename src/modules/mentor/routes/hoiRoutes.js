"use strict";

const express = require("express");
const router = express.Router();

const mentorController = require("../controllers/mentorController");

const hoiController = require("../../hoi/controllers/hoi.controller");

const { protect } = require("../../../middlewares/auth.middleware");

const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

router.use(protect);
router.use(authorize(ROLES.HOI));

// ============================================================
// HOI STUDENTS - READ ONLY
// ============================================================

router.get("/students", hoiController.getInstituteStudents);

router.get("/students/:studentId", hoiController.getInstituteStudentDetails);

// ============================================================
// HOI PROFILE AND AVAILABILITY
// ============================================================

router.get("/profile", hoiController.getHOIProfile);

router.patch("/availability", hoiController.setHOIAvailability);

router.get("/faculty-availability", hoiController.getFacultyAvailability);

// ============================================================
// EXISTING OUTPASS LISTING / APPROVAL
// ============================================================

router.get("/outpasses", mentorController.getHOIOutpasses);

router.get("/outpass/:outpassId", mentorController.getHOIOutpassDetails);

router.patch("/outpass/:outpassId/approve", mentorController.approveAsHOI);

module.exports = router;
