const express = require("express");

const router = express.Router();

const instituteController = require("../controllers/institute.controller");

const { protect } = require("../../../middlewares/auth.middleware");

const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

// ============================================================================
// Protected Routes
// ============================================================================

router.use(protect);

router.use(authorize(ROLES.ADMIN));

// ============================================================================
// Institute Routes
// ============================================================================

router.post("/", instituteController.createInstitute);

router.get("/", instituteController.getAllInstitutes);

router.get("/:id", instituteController.getInstituteById);

router.put("/:id", instituteController.updateInstitute);

router.delete("/:id", instituteController.deleteInstitute);

// ============================================================================
// Export Router
// ============================================================================

module.exports = router;
