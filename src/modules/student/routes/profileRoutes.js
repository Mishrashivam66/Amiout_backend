const express = require("express");

const router = express.Router();

const profileController = require("../controllers/profileController");

const authorize = require("../../../middlewares/role.middleware");
const { protect } = require("../../../middlewares/auth.middleware");

const ROLES = require("../../auth/constants/roles");
// ============================================================================
// Student Profile
// ============================================================================

router.get(
  "/",
  protect,
  authorize(ROLES.STUDENT),
  profileController.getProfile,
);

router.put(
  "/",
  protect,
  authorize(ROLES.STUDENT),
  profileController.completeProfile,
);

router.patch(
  "/map-mentor",
  protect,
  authorize(ROLES.STUDENT),
  profileController.mapStudentMentor,
);

router.patch(
  "/unlock/:studentId",
  protect,
  authorize(ROLES.MENTOR, ROLES.ADMIN, ROLES.SUPER_ADMIN),
  profileController.unlockProfile,
);

router.patch(
  "/hold/:studentId",
  protect,
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  profileController.holdAccount,
);

router.patch(
  "/activate/:studentId",
  protect,
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  profileController.activateAccount,
);

module.exports = router;
