"use strict";

const express = require("express");
const router = express.Router();

const mentorController = require("../controllers/mentorController");

const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");
const ROLES = require("../../auth/constants/roles");

router.use(protect);
router.use(authorize(ROLES.HOI));

// All institute outpasses
router.get("/outpasses", mentorController.getHOIOutpasses);

// Individual outpass details
router.get("/outpass/:outpassId", mentorController.getHOIOutpassDetails);

// HOI approval
router.patch("/outpass/:outpassId/approve", mentorController.approveAsHOI);

module.exports = router;
