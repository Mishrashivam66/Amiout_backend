const asyncHandler = require("express-async-handler");

const programService = require("../services/program.service");



// ============================================================================
// Create Program
// ============================================================================
const createProgram = asyncHandler(async (req, res) => {
  const program = await programService.createProgram(req.body);

  return res.status(201).json({
    success: true,
    message: "Program created successfully.",
    data: program,
  });
});

// ============================================================================
// Get All Programs
// ============================================================================
const getAllPrograms = asyncHandler(async (req, res) => {
  const programs = await programService.getAllPrograms();

  return res.status(200).json({
    success: true,
    count: programs.length,
    data: programs,
  });
});

// ============================================================================
// Get Program By Id
// ============================================================================
const getProgramById = asyncHandler(async (req, res) => {
  const program = await programService.getProgramById(req.params.id);

  return res.status(200).json({
    success: true,
    data: program,
  });
});

// ============================================================================
// Get Programs By Institute
// ============================================================================
const getProgramsByInstitute = asyncHandler(async (req, res) => {
  const programs = await programService.getProgramsByInstitute(
    req.params.instituteId,
  );

  return res.status(200).json({
    success: true,
    count: programs.length,
    data: programs,
  });
});

// ============================================================================
// Update Program
// ============================================================================
const updateProgram = asyncHandler(async (req, res) => {
  const program = await programService.updateProgram(req.params.id, req.body);

  return res.status(200).json({
    success: true,
    message: "Program updated successfully.",
    data: program,
  });
});

// ============================================================================
// Delete Program
// ============================================================================
const deleteProgram = asyncHandler(async (req, res) => {
  await programService.deleteProgram(req.params.id);

  return res.status(200).json({
    success: true,
    message: "Program deleted successfully.",
  });
});

// ============================================================================
// Export Controller
// ============================================================================

module.exports = Object.freeze({
  createProgram,
  getAllPrograms,
  getProgramById,
  getProgramsByInstitute,
  updateProgram,
  deleteProgram,
});
