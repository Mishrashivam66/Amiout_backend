const asyncHandler = require("express-async-handler");

const groupService = require("../services/group.service");


// ============================================================================
// Create Group
// ============================================================================
const createGroup = asyncHandler(async (req, res) => {
  const group = await groupService.createGroup(req.body);

  return res.status(201).json({
    success: true,
    message: "Group created successfully.",
    data: group,
  });
});

// ============================================================================
// Get All Groups
// ============================================================================
const getAllGroups = asyncHandler(async (req, res) => {
  const groups = await groupService.getAllGroups({
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search,
    sortBy: req.query.sortBy,
    order: req.query.order,
  });

  return res.status(200).json({
    success: true,
    message: "Groups fetched successfully.",
    count: groups.length,
    data: groups,
  });
});

// ============================================================================
// Get Group By Id
// ============================================================================
const getGroupById = asyncHandler(async (req, res) => {
  const group = await groupService.getGroupById(req.params.id);

  return res.status(200).json({
    success: true,
    data: group,
  });
});

// ============================================================================
// Update Group
// ============================================================================
const updateGroup = asyncHandler(async (req, res) => {
  const group = await groupService.updateGroup(req.params.id, req.body);

  return res.status(200).json({
    success: true,
    message: "Group updated successfully.",
    data: group,
  });
});

// ============================================================================
// Delete Group
// ============================================================================
const deleteGroup = asyncHandler(async (req, res) => {
  await groupService.deleteGroup(req.params.id);

  return res.status(200).json({
    success: true,
    message: "Group deleted successfully.",
  });
});

module.exports = Object.freeze({
  createGroup,
  getAllGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
});
