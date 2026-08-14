const asyncHandler = require("express-async-handler");

const userService = require("../services/user.service");

// ============================================================================
// Get All Users
// ============================================================================
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await userService.getAllUsers();

  return res.status(200).json({
    success: true,
    message: "Users fetched successfully.",
    count: users.length,
    data: users,
  });
});
// ============================================================================
// Get User By ID
// ============================================================================
const getUserById = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id);

  return res.status(200).json({
    success: true,
    message: "User fetched successfully.",
    data: user,
  });
});

// ============================================================================
// Activate User
// ============================================================================
const activateUser = asyncHandler(async (req, res) => {
  const user = await userService.activateUser(req.params.id);

  return res.status(200).json({
    success: true,
    message: "User activated successfully.",
    data: user,
  });
});

// ============================================================================
// Deactivate User
// ============================================================================
const deactivateUser = asyncHandler(async (req, res) => {
  const user = await userService.deactivateUser(req.params.id);

  return res.status(200).json({
    success: true,
    message: "User deactivated successfully.",
    data: user,
  });
});

module.exports = Object.freeze({
  getAllUsers,
  getUserById,
  activateUser,
  deactivateUser,
});
