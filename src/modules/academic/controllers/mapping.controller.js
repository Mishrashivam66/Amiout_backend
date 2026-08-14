const asyncHandler = require("express-async-handler");

const mappingService = require("../services/mapping.service");

// ============================================================================
// Generate Student Mapping
// ============================================================================
const generateMapping = asyncHandler(async (req, res) => {
  const result = await mappingService.generateMapping();

  return res.status(200).json({
    success: true,
    message: "Student mapping generated successfully.",
    data: result,
  });
});

// ============================================================================
// Assign Primary Mentor
// ============================================================================
const assignPrimaryMentor = asyncHandler(async (req, res) => {
  const { groupId, mentorId } = req.body;

  const group = await mappingService.assignPrimaryMentor(groupId, mentorId);

  return res.status(200).json({
    success: true,
    message: "Primary mentor assigned successfully.",
    data: group,
  });
});

// ============================================================================
// Assign Backup Mentor
// ============================================================================
const assignBackupMentor = asyncHandler(async (req, res) => {
  const { groupId, mentorId } = req.body;

  const group = await mappingService.assignBackupMentor(groupId, mentorId);

  return res.status(200).json({
    success: true,
    message: "Backup mentor assigned successfully.",
    data: group,
  });
});

// ============================================================================
// Get Group Mapping
// ============================================================================
// ============================================================================
// Get Group Mapping
// ============================================================================
const getGroupMapping = asyncHandler(async (req, res) => {
  const { instituteId, programId, batch, semester, section, groupName } =
    req.query;

  const group = await mappingService.getGroupMapping(
    instituteId,
    programId,
    batch,
    semester,
    section,
    groupName,
  );

  return res.status(200).json({
    success: true,
    data: group,
  });
});

// ============================================================================
// Export Controller
// ============================================================================

module.exports = Object.freeze({
  generateMapping,
  assignPrimaryMentor,
  assignBackupMentor,
  getGroupMapping,
});
