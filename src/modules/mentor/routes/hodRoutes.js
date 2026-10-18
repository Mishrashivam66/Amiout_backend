"use strict";

const express = require("express");
const router = express.Router();

const mentorController = require("../controllers/mentorController");

const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");
const ROLES = require("../../auth/constants/roles");

router.use(protect);
router.use(authorize(ROLES.HOD));

// All department outpasses, with optional status filter
router.get("/outpasses", mentorController.getHODOutpasses);

// Individual outpass details
router.get("/outpass/:outpassId", mentorController.getHODOutpassDetails);

// HOD approval
router.patch("/outpass/:outpassId/approve", mentorController.approveAsHOD);

module.exports = router;
