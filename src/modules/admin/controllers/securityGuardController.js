"use strict";

const asyncHandler = require("express-async-handler");

const { createSecurityGuard } = require("../services/securityGuardService");

const createSecurityGuardController = asyncHandler(async (req, res) => {
  const adminId = req.auth?.id;

  if (!adminId) {
    return res.status(401).json({
      success: false,
      message: "Admin authentication required.",
    });
  }

  const result = await createSecurityGuard(adminId, req.body);

  return res.status(result.success ? 201 : 400).json(result);
});

module.exports = Object.freeze({
  createSecurityGuardController,
});
