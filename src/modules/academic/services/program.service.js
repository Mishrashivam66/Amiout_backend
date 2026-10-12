"use strict";

const mongoose = require("mongoose");

const programRepository = require("../repositories/program.repository");
const instituteRepository = require("../repositories/institute.repository");

// ============================================================================
// Helpers
// ============================================================================

const normalizeCode = (code) =>
  String(code || "")
    .trim()
    .toUpperCase();

const validateInstitute = async (instituteId) => {
  if (!mongoose.isValidObjectId(instituteId)) {
    throw new Error("Valid Institute ID is required.");
  }

  const institute = await instituteRepository.getInstituteById(instituteId);

  if (!institute || institute.isDeleted || institute.isActive === false) {
    throw new Error("Institute not found or inactive.");
  }

  return institute;
};

const validateProgramPayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Program data is required.");
  }

  const code = normalizeCode(payload.code);

  if (!code) {
    throw new Error("Program code is required.");
  }

  if (!String(payload.name || "").trim()) {
    throw new Error("Program name is required.");
  }

  if (!String(payload.degree || "").trim()) {
    throw new Error("Degree is required.");
  }

  return code;
};

// ============================================================================
// Create Program
// ============================================================================

const createProgram = async (payload) => {
  const code = validateProgramPayload(payload);

  const institute = await validateInstitute(payload.institute);

  const existingProgram = await programRepository.getProgramByCodeAndInstitute(
    code,
    institute._id,
  );

  if (existingProgram) {
    throw new Error(`Program '${code}' already exists for this institute.`);
  }

  return programRepository.createProgram({
    institute: institute._id,
    name: String(payload.name).trim(),
    code,
    degree: String(payload.degree).trim(),
    duration: payload.duration,
    totalSemesters: payload.totalSemesters,
    isActive: true,
    isDeleted: false,
  });
};

// ============================================================================
// Get All Programs
// ============================================================================

const getAllPrograms = async () => {
  return programRepository.getAllPrograms();
};

// ============================================================================
// Get Program By ID
// ============================================================================

const getProgramById = async (id) => {
  const program = await programRepository.getProgramById(id);

  if (!program) {
    throw new Error("Program not found.");
  }

  return program;
};

// ============================================================================
// Get Programs By Institute
// ============================================================================

const getProgramsByInstitute = async (instituteId) => {
  await validateInstitute(instituteId);

  return programRepository.getProgramsByInstitute(instituteId);
};

// ============================================================================
// Update Program
// ============================================================================

const updateProgram = async (id, payload) => {
  const existingProgram = await programRepository.getProgramById(id);

  if (!existingProgram) {
    throw new Error("Program not found.");
  }

  const updateData = { ...payload };

  const instituteId =
    updateData.institute ||
    existingProgram.institute?._id ||
    existingProgram.institute;

  const institute = await validateInstitute(instituteId);

  if (updateData.code !== undefined) {
    updateData.code = normalizeCode(updateData.code);

    if (!updateData.code) {
      throw new Error("Program code cannot be empty.");
    }
  }

  const finalCode = updateData.code || existingProgram.code;

  const duplicate = await programRepository.getProgramByCodeAndInstitute(
    finalCode,
    institute._id,
  );

  if (duplicate && String(duplicate._id) !== String(existingProgram._id)) {
    throw new Error(
      `Program '${finalCode}' already exists for this institute.`,
    );
  }

  updateData.institute = institute._id;

  // Prevent modifying system-managed fields.
  delete updateData._id;
  delete updateData.isDeleted;

  return programRepository.updateProgram(id, updateData);
};

// ============================================================================
// Delete Program
// ============================================================================

const deleteProgram = async (id) => {
  const program = await programRepository.getProgramById(id);

  if (!program) {
    throw new Error("Program not found.");
  }

  return programRepository.deleteProgram(id);
};

// ============================================================================
// Exports
// ============================================================================

module.exports = Object.freeze({
  createProgram,
  getAllPrograms,
  getProgramById,
  getProgramsByInstitute,
  updateProgram,
  deleteProgram,
});
