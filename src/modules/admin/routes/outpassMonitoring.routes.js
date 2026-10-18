"use strict";

const express = require("express");

const { protect } = require("../../../middlewares/auth.middleware");

const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

const controller = require("../controllers/outpassMonitoring.controller");

const router = express.Router();

// Allow roles explicitly defined in your project.
const allowedRoles = [ROLES.ADMIN, ROLES.SUPER_ADMIN].filter(Boolean);

router.use(protect);
router.use(authorize(...allowedRoles));

// Static route first.
router.get("/export/excel", controller.exportOutpassesExcel);

// Dynamic route last.
router.get("/:id", controller.getOutpassDetails);

module.exports = router;
