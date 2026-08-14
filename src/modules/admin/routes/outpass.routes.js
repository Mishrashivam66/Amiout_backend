const express = require("express");

const router = express.Router();

const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

const outpassController = require("../controllers/outpass.controller");

// ============================================================================
// Admin - Get All Outpasses
// ============================================================================
router.get(
  "/",
  protect,
  authorize(ROLES.ADMIN),
  outpassController.getAllOutpasses,
);

module.exports = Object.freeze(router);
