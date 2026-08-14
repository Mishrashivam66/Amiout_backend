const express = require("express");

const router = express.Router();

const outpassRoutes = require("./outpassRoutes");
const securityRoutes = require("./securityRoutes");

// Student / Mentor Outpass Routes
router.use("/", outpassRoutes);

// Security Verification Routes
router.use("/security", securityRoutes);

module.exports = router;
