"use strict";

const asyncHandler = require("express-async-handler");

const { verifyExit } = require("../services/verifyExitService");

const { verifyEntry } = require("../services/verifyEntryService");

const getSecurityId = (req) => req.user?._id || req.user?.id;

const verifyExitController = asyncHandler(async (req, res) => {
  const result = await verifyExit(
    req.params.id,
    req.body?.qrToken,
    getSecurityId(req),
  );

  return res.status(result.success ? 200 : 400).json(result);
});

const verifyEntryController = asyncHandler(async (req, res) => {
  const result = await verifyEntry(
    req.params.id,
    req.body?.qrToken,
    getSecurityId(req),
  );

  return res.status(result.success ? 200 : 400).json(result);
});

module.exports = Object.freeze({
  verifyExitController,
  verifyEntryController,
});
