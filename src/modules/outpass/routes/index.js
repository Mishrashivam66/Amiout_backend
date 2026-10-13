"use strict";

const express = require("express");
const router = express.Router();

const outpassRoutes = require("./outpassRoutes");
const securityRoutes = require("./securityRoutes");
const parentApprovalRoutes = require("./parentApprovalRoutes");

router.use("/", outpassRoutes);
router.use("/security", securityRoutes);
router.use("/parent", parentApprovalRoutes);

module.exports = router;
