const asyncHandler = require("express-async-handler");

const instituteService = require("../services/institute.service");


// ============================================================================
// Create Institute
// ============================================================================
const createInstitute = asyncHandler(async (req, res) => {
  const institute = await instituteService.createInstitute(req.body);

  return res.status(201).json({
    success: true,
    message: "Institute created successfully.",
    data: institute,
  });
});

// ============================================================================
// Get All Institutes
// ============================================================================
const getAllInstitutes = asyncHandler(async (req, res) => {
  const institutes = await instituteService.getAllInstitutes();

  return res.status(200).json({
    success: true,
    count: institutes.length,
    data: institutes,
  });
});

// ============================================================================
// Get Institute By Id
// ============================================================================
const getInstituteById = asyncHandler(async (req, res) => {
  const institute = await instituteService.getInstituteById(req.params.id);

  return res.status(200).json({
    success: true,
    data: institute,
  });
});

// ============================================================================
// Update Institute
// ============================================================================
const updateInstitute = asyncHandler(async (req, res) => {
  const institute = await instituteService.updateInstitute(
    req.params.id,
    req.body,
  );

  return res.status(200).json({
    success: true,
    message: "Institute updated successfully.",
    data: institute,
  });
});

// ============================================================================
// Delete Institute
// ============================================================================
const deleteInstitute = asyncHandler(async (req, res) => {
  await instituteService.deleteInstitute(req.params.id);

  return res.status(200).json({
    success: true,
    message: "Institute deleted successfully.",
  });
});

// ============================================================================
// Export Controller
// ============================================================================

module.exports = Object.freeze({
  createInstitute,
  getAllInstitutes,
  getInstituteById,
  updateInstitute,
  deleteInstitute,
});
