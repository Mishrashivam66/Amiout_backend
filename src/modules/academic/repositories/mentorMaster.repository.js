const MentorMaster = require("../models/MentorMaster");

// ============================================================================
// Create Mentor
// ============================================================================
const createMentor = (payload) => {
  return MentorMaster.create(payload);
};

// ============================================================================
// Bulk Insert Mentors
// ============================================================================

const insertManyMentors = (payload) => {
  return MentorMaster.insertMany(payload, {
    ordered: false,
  });
};

// ============================================================================
// Get All Mentors
// ============================================================================
const getAllMentors = () => {
  return MentorMaster.find({
    isDeleted: false,
  }).sort({
    name: 1,
  });
};

// ============================================================================
// Get Mentor By Id
// ============================================================================
const getMentorById = (id) => {
  return MentorMaster.findOne({
    _id: id,
    isDeleted: false,
  });
};

// ============================================================================
// Get Mentor By Employee ID
// ============================================================================
const getMentorByEmployeeId = (employeeId) => {
  if (!employeeId) return null;

  return MentorMaster.findOne({
    employeeId: employeeId.toUpperCase(),
    isDeleted: false,
  });
};

// ============================================================================
// Get Mentors By Program
// ============================================================================
const getMentorsByCourse = (course) => {
  return MentorMaster.find({
    course,
    isDeleted: false,
  }).sort({
    name: 1,
  });
};

// ============================================================================
// Get Mentors By Section
// ============================================================================
const getMentorsBySemester = (semester, section) => {
  return MentorMaster.find({
    semester,
    section,
    isDeleted: false,
  }).sort({
    name: 1,
  });
};

// ============================================================================
// Get Mentor By Group
// ============================================================================
const getMentorByGroup = (semester, section, group) => {
  return MentorMaster.findOne({
    semester,
    section,
    group,
    isDeleted: false,
  });
};

// ============================================================================
// Update Mentor
// ============================================================================
const updateMentor = (id, payload) => {
  return MentorMaster.findByIdAndUpdate(id, payload, {
    returnDocument: "after",
    runValidators: true,
  });
};

// ============================================================================
// Soft Delete Mentor
// ============================================================================
const deleteMentor = (id) => {
  return MentorMaster.findByIdAndUpdate(
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
// Get Mentor By Details
// ============================================================================

const getMentorByDetails = ({
  mentorName,
  mentorEmail,
  semester,
  section,
  group,
}) => {
  return MentorMaster.findOne({
    name: mentorName,
    mentorEmail,
    semester,
    section,
    group,
    isDeleted: false,
  });
};

module.exports = Object.freeze({
  createMentor,
  insertManyMentors,
  getAllMentors,
  getMentorById,
  getMentorByDetails,
  getMentorByEmployeeId,
  getMentorsByCourse,
  getMentorsBySemester,
  getMentorByGroup,
  updateMentor,
  deleteMentor,
});
