"use strict";

const express = require("express");

const userController = require("../controllers/user.controller");

const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

const router = express.Router();

// ============================================================================
// User Management Routes
// ============================================================================

router.get("/", protect, authorize(ROLES.ADMIN), userController.getAllUsers);

router.get("/:id", protect, authorize(ROLES.ADMIN), userController.getUserById);

router.patch(
  "/:id/activate",
  protect,
  authorize(ROLES.ADMIN),
  userController.activateUser,
);

router.patch(
  "/:id/deactivate",
  protect,
  authorize(ROLES.ADMIN),
  userController.deactivateUser,
);

module.exports = Object.freeze(router);
