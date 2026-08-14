
const express = require("express");

const router = express.Router();

const dashboardController = require("../controllers/dashboardController");

// Shared Middlewares
const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");

// Auth Constants
const ROLES = require("../../auth/constants/roles");


router.get(
  "/",
  protect,
  authorize(ROLES.STUDENT),
  dashboardController.getDashboard,
);

module.exports = router;
