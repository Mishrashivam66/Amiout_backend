const express = require("express");

const dashboardController = require("../controllers/dashboard.controller");
const outpassController = require("../controllers/outpass.controller");
const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

const router = express.Router();

router.get(
  "/",
  protect,
  authorize(ROLES.ADMIN),
  dashboardController.getDashboard,
);
router.get(
  "/outpasses",
  protect,
  authorize(ROLES.ADMIN),
  outpassController.getAllOutpasses,
);

module.exports = Object.freeze(router);
