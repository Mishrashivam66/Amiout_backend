const groupRepository = require("../repositories/group.repository");

// ============================================================================
// Create Group
// ============================================================================
const createGroup = async (payload) => {
  const existingGroup = await groupRepository.getGroup(
    payload.institute,
    payload.program,
    payload.batch,
    payload.semester,
    payload.section,
    payload.groupName,
  );

  if (existingGroup) {
    throw new Error("Group already exists.");
  }

  return groupRepository.createGroup(payload);
};

// ============================================================================
// Get All Groups
// ============================================================================
const getAllGroups = async () => {
  return groupRepository.getAllGroups();
};

// ============================================================================
// Get Group By Id
// ============================================================================
const getGroupById = async (id) => {
  const group = await groupRepository.getGroupById(id);

  if (!group) {
    throw new Error("Group not found.");
  }

  return group;
};

// ============================================================================
// Update Group
// ============================================================================
const updateGroup = async (id, payload) => {
  const group = await groupRepository.getGroupById(id);

  if (!group) {
    throw new Error("Group not found.");
  }

  return groupRepository.updateGroup(id, payload);
};

// ============================================================================
// Delete Group
// ============================================================================
const deleteGroup = async (id) => {
  const group = await groupRepository.getGroupById(id);

  if (!group) {
    throw new Error("Group not found.");
  }

  return groupRepository.deleteGroup(id);
};

module.exports = Object.freeze({
  createGroup,
  getAllGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
});
