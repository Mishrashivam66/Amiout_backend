"use strict";


const express = require("express");

const importController = require("../controllers/import.controller");

const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

const {
  uploadExcel,
  uploadPDF,
} = require("../../../middlewares/upload.middleware");

const router = express.Router();

// ============================================================================
// Student Import
// ============================================================================

router.post(
  "/students",
  protect,
  authorize(ROLES.ADMIN),
  uploadExcel.single("file"),
  importController.importStudents,
);

router.post(
  "/students/pdf",
  protect,
  authorize(ROLES.ADMIN),
  uploadPDF.single("file"),
  importController.importStudentsFromPDF,
);

// ============================================================================
// Mentor Import
// ============================================================================

router.post(
  "/mentors",
  protect,
  authorize(ROLES.ADMIN),
  uploadExcel.single("file"),
  importController.importMentors,
);

// ============================================================================
// Group Import
// ============================================================================

router.post(
  "/groups",
  protect,
  authorize(ROLES.ADMIN),
  uploadExcel.single("file"),
  importController.importGroups,
);

// ============================================================================
// Import History
// ============================================================================

router.get(
  "/history",
  protect,
  authorize(ROLES.ADMIN),
  importController.getImportHistory,
);

router.get(
  "/history/:id",
  protect,
  authorize(ROLES.ADMIN),
  importController.getImportHistoryById,
);

router.get(
  "/templates/group",
  protect,
  authorize(ROLES.ADMIN),
  importController.downloadGroupTemplate,
);
// ============================================================================
// Download Templates
// ============================================================================

router.get(
  "/templates/student",
  protect,
  authorize(ROLES.ADMIN),
  importController.downloadStudentTemplate,
);

router.get(
  "/templates/mentor",
  protect,
  authorize(ROLES.ADMIN),
  importController.downloadMentorTemplate,
);

// ============================================================================
// Student PDF Import
// ============================================================================

module.exports = Object.freeze(router);
