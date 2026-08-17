"use strict";

const express = require("express");

const router = express.Router();

const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");
const ROLES = require("../../auth/constants/roles");

const { uploadExcel } = require("../../../middlewares/upload.middleware");

const { testExcel } = require("../controllers/test.controller");

router.post(
  "/excel",
  protect,
  authorize(ROLES.ADMIN),
  uploadExcel.single("file"),
  testExcel,
);

module.exports = router;
