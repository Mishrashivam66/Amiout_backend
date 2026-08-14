const express = require("express");

const router = express.Router();

const mentorRoutes = require("./mentorRoutes");

// ============================================================================
// Mentor Routes
// ============================================================================

router.use("/", mentorRoutes);

// ============================================================================
// Export Router
// ============================================================================

module.exports = router;
