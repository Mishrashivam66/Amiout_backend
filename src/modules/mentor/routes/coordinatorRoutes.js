"use strict";

const express = require("express");
const router = express.Router();

const mentorController = require("../controllers/mentorController");

const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");
const ROLES = require("../../auth/constants/roles");

// Coordinator authentication
router.use(protect);
router.use(authorize(ROLES.COORDINATOR));

// Dashboard and students
router.get("/dashboard", mentorController.getCoordinatorDashboard);
router.get("/students", mentorController.getCoordinatorStudents);

// Pending outpasses
router.get("/outpass/pending", mentorController.getCoordinatorPendingRequests);

// History
router.get("/history", mentorController.getCoordinatorHistory);

// Outpass details
router.get(
  "/outpass/:outpassId",
  mentorController.getCoordinatorOutpassDetails,
);

// Approval: existing service validates actual assigned authority
router.patch("/outpass/:outpassId/approve", mentorController.approveOutpass);

// Profile
router.get("/profile", mentorController.getProfile);

module.exports = router;
