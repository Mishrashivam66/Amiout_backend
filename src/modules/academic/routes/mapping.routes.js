"use strict";

const express = require("express");

const router = express.Router();

const mentorController = require("../controllers/mentor.controller");

const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");
const ROLES = require("../../auth/constants/roles");

// ============================================================================
// Protected Routes
// ============================================================================

router.use(protect);

router.use(authorize(ROLES.ADMIN));

// ============================================================================
// Mentor Routes
// ============================================================================

router.get("/", mentorController.getAllMentors);

router.get("/:id", mentorController.getMentorById);

router.post("/", mentorController.createMentor);

router.patch("/:id", mentorController.updateMentor);

router.delete("/:id", mentorController.deleteMentor);

// ============================================================================
// Export
// ============================================================================

module.exports = router;
