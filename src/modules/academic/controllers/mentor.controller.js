"use strict";

const asyncHandler = require("express-async-handler");

const mentorService = require("../services/mentor.service");

// ============================================================================
// Get All Mentors
// ============================================================================
const getAllMentors = asyncHandler(async (req, res) => {
  const mentors = await mentorService.getAllMentors();

  return res.status(200).json({
    success: true,
    message: "Mentors fetched successfully.",
    data: mentors,
  });
});

// ============================================================================
// Get Mentor By ID
// ============================================================================
const getMentorById = asyncHandler(async (req, res) => {
  const mentor = await mentorService.getMentorById(req.params.id);

  return res.status(200).json({
    success: true,
    message: "Mentor fetched successfully.",
    data: mentor,
  });
});

// ============================================================================
// Create Mentor
// ============================================================================
const createMentor = asyncHandler(async (req, res) => {
  const mentor = await mentorService.createMentor(req.body);

  return res.status(201).json({
    success: true,
    message: "Mentor created successfully.",
    data: mentor,
  });
});

// ============================================================================
// Update Mentor
// ============================================================================
const updateMentor = asyncHandler(async (req, res) => {
  const mentor = await mentorService.updateMentor(req.params.id, req.body);

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
  await mentorService.deleteMentor(req.params.id);

  return res.status(200).json({
    success: true,
    message: "Mentor deleted successfully.",
  });
});

module.exports = Object.freeze({
  getAllMentors,
  getMentorById,
  createMentor,
  updateMentor,
  deleteMentor,
});
