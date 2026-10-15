"use strict";

const express = require("express");
const router = express.Router();

const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");
const ROLES = require("../../auth/constants/roles");

const { verifyExitController } = require("../controllers/securityController");

router.use(protect);
router.use(authorize(ROLES.SECURITY));

router.patch("/:id/verify-exit", verifyExitController);

module.exports = router;
