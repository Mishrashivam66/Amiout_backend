const express = require("express");

const router = express.Router();

const studentImportController = require("../controllers/studentImport.controller");

const { protect } = require("../../../middlewares/auth.middleware");

const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

const {
  uploadExcel,
  uploadPDF,
} = require("../../../middlewares/upload.middleware");
// ============================================================================
// Protected Routes
// ============================================================================

router.use(protect);

router.use(authorize(ROLES.ADMIN));

// ============================================================================
// Student Import Routes
// ============================================================================

/**
 * Import Students
 */
router.post(
  "/import",
  uploadExcel.single("file"),
  studentImportController.importStudents,
);

/**
 * Get All Students
 */
router.get("/", studentImportController.getAllStudents);

/**
 * Get Student By Enrollment Number
 */
router.get(
  "/enrollment/:enrollmentNumber",
  studentImportController.getStudentByEnrollment,
);

router.post(
  "/pdf",
  protect,
  authorize(ROLES.ADMIN),
  uploadPDF.single("file"),
  studentImportController.importStudentsFromPDF,
);

/**
 * Update Student
 */
router.put("/:id", studentImportController.updateStudent);

/**
 * Delete Student
 */
router.delete("/:id", studentImportController.deleteStudent);

// ============================================================================
// Export Router
// ============================================================================

module.exports = router;
