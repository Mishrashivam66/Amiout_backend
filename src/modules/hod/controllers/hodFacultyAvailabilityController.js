"use strict";

const asyncHandler = require("express-async-handler");

const {
  getFacultyAvailability,
} = require("../services/hodFacultyAvailabilityService");

const getAvailabilityDashboard = asyncHandler(async (req, res) => {
  const facultyId = req.user?._id || req.user?.id;

  if (!facultyId) {
    return res.status(401).json({
      success: false,
      message: "HOD authentication required.",
    });
  }

  const result = await getFacultyAvailability(facultyId);

  return res.status(result.success ? 200 : 403).json(result);
});

module.exports = Object.freeze({
  getAvailabilityDashboard,
});
