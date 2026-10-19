"use strict";

const express = require("express");

const { protect } = require("../../../middlewares/auth.middleware");

const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

const superAdminController = require("../controllers/superAdmin.controller");

const studentMonitoringController = require("../controllers/studentMonitoring.controller");

const outpassMonitoringController = require("../controllers/outpassMonitoring.controller");

const router = express.Router();

// ============================================================
// SUPER ADMIN ACCESS
// ============================================================

router.use(protect);
router.use(authorize(ROLES.SUPER_ADMIN));

// ============================================================
// UNIVERSITY STUDENT MONITORING
// SUPER_ADMIN ONLY
// ============================================================

router.get("/students/filters", studentMonitoringController.getStudentFilters);

// DOWNLOAD FILTERED STUDENT EXCEL
router.get("/students/export", studentMonitoringController.exportStudents);

// EXISTING PAGINATED STUDENT LIST
router.get("/students", studentMonitoringController.getStudents);

// ============================================================
// ADMIN MANAGEMENT
// ============================================================

router.post("/admins", superAdminController.createAdmin);

router.get("/admins", superAdminController.getAdmins);

router.patch("/admins/:id/status", superAdminController.changeAdminStatus);

// ============================================================
// STUDENT MONITORING
// ============================================================

router.get("/students/filters", studentMonitoringController.getStudentFilters);

router.get("/students", studentMonitoringController.getStudents);

// ============================================================
// OUTPASS MONITORING & REPORTS
//
// Keep fixed routes above /:id.
// ============================================================

router.get("/outpasses/filters", outpassMonitoringController.getFilters);

router.get("/outpasses/export", outpassMonitoringController.exportOutpasses);

router.get("/outpasses", outpassMonitoringController.getOutpasses);

router.get("/outpasses/:id", outpassMonitoringController.getOutpassDetails);

module.exports = Object.freeze(router);
