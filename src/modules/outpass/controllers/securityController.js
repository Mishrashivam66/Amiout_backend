"use strict";

const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const { verifyExit } = require("../services/verifyExitService");
const { verifyEntry } = require("../services/verifyEntryService");

const { previewOutpass } = require("../services/previewOutpassService");

// ==============================================
// SECURITY AUTHENTICATION
// ==============================================

const getSecurityContext = (req, res) => {
  if (
    !req.user ||
    !req.auth ||
    req.auth.role !== "SECURITY" ||
    req.auth.accountType !== "SECURITY"
  ) {
    res.status(403).json({
      success: false,
      message: "Authorized Security Guard access required.",
    });

    return null;
  }

  const securityId = req.user._id || req.user.id;

  if (!mongoose.isValidObjectId(securityId)) {
    res.status(401).json({
      success: false,
      message: "Invalid security account.",
    });

    return null;
  }

  return securityId;
};

// ==============================================
// QR SCAN VALIDATION
// ==============================================

const validateScanRequest = (req, res) => {
  const outpassId = req.params?.id;
  const qrToken = req.body?.qrToken;

  if (!mongoose.isValidObjectId(outpassId)) {
    res.status(400).json({
      success: false,
      message: "Invalid outpass ID.",
    });

    return null;
  }

  if (typeof qrToken !== "string" || !qrToken.trim() || qrToken.length > 4096) {
    res.status(400).json({
      success: false,
      message: "Valid QR token is required.",
    });

    return null;
  }

  return {
    outpassId,
    qrToken,
  };
};

// ==============================================
// PREVIEW STUDENT DETAILS
// NO EXIT / ENTRY UPDATE
// ==============================================

const previewOutpassController = asyncHandler(async (req, res) => {
  const securityId = getSecurityContext(req, res);

  if (!securityId) return;

  const scan = validateScanRequest(req, res);

  if (!scan) return;

  const mode = String(req.body?.mode || "").toUpperCase();

  if (!["EXIT", "ENTRY"].includes(mode)) {
    return res.status(400).json({
      success: false,
      message: "Mode must be EXIT or ENTRY.",
    });
  }

  const result = await previewOutpass(
    scan.outpassId,
    scan.qrToken,
    securityId,
    mode,
  );

  return res.status(result.success ? 200 : 400).json(result);
});

// ==============================================
// CONFIRM EXIT
// ==============================================

const verifyExitController = asyncHandler(async (req, res) => {
  const securityId = getSecurityContext(req, res);

  if (!securityId) return;

  const scan = validateScanRequest(req, res);

  if (!scan) return;

  const result = await verifyExit(scan.outpassId, scan.qrToken, securityId);

  return res.status(result.success ? 200 : 400).json(result);
});

// ==============================================
// CONFIRM ENTRY
// ==============================================

const verifyEntryController = asyncHandler(async (req, res) => {
  const securityId = getSecurityContext(req, res);

  if (!securityId) return;

  const scan = validateScanRequest(req, res);

  if (!scan) return;

  const result = await verifyEntry(scan.outpassId, scan.qrToken, securityId);

  return res.status(result.success ? 200 : 400).json(result);
});

module.exports = Object.freeze({
  previewOutpassController,
  verifyExitController,
  verifyEntryController,
});
