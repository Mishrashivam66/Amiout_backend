
const express = require("express");

const router = express.Router();

// ============================================================================
// Route Imports
// ============================================================================

const profileRoutes = require("./profileRoutes");

const outpassRoutes = require("../../outpass/routes");

// ============================================================================
// Student Routes
// ============================================================================

router.use("/profile", profileRoutes);

router.use("/outpass", outpassRoutes);

module.exports = router;
