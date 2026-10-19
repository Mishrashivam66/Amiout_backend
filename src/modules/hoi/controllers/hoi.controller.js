"use strict";

const asyncHandler = require("express-async-handler");

const hoiService = require("../services/hoi.service");

const {
  getHOIFacultyAvailability,
} = require("../services/hoiFacultyAvailabilityService");

const {
  updateAvailability,
} = require("../../mentor/services/mentorDashboardService");

const getFacultyId = (req) =>
  req.auth?.id || req.user?._id || req.user?.id || null;

const sendResult = (res, result) =>
  res.status(result?.success ? 200 : result?.statusCode || 403).json(result);

// ============================================================
// INSTITUTE STUDENTS
// ============================================================

const getInstituteStudents = asyncHandler(async (req, res) => {
  const result = await hoiService.getInstituteStudents(
    getFacultyId(req),
    req.query,
  );

  return sendResult(res, result);
});

const getInstituteStudentDetails = asyncHandler(async (req, res) => {
  const result = await hoiService.getInstituteStudentDetails(
    getFacultyId(req),
    req.params.studentId,
  );

  return sendResult(res, result);
});

// ============================================================
// HOI PROFILE
// ============================================================

const getHOIProfile = asyncHandler(async (req, res) => {
  const result = await hoiService.getHOIProfile(getFacultyId(req));

  return sendResult(res, result);
});

// ============================================================
// FACULTY AVAILABILITY MONITORING
// ============================================================

const getFacultyAvailability = asyncHandler(async (req, res) => {
  const result = await getHOIFacultyAvailability(getFacultyId(req));

  return sendResult(res, result);
});

// ============================================================
// HOI OWN AVAILABILITY UPDATE
//
// Uses the SAME existing faculty update/reassignment
// service already used by Mentor, Coordinator and HOD.
// ============================================================

const setHOIAvailability = asyncHandler(async (req, res) => {
  const facultyId = getFacultyId(req);

  if (!facultyId) {
    return res.status(401).json({
      success: false,
      message: "HOI authentication required.",
    });
  }

  const requestedStatus = String(req.body?.availabilityStatus || "")
    .trim()
    .toUpperCase();

  if (!["AVAILABLE", "UNAVAILABLE"].includes(requestedStatus)) {
    return res.status(400).json({
      success: false,
      message: "Availability must be AVAILABLE or UNAVAILABLE.",
    });
  }

  // Verify HOI role AND active institute assignment.
  // Never take account ID or institute scope from body.
  const access = await hoiService.getHOIProfile(facultyId);

  if (!access.success) {
    return sendResult(res, access);
  }

  const result = await updateAvailability(facultyId, requestedStatus);

  return sendResult(res, result);
});

module.exports = Object.freeze({
  getInstituteStudents,
  getInstituteStudentDetails,
  getHOIProfile,
  getFacultyAvailability,
  setHOIAvailability,
});
