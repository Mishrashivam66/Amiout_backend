const express = require("express");

const router = express.Router();

const programController = require("../controllers/program.controller");

const { protect } = require("../../../middlewares/auth.middleware");

const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

// ============================================================================
// Protected Routes
// ============================================================================

router.use(protect);

router.use(authorize(ROLES.ADMIN));

// ============================================================================
// Program Routes
// ============================================================================

router.post("/", programController.createProgram);

router.get("/", programController.getAllPrograms);

router.get("/institute/:instituteId", programController.getProgramsByInstitute);

router.get("/:id", programController.getProgramById);

router.put("/:id", programController.updateProgram);

router.delete("/:id", programController.deleteProgram);

// ============================================================================
// Export Router
// ============================================================================

module.exports = router;

