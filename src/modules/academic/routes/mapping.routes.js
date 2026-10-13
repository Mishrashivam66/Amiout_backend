"use strict";

const express = require("express");

const router = express.Router();

const mappingController = require("../controllers/mapping.controller");

const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");
const ROLES = require("../../auth/constants/roles");

// ==========================================
// AUTHENTICATION & AUTHORIZATION
// ==========================================

// Only authenticated administrators can manage mappings
router.use(protect);
router.use(authorize(ROLES.ADMIN));

// ==========================================
// GENERATE AUTOMATIC STUDENT MAPPING
// ==========================================

// POST /mapping/generate
router.post("/generate", mappingController.generateMapping);

// ==========================================
// ASSIGN PRIMARY MENTOR
// ==========================================

// POST /mapping/primary-mentor
router.post("/primary-mentor", mappingController.assignPrimaryMentor);

// ==========================================
// ASSIGN BACKUP MENTOR
// ==========================================

// POST /mapping/backup-mentor
router.post("/backup-mentor", mappingController.assignBackupMentor);

// ==========================================
// GET GROUP MAPPING
// ==========================================

// GET /mapping/group
router.get("/group", mappingController.getGroupMapping);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
