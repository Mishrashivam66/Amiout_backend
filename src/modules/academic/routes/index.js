"use strict";

const express = require("express");

const router = express.Router();

// ==========================================
// IMPORT ROUTES
// ==========================================

const instituteRoutes = require("./institute.routes");
const programRoutes = require("./program.routes");
const studentImportRoutes = require("./studentImport.routes");
const mentorImportRoutes = require("./mentorImport.routes");

// ==========================================
// ACADEMIC MANAGEMENT ROUTES
// ==========================================

const mentorRoutes = require("./mentor.routes");
const mappingRoutes = require("./mapping.routes");
const groupRoutes = require("./group.routes");
const testRoutes = require("./test.routes");

// ==========================================
// INSTITUTE & PROGRAM ROUTES
// ==========================================

router.use("/institutes", instituteRoutes);
router.use("/programs", programRoutes);

// ==========================================
// STUDENT & FACULTY IMPORT ROUTES
// ==========================================

router.use("/students", studentImportRoutes);
router.use("/mentor-import", mentorImportRoutes);

// ==========================================
// MENTOR MANAGEMENT ROUTES
// ==========================================

router.use("/mentors", mentorRoutes);

// ==========================================
// MAPPING & GROUP ROUTES
// ==========================================

router.use("/mapping", mappingRoutes);
router.use("/groups", groupRoutes);

// ==========================================
// TEST ROUTES
// ==========================================

router.use("/test", testRoutes);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
