"use strict";

const express = require("express");
const router = express.Router();

const parentApprovalController = require("../controllers/parentApprovalController");

// Public routes secured with expiring,
// single-use cryptographic approval tokens.

// Rate limit these endpoints before production.
router.get("/review/:token", parentApprovalController.reviewOutpass);

router.post(
  "/decision/:token",
  express.json({ limit: "4kb" }),
  parentApprovalController.submitDecision,
);

module.exports = router;
