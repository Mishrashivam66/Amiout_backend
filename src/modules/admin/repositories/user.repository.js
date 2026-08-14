"use strict";
const StudentMaster = require("../../academic/models/StudentMaster");

class UserRepository {
  // ============================================================================
  // Get All Users
  // ============================================================================
  async getAllUsers(filters = {}) {
    const users = await StudentMaster.find(filters)
      .populate("institute", "name")
      .populate("program", "name code")
      .populate("primaryMentor", "name")
      .sort({ createdAt: -1 });
    return users;
  }

  // ============================================================================
  // Get User By ID
  // ============================================================================
  async getUserById(userId) {
    return StudentMaster.findById(userId)
      .populate("institute", "name")
      .populate("program", "name code")
      .populate("primaryMentor", "name");
  }

  // ============================================================================
  // Activate User
  // ============================================================================
  async activateUser(userId) {
    return StudentMaster.findByIdAndUpdate(
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
    return StudentMaster.findByIdAndUpdate(
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
    return StudentMaster.countDocuments(filters);
  }
}

module.exports = Object.freeze(new UserRepository());
