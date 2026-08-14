const instituteRepository = require("../repositories/institute.repository");


// ============================================================================
// Create Institute
// ============================================================================
const createInstitute = async (payload) => {
  const existingInstitute = await instituteRepository.getInstituteByCode(
    payload.code,
  );

  if (existingInstitute) {
    throw new Error("Institute already exists.");
  }

  return instituteRepository.createInstitute(payload);
};

// ============================================================================
// Get All Institutes
// ============================================================================
const getAllInstitutes = async () => {
  return instituteRepository.getAllInstitutes();
};

// ============================================================================
// Get Institute By Id
// ============================================================================
const getInstituteById = async (id) => {
  const institute = await instituteRepository.getInstituteById(id);

  if (!institute) {
    throw new Error("Institute not found.");
  }

  return institute;
};

// ============================================================================
// Update Institute
// ============================================================================
const updateInstitute = async (id, payload) => {
  const institute = await instituteRepository.getInstituteById(id);

  if (!institute) {
    throw new Error("Institute not found.");
  }

  return instituteRepository.updateInstitute(id, payload);
};

// ============================================================================
// Delete Institute
// ============================================================================
const deleteInstitute = async (id) => {
  const institute = await instituteRepository.getInstituteById(id);

  if (!institute) {
    throw new Error("Institute not found.");
  }

  return instituteRepository.deleteInstitute(id);
};

module.exports = Object.freeze({
  createInstitute,
  getAllInstitutes,
  getInstituteById,
  updateInstitute,
  deleteInstitute,
});
