"use strict";

const Mentor = require("../models/MentorMaster");
// ============================================================================
// Find All Mentors
// ============================================================================

const findAll = async (filters = {}) => {
  return await Mentor.find({
    isDeleted: false,
    ...filters,
  })
    .sort({
      createdAt: -1,
    })
    .lean();
};

// ============================================================================
// Find Mentor By ID
// ============================================================================

const findById = async (id) => {
  return await Mentor.findOne({
    _id: id,
    isDeleted: false,
  });
};

// ============================================================================
// Create Mentor
// ============================================================================

const create = async (mentorData) => {
  return await Mentor.create(mentorData);
};

// ============================================================================
// Update Mentor
// ============================================================================

const update = async (id, mentorData) => {
  return await Mentor.findOneAndUpdate(
    {
      _id: id,
      isDeleted: false,
    },
    mentorData,
    {
      returnDocument: "after",
      runValidators: true,
    },
  );
};
// ============================================================================
// Soft Delete Mentor
// ============================================================================

const softDelete = async (id) => {
  return await Mentor.findOneAndUpdate(
    {
      _id: id,
    },
    {
      isDeleted: true,
    },
    {
      new: true,
    },
  );
};

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  findAll,
  findById,
  create,
  update,
  softDelete,
});
