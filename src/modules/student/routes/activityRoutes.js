const express = require("express");

const router = express.Router();

const activityController = require("../controllers/activityController");

const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");


router.use(protect);

router.use(authorize(ROLES.STUDENT));

// ============================================================================
// GET /activities
// ============================================================================
router.get("/", activityController.getActivities);

// ============================================================================
// GET /activities/recent
// ============================================================================
router.get("/recent", activityController.getRecentActivities);

// ============================================================================
// POST /activities
// ============================================================================
router.post("/", activityController.createActivity);

module.exports = router;
