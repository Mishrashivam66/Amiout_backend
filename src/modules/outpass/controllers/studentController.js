"use strict";

const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const outpassService = require("../services");
const Outpass = require("../models/Outpass");

// ============================================================
// HELPERS
// ============================================================

const getStudentId = (req) => req.user?._id || req.user?.id;

const sendResult = (res, result, successStatus = 200, failureStatus = 400) => {
  if (!result || typeof result.success !== "boolean") {
    return res.status(500).json({
      success: false,
      message: "Unexpected outpass service response.",
    });
  }

  return res
    .status(result.success ? successStatus : failureStatus)
    .json(result);
};

// ============================================================
// APPLY OUTPASS
// POST /outpass/apply
// ============================================================

const applyOutpass = asyncHandler(async (req, res) => {
  const studentId = getStudentId(req);

  if (!studentId) {
    return res.status(401).json({
      success: false,
      message: "Student authentication required.",
    });
  }

  const result = await outpassService.applyOutpass(studentId, req.body);

  return sendResult(res, result, 201, 400);
});

// ============================================================
// GET STUDENT HISTORY
// GET /outpass/history
// ============================================================

const getHistory = asyncHandler(async (req, res) => {
  const studentId = getStudentId(req);

  const parsedPage = Number(req.query.page);
  const parsedLimit = Number(req.query.limit);

  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const limit =
    Number.isInteger(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 50)
      : 10;

  const result = await outpassService.getStudentHistory(studentId, page, limit);

  return sendResult(res, result, 200, 400);
});

// ============================================================
// GET ACTIVE OUTPASS
// GET /outpass/active
// ============================================================

const getActiveOutpass = asyncHandler(async (req, res) => {
  const studentId = getStudentId(req);

  const result = await outpassService.getActiveOutpass(studentId);

  return sendResult(res, result, 200, 404);
});

// ============================================================
// GET OUTPASS DETAILS
// GET /outpass/:outpassId
// ============================================================

const getOutpassDetails = asyncHandler(async (req, res) => {
  const studentId = getStudentId(req);
  const outpassId = String(req.params.outpassId || "").trim();

  if (!outpassId) {
    return res.status(400).json({
      success: false,
      message: "Outpass ID is required.",
    });
  }

  // Supports both MongoDB ObjectId and
  // custom public outpassId identifiers.
  const identifierQuery = mongoose.isValidObjectId(outpassId)
    ? {
        $or: [{ _id: outpassId }, { outpassId }],
      }
    : { outpassId };

  // Ownership must be verified before calling
  // the existing details service.
  const ownedOutpass = await Outpass.findOne({
    ...identifierQuery,
    student: studentId,
    isDeleted: false,
  })
    .select("_id")
    .lean();

  if (!ownedOutpass) {
    return res.status(404).json({
      success: false,
      message: "Outpass not found.",
    });
  }

  // Use the original identifier to preserve the
  // existing service's lookup behavior.
  const result = await outpassService.getOutpassDetails(outpassId);

  return sendResult(res, result, 200, 404);
});

// ============================================================
// CANCEL OUTPASS
// PATCH /outpass/:outpassId/cancel
// ============================================================

const cancelOutpass = asyncHandler(async (req, res) => {
  const studentId = getStudentId(req);
  const outpassId = String(req.params.outpassId || "").trim();

  if (!outpassId) {
    return res.status(400).json({
      success: false,
      message: "Outpass ID is required.",
    });
  }

  // Existing cancel service must enforce:
  // - Outpass belongs to student
  // - Request is cancellable
  // - Approved QR cannot be improperly reused
  const result = await outpassService.cancelOutpass(studentId, outpassId);

  return sendResult(res, result, 200, 400);
});

// ============================================================
// EXPORT CONTROLLER
// ============================================================

module.exports = Object.freeze({
  applyOutpass,
  getHistory,
  getActiveOutpass,
  getOutpassDetails,
  cancelOutpass,
});
