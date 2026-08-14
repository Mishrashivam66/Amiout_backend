const Institute = require("../models/Institute");

// ============================================================================
// Create Institute
// ============================================================================
const createInstitute = (payload) => {
  return Institute.create(payload);
};

// ============================================================================
// Get All Institutes
// ============================================================================
const getAllInstitutes = () => {
  return Institute.find({
    isDeleted: false,
  }).sort({
    name: 1,
  });
};

// ============================================================================
// Get Institute By Id
// ============================================================================
const getInstituteById = (id) => {
  return Institute.findOne({
    _id: id,
    isDeleted: false,
  });
};

// ============================================================================
// Get Institute By Code
// ============================================================================
const getInstituteByCode = (code) => {
  return Institute.findOne({
    code: code.toUpperCase(),
    isDeleted: false,
  });
};

// ============================================================================
// Update Institute
// ============================================================================
const updateInstitute = (id, payload) => {
  return Institute.findByIdAndUpdate(id, payload, {
    returnDocument: "after",
    runValidators: true,
  });
};

// ============================================================================
// Soft Delete Institute
// ============================================================================
const deleteInstitute = (id) => {
  return Institute.findByIdAndUpdate(
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

// ============================================================================
// Get Institute By Code
// ============================================================================

module.exports = Object.freeze({
  createInstitute,
  getAllInstitutes,
  getInstituteById,
  getInstituteByCode,
  updateInstitute,
  deleteInstitute,
});
