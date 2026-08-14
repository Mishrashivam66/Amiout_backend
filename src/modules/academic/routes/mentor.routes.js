"use strict";

const express = require("express");

const router = express.Router();

const mentorController = require("../controllers/mentor.controller");

router.get("/", mentorController.getAllMentors);

router.get("/:id", mentorController.getMentorById);

router.post("/", mentorController.createMentor);

router.patch("/:id", mentorController.updateMentor);

router.delete("/:id", mentorController.deleteMentor);

module.exports = router;
