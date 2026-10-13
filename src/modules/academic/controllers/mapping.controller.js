"use strict";

const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");

const mappingService = require("../services/mapping.service");

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const validateAssignment = ({ groupId, mentorId }) => {
  if (!groupId || !mentorId) {
    throw createError("groupId and mentorId are required.");
  }

  if (
    !mongoose.isValidObjectId(groupId) ||
    !mongoose.isValidObjectId(mentorId)
  ) {
    throw createError("Invalid Group or Mentor ID.");
  }
};

// =====================================================
// GENERATE STUDENT MAPPING
// =====================================================

const generateMapping = asyncHandler(async (req, res) => {
  const result = await mappingService.generateMapping();

  return res.status(200).json({
    success: result.success,
    message:
      result.failed === 0
        ? "All eligible students mapped successfully."
        : "Mapping completed with some failures.",
    data: result,
  });
});

// =====================================================
// ASSIGN PRIMARY MENTOR
// =====================================================

const assignPrimaryMentor = asyncHandler(async (req, res) => {
  validateAssignment(req.body || {});

  const { groupId, mentorId } = req.body;

  const group = await mappingService.assignPrimaryMentor(groupId, mentorId);

  return res.status(200).json({
    success: true,
    message: "Primary mentor assigned successfully.",
    data: group,
  });
});

// =====================================================
// ASSIGN BACKUP MENTOR
// =====================================================

const assignBackupMentor = asyncHandler(async (req, res) => {
  validateAssignment(req.body || {});

  const { groupId, mentorId } = req.body;

  const group = await mappingService.assignBackupMentor(groupId, mentorId);

  return res.status(200).json({
    success: true,
    message: "Backup mentor assigned successfully.",
    data: group,
  });
});

// =====================================================
// GET GROUP MAPPING
// =====================================================

const getGroupMapping = asyncHandler(async (req, res) => {
  const { instituteId, programId, batch, semester, section, groupName } =
    req.query;

  if (
    !mongoose.isValidObjectId(instituteId) ||
    !mongoose.isValidObjectId(programId)
  ) {
    throw createError("Valid Institute and Program IDs required.");
  }

  if (
    !batch ||
    !section ||
    !groupName ||
    !Number.isInteger(Number(semester)) ||
    Number(semester) < 1
  ) {
    throw createError("Complete academic group details required.");
  }

  const group = await mappingService.getGroupMapping(
    instituteId,
    programId,
    batch,
    Number(semester),
    section,
    groupName,
  );

  return res.status(200).json({
    success: true,
    data: group,
  });
});

module.exports = Object.freeze({
  generateMapping,
  assignPrimaryMentor,
  assignBackupMentor,
  getGroupMapping,
});
