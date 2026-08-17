const asyncHandler = require("express-async-handler");

const mentorImportService = require("../services/mentorImport.service");

// ============================================================================
// Import Mentors
// ============================================================================
const importMentors = asyncHandler(async (req, res) => {
  console.log("========== IMPORT ==========");
  console.log("req.file =", req.file);
  console.log("req.body =", req.body);

  const result = await mentorImportService.importMentors(req.body.mentors);

  return res.status(201).json({
    success: true,
    message: "Mentors imported successfully.",
    data: result,
  });
});

// ============================================================================
// Get All Mentors
// ============================================================================
const getAllMentors = asyncHandler(async (req, res) => {
  const mentors = await mentorImportService.getAllMentors();

  return res.status(200).json({
    success: true,
    count: mentors.length,
    data: mentors,
  });
});

// ============================================================================
// Get Mentor By Employee ID
// ============================================================================
const getMentorByEmployeeId = asyncHandler(async (req, res) => {
  const mentor = await mentorImportService.getMentorByEmployeeId(
    req.params.employeeId,
  );

  return res.status(200).json({
    success: true,
    data: mentor,
  });
});

// ============================================================================
// Update Mentor
// ============================================================================
const updateMentor = asyncHandler(async (req, res) => {
  const mentor = await mentorImportService.updateMentor(
    req.params.id,
    req.body,
  );

  return res.status(200).json({
    success: true,
    message: "Mentor updated successfully.",
    data: mentor,
  });
});

// ============================================================================
// Delete Mentor
// ============================================================================
const deleteMentor = asyncHandler(async (req, res) => {
  await mentorImportService.deleteMentor(req.params.id);

  return res.status(200).json({
    success: true,
    message: "Mentor deleted successfully.",
  });
});

// ============================================================================
// Export Controller
// ============================================================================

module.exports = Object.freeze({
  importMentors,
  getAllMentors,
  getMentorByEmployeeId,
  updateMentor,
  deleteMentor,
});
