const Group = require("../models/Group");

// ============================================================================
// Create Group
// ============================================================================
const createGroup = (payload) => {
  return Group.create(payload);
};

// ============================================================================
// Bulk Insert Groups
// ============================================================================
const insertManyGroups = (payload) => {
  return Group.insertMany(payload, {
    ordered: false,
  });
};

// ============================================================================
// Get All Groups
// ============================================================================
const getAllGroups = () => {
  return Group.find({
    isDeleted: false,
    isActive: true,
  })
    .populate("institute", "name code")
    .populate("program", "name code")
    .populate("primaryMentor", "name employeeId")
    .populate("backupMentor", "name employeeId")
    .sort({
      semester: 1,
      section: 1,
      groupName: 1,
    });
};

// ============================================================================
// Get Group By Id
// ============================================================================
const getGroupById = (id) => {
  return Group.findOne({
    _id: id,
    isDeleted: false,
    isActive: true,
  })
    .populate("institute", "name code")
    .populate("program", "name code")
    .populate("primaryMentor", "name employeeId")
    .populate("backupMentor", "name employeeId");
};

// ============================================================================
// Get Group
// ============================================================================
const getGroup = (
  instituteId,
  programId,
  batch,
  semester,
  section,
  groupName,
) => {
  return Group.findOne({
    institute: instituteId,
    program: programId,
    batch,
    semester,
    section,
    groupName,
    isDeleted: false,
    isActive: true,
  })
    .populate("primaryMentor", "name employeeId")
    .populate("backupMentor", "name employeeId");
};

// ============================================================================
// Get Groups By Program
// ============================================================================
const getGroupsByProgram = (programId) => {
  return Group.find({
    program: programId,
    isDeleted: false,
    isActive: true,
  }).sort({
    semester: 1,
    section: 1,
    groupName: 1,
  });
};

// ============================================================================
// Update Group
// ============================================================================
const updateGroup = (id, payload) => {
  return Group.findByIdAndUpdate(id, payload, {
    returnDocument: "after",
    runValidators: true,
  });
};

// ============================================================================
// Soft Delete Group
// ============================================================================
const deleteGroup = (id) => {
  return Group.findByIdAndUpdate(
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
  createGroup,
  insertManyGroups,
  getAllGroups,
  getGroupById,
  getGroup,
  getGroupsByProgram,
  updateGroup,
  deleteGroup,
});
