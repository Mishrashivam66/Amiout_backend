"use strict";

const asyncHandler = require("express-async-handler");

const monitoring = require("../services/outpassMonitoring.service");

const reports = require("../services/outpassReport.service");

const actorId = (req) => req.user?._id || req.user?.id || null;

// GET /api/v1/super-admin/outpasses
const getOutpasses = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const data = await monitoring.listOutpasses(actorId(req), req.query);

  return res.status(200).json({
    success: true,
    message: "Outpasses fetched successfully.",
    data,
  });
});

// GET /api/v1/super-admin/outpasses/filters
const getFilters = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const data = await monitoring.getFilterOptions(actorId(req));

  return res.status(200).json({
    success: true,
    data,
  });
});

// GET /api/v1/super-admin/outpasses/export?format=xlsx
// GET /api/v1/super-admin/outpasses/export?format=pdf
const exportOutpasses = asyncHandler(async (req, res) => {
  const format = String(req.query.format || "").toLowerCase();

  if (!["xlsx", "pdf"].includes(format)) {
    return res.status(400).json({
      success: false,
      message: "format must be xlsx or pdf.",
    });
  }

  // PDF includes detailed pages for each outpass.
  const maxRecords = format === "pdf" ? 100 : 2500;

  const data = await monitoring.getReportRecords(
    actorId(req),
    req.query,
    maxRecords,
  );

  if (format === "xlsx") {
    await reports.writeExcel(res, data);
    return;
  }

  reports.writePdf(res, data);
});

// GET /api/v1/super-admin/outpasses/:id
const getOutpassDetails = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const data = await monitoring.getOutpass(actorId(req), req.params.id);

  return res.status(200).json({
    success: true,
    data,
  });
});

module.exports = Object.freeze({
  getOutpasses,
  getFilters,
  getOutpassDetails,
  exportOutpasses,
});
