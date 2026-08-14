const StudentMaster = require("../models/StudentMaster");

// ============================================================================
// Create Student
// ============================================================================
const createStudent = (payload) => {
  return StudentMaster.create(payload);
};

// ============================================================================
// Bulk Insert Students
// ============================================================================
const insertManyStudents = (payload) => {
  return StudentMaster.insertMany(payload, {
    ordered: false,
  });
};

// ============================================================================
// Get All Students
// ============================================================================
const getAllStudents = () => {
  return StudentMaster.find({
    isDeleted: false,
  })
    .populate("institute", "name code")
    .populate("program", "name code")
    .sort({
      name: 1,
    });
};

// ============================================================================
// Get Student By Id
// ============================================================================
const getStudentById = (id) => {
  return StudentMaster.findOne({
    _id: id,
    isDeleted: false,
  })
    .populate("institute", "name code")
    .populate("program", "name code");
};

// ============================================================================
// Get Student By Enrollment Number
// ============================================================================
const getStudentByEnrollment = (enrollmentNumber) => {
  return StudentMaster.findOne({
    enrollmentNumber: enrollmentNumber.toUpperCase(),
    isDeleted: false,
  })
    .populate("institute", "name code")
    .populate("program", "name code");
};

// ============================================================================
// Get Student By Roll Number
// ============================================================================
const getStudentByRollNumber = (rollNumber) => {
  return StudentMaster.findOne({
    rollNumber,
    isDeleted: false,
  });
};

// ============================================================================
// Get Students By Program
// ============================================================================
const getStudentsByProgram = (programId) => {
  return StudentMaster.find({
    program: programId,
    isDeleted: false,
  }).sort({
    name: 1,
  });
};

// ============================================================================
// Get Students By Section
// ============================================================================
const getStudentsBySection = (programId, semester, section) => {
  return StudentMaster.find({
    program: programId,
    semester,
    section,
    isDeleted: false,
  }).sort({
    name: 1,
  });
};

// ============================================================================
// Get Students By Group
// ============================================================================
const getStudentsByGroup = (programId, semester, section, group) => {
  return StudentMaster.find({
    program: programId,
    semester,
    section,
    group,
    isDeleted: false,
  }).sort({
    name: 1,
  });
};

// ============================================================================
// Update Student
// ============================================================================
const updateStudent = (id, payload) => {
  return StudentMaster.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });
};

// ============================================================================
// Soft Delete Student
// ============================================================================
const deleteStudent = (id) => {
  return StudentMaster.findByIdAndUpdate(
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
  createStudent,
  insertManyStudents,
  getAllStudents,
  getStudentById,
  getStudentByEnrollment,
  getStudentByRollNumber,
  getStudentsByProgram,
  getStudentsBySection,
  getStudentsByGroup,
  updateStudent,
  deleteStudent,
});
