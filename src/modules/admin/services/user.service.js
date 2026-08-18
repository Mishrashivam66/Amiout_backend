"use strict";

const { ROLES } = require("../../auth/constants");

const mongoose = require("mongoose");

const userRepository = require("../repositories/user.repository");

class UserService {
  // ============================================================================
  // Get All Users
  // ============================================================================
  async getAllUsers() {
    return userRepository.getAllUsers();
  }

  // ============================================================================
  // Get User By ID
  // ============================================================================
  async getUserById(userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user id.");
    }

    const user = await userRepository.getUserById(userId);

    if (!user) {
      throw new Error("User not found.");
    }

    return user;
  }

  // ============================================================================
  // Activate User
  // ============================================================================
  async activateUser(userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user id.");
    }

    const user = await userRepository.activateUser(userId);

    if (!user) {
      throw new Error("User not found.");
    }

    return user;
  }

  // ============================================================================
  // Deactivate User
  // ============================================================================
  async deactivateUser(userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user id.");
    }

    const user = await userRepository.deactivateUser(userId);

    if (!user) {
      throw new Error("User not found.");
    }

    return user;
  }

  // ============================================================================
  // Count Users
  // ============================================================================
  async countUsers(filters = {}) {
    return userRepository.countUsers(filters);
  }
}

module.exports = Object.freeze(new UserService());
