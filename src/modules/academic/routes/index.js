const express = require("express");

const router = express.Router();

const instituteRoutes = require("./institute.routes");
const programRoutes = require("./program.routes");
const studentImportRoutes = require("./studentImport.routes");
const mentorImportRoutes = require("./mentorImport.routes");
const mentorRoutes = require("./mentor.routes");
const mappingRoutes = require("./mapping.routes");
const groupRoutes = require("./group.routes");

// ============================================================================
// Academic Module Routes
// ============================================================================

router.use("/institutes", instituteRoutes);

router.use("/programs", programRoutes);

router.use("/students", studentImportRoutes);

// Mentor Import (Excel Upload)
router.use("/mentor-import", mentorImportRoutes);

// Mentor CRUD / List
router.use("/mentors", mentorRoutes);

router.use("/mapping", mappingRoutes);

router.use("/groups", groupRoutes);

// ============================================================================
// Export Router
// ============================================================================

module.exports = router;
