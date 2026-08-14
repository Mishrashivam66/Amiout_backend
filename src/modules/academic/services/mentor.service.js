"use strict";

const MentorRepository = require("../repositories/mentor.repository");

// ============================================================================
// Get All Mentors
// ============================================================================

const getAllMentors = async () => {
  return await MentorRepository.findAll();
};

// ============================================================================
// Get Mentor By ID
// ============================================================================

const getMentorById = async (id) => {
  return await MentorRepository.findById(id);
};

// ============================================================================
// Create Mentor
// ============================================================================

const createMentor = async (mentorData) => {
  return await MentorRepository.create(mentorData);
};

// ============================================================================
// Update Mentor
// ============================================================================

const updateMentor = async (id, mentorData) => {
  return await MentorRepository.update(id, mentorData);
};

// ============================================================================
// Delete Mentor (Soft Delete)
// ============================================================================

const deleteMentor = async (id) => {
  return await MentorRepository.softDelete(id);
};

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  getAllMentors,
  getMentorById,
  createMentor,
  updateMentor,
  deleteMentor,
});
