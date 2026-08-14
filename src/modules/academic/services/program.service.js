const programRepository = require("../repositories/program.repository");
const instituteRepository = require("../repositories/institute.repository");

// ============================================================================
// Create Program
// ============================================================================
const createProgram = async (payload) => {
  const institute = await instituteRepository.getInstituteById(
    payload.institute,
  );

  if (!institute) {
    throw new Error("Institute not found.");
  }

  const existingProgram = await programRepository.getProgramByCode(
    payload.code,
  );

  if (existingProgram) {
    throw new Error("Program already exists.");
  }

  return programRepository.createProgram(payload);
};

// ============================================================================
// Get All Programs
// ============================================================================
const getAllPrograms = async () => {
  return programRepository.getAllPrograms();
};

// ============================================================================
// Get Program By Id
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
  return programRepository.getProgramsByInstitute(instituteId);
};

// ============================================================================
// Update Program
// ============================================================================
const updateProgram = async (id, payload) => {
  const program = await programRepository.getProgramById(id);

  if (!program) {
    throw new Error("Program not found.");
  }

  return programRepository.updateProgram(id, payload);
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

module.exports = Object.freeze({
  createProgram,
  getAllPrograms,
  getProgramById,
  getProgramsByInstitute,
  updateProgram,
  deleteProgram,
});
