const Program = require("../models/Program");

// ============================================================================
// Create Program
// ============================================================================
const createProgram = (payload) => {
  return Program.create(payload);
};

// ============================================================================
// Get All Programs
// ============================================================================
const getAllPrograms = () => {
  return Program.find({
    isDeleted: false,
  })
    .populate("institute", "name code")
    .sort({
      name: 1,
    });
};

// ============================================================================
// Get Program By Id
// ============================================================================
const getProgramById = (id) => {
  return Program.findOne({
    _id: id,
    isDeleted: false,
  }).populate("institute", "name code");
};

// ============================================================================
// Get Program By Code
// ============================================================================
const getProgramByCode = (code) => {
  return Program.findOne({
    code: code.toUpperCase(),
    isDeleted: false,
  }).populate("institute", "name code");
};

// ============================================================================
// Get Programs By Institute
// ============================================================================
const getProgramsByInstitute = (instituteId) => {
  return Program.find({
    institute: instituteId,
    isDeleted: false,
  }).sort({
    name: 1,
  });
};

// ============================================================================
// Update Program
// ============================================================================
const updateProgram = (id, payload) => {
  return Program.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });
};

// ============================================================================
// Soft Delete Program
// ============================================================================
const deleteProgram = (id) => {
  return Program.findByIdAndUpdate(
    id,
    {
      isDeleted: true,
      isActive: false,
    },
    {
      new: true,
    },
  );
};

module.exports = Object.freeze({
  createProgram,
  getAllPrograms,
  getProgramById,

  getProgramsByInstitute,
  updateProgram,
  deleteProgram,
  getProgramByCode,
});
