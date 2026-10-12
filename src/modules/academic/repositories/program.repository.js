"use strict";

const Program = require("../models/Program");

// ============================================================
// Create Program
// ============================================================

const createProgram = (payload) => {
  return Program.create(payload);
};

// ============================================================
// Get All Programs
// ============================================================

const getAllPrograms = () => {
  return Program.find({
    isDeleted: false,
  })
    .populate("institute", "name code")
    .sort({ name: 1 });
};

// ============================================================
// Get Program By ID
// ============================================================

const getProgramById = (id) => {
  return Program.findOne({
    _id: id,
    isDeleted: false,
  }).populate("institute", "name code");
};

// ============================================================
// Get Program By Code
// ============================================================

const getProgramByCode = (code) => {
  return Program.findOne({
    code: String(code).trim().toUpperCase(),
    isDeleted: false,
  }).populate("institute", "name code");
};

// ============================================================
// Get Program By Code And Institute
// ============================================================

const getProgramByCodeAndInstitute = (code, instituteId) => {
  return Program.findOne({
    code: String(code).trim().toUpperCase(),
    institute: instituteId,
    isDeleted: false,
  });
};
// ============================================================
// Get Programs By Institute
// ============================================================

const getProgramsByInstitute = (instituteId) => {
  return Program.find({
    institute: instituteId,
    isDeleted: false,
  }).sort({ name: 1 });
};

// ============================================================
// Update Program
// ============================================================

const updateProgram = (id, payload) => {
  return Program.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });
};

// ============================================================
// Soft Delete Program
// ============================================================

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

const getProgramByCodeAndInstituteIncludingInactive = (code, instituteId) => {
  return Program.findOne({
    code: String(code).trim().toUpperCase(),
    institute: instituteId,
    isDeleted: false,
  });
};
// ============================================================
// Exports
// ============================================================

module.exports = Object.freeze({
  createProgram,
  getAllPrograms,
  getProgramById,
  getProgramByCode,
  getProgramByCodeAndInstitute,
  getProgramByCodeAndInstituteIncludingInactive,
  getProgramsByInstitute,
  updateProgram,
  deleteProgram,
});
