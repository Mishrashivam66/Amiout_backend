"use strict";

const express = require("express");

const { protect } = require("../../../middlewares/auth.middleware");

const profileController = require("../controllers/profile.controller");

const router = express.Router();

router.get("/profile", protect, profileController.getProfile);

module.exports = router;
