"use strict";

const parentApprovalService = require("../services/parentApprovalService");

const handleError = (res, error) => {
  const statusCode =
    error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;

  if (statusCode === 500) {
    console.error("Parent approval error:", error.message);
  }

  return res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500 ? "Unable to process parent approval." : error.message,
  });
};

// ============================================================
// GET /parent/review/:token
// ============================================================

const reviewOutpass = async (req, res) => {
  try {
    const data = await parentApprovalService.reviewOutpass(req.params.token);

    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ============================================================
// POST /parent/decision/:token
// Body: { "decision": "APPROVED" }
// ============================================================

const submitDecision = async (req, res) => {
  try {
    const result = await parentApprovalService.submitParentDecision(
      req.params.token,
      req.body?.decision,
    );

    res.set("Cache-Control", "no-store");

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

module.exports = Object.freeze({
  reviewOutpass,
  submitDecision,
});
