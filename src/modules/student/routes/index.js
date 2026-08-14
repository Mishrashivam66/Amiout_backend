const express = require("express");

const router = express.Router();

// Dashboard
router.use("/dashboard", require("./dashboardRoutes"));

// Activities
router.use("/activities", require("./activityRoutes"));

// Profile
router.use("/profile", require("./profileRoutes"));

// Outpass
router.use("/outpass", require("../../outpass/routes"));

module.exports = router;
