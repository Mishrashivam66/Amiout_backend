"use strict";
const User = require("../../auth/models/User");

class UserRepository {
  // ============================================================================
  // Get All Users
  // ============================================================================
  async getAllUsers(filters = {}) {
    const totalUsers = await User.countDocuments({});
    const users = await User.find(filters);
    return users;
  }

  // ============================================================================
  // Get User By ID
  // ============================================================================
  async getUserById(userId) {
    return User.findById(userId)
      .populate("institute", "name")
      .populate("program", "name code")
      .populate("primaryMentor", "name");
  }

  // ============================================================================
  // Activate User
  // ============================================================================
  async activateUser(userId) {
    return User.findByIdAndUpdate(
      userId,
      {
        isActive: true,
      },
      {
        new: true,
      },
    );
  }

  // ============================================================================
  // Deactivate User
  // ============================================================================
  async deactivateUser(userId) {
    return User.findByIdAndUpdate(
      userId,
      {
        isActive: false,
      },
      {
        new: true,
      },
    );
  }

  // ============================================================================
  // Count Users
  // ============================================================================
  async countUsers(filters = {}) {
    return User.countDocuments(filters);
  }
}

module.exports = Object.freeze(new UserRepository());
