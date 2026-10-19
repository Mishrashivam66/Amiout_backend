"use strict";

const asyncHandler = require("express-async-handler");

const hodService = require("../services/hod.service");

const {
  updateAvailability,
} = require("../../mentor/services/mentorDashboardService");

const Mentor = require("../../auth/models/Mentor");

// ============================================================
// AMIOUT ENTERPRISE - HOD CONTROLLER
// ============================================================

const getFacultyId = (req) => req.user?._id || req.user?.id || null;

const sendResult = (res, result) =>
  res.status(result?.success ? 200 : result?.statusCode || 400).json(
    result || {
      success: false,
      message: "Unable to process request.",
    },
  );

// ============================================================
// DEPARTMENT STUDENTS
// ============================================================

const getDepartmentStudents = asyncHandler(async (req, res) => {
  const result = await hodService.getDepartmentStudents(
    getFacultyId(req),
    req.query,
  );

  return sendResult(res, result);
});

// ============================================================
// INDIVIDUAL STUDENT
// ============================================================

const getDepartmentStudentDetails = asyncHandler(async (req, res) => {
  const result = await hodService.getDepartmentStudentDetails(
    getFacultyId(req),
    req.params.studentId,
  );

  return sendResult(res, result);
});

// ============================================================
// HOD READ-ONLY PROFILE
// ============================================================

const getHODProfile = asyncHandler(async (req, res) => {
  const result = await hodService.getHODProfile(getFacultyId(req));

  return sendResult(res, result);
});

// ============================================================
// HOD AVAILABILITY TOGGLE
//
// PATCH /api/v1/hod/availability
//
// BODY:
// { "availabilityStatus": "UNAVAILABLE" }
//
// Only the authenticated HOD changes their own status.
// Reuse existing faculty availability and reassignment flow.
// ============================================================

const setHODAvailability = asyncHandler(async (req, res) => {
  const facultyId = getFacultyId(req);

  if (!facultyId) {
    return res.status(401).json({
      success: false,
      message: "HOD authentication required.",
    });
  }

  const requestedStatus =
    typeof req.body?.availabilityStatus === "string"
      ? req.body.availabilityStatus.trim().toUpperCase()
      : "";

  if (!["AVAILABLE", "UNAVAILABLE"].includes(requestedStatus)) {
    return res.status(400).json({
      success: false,
      message: "Availability must be AVAILABLE or UNAVAILABLE.",
    });
  }

  // Verify actual account role and active assignment.
  // Client-provided role/faculty IDs are never trusted.
  const profileResult = await hodService.getHODProfile(facultyId);

  if (!profileResult?.success) {
    return sendResult(res, profileResult);
  }

  const account = await Mentor.findById(facultyId)
    .select("availabilityStatus")
    .lean();

  if (!account) {
    return res.status(404).json({
      success: false,
      message: "HOD account not found.",
    });
  }

  const previousStatus = String(account.availabilityStatus || "").toUpperCase();

  // If already unavailable, allow an explicit
  // UNAVAILABLE request to retry pending transfers.
  if (previousStatus === requestedStatus && requestedStatus === "AVAILABLE") {
    return res.status(200).json({
      success: true,
      message: "You are already AVAILABLE.",
      data: {
        availabilityStatus: "AVAILABLE",
        reassignmentComplete: true,
        reassignment: null,
      },
    });
  }

  const result = await updateAvailability(facultyId, requestedStatus);

  return sendResult(res, result);
});

module.exports = Object.freeze({
  getDepartmentStudents,
  getDepartmentStudentDetails,
  getHODProfile,
  setHODAvailability,
});
