"use strict";

const Admin = require("../models/Admin");

// ==========================================
// CREATE ADMIN
// ==========================================

const createAdmin = (payload) => {
  return Admin.create(payload);
};

// ==========================================
// FIND ADMIN BY EMAIL
// ==========================================

const findAdminByEmail = (email) => {
  return Admin.findOne({ email }).select("+password +refreshToken");
};

// ==========================================
// FIND ADMIN BY ID
// ==========================================

const findAdminById = (id) => {
  return Admin.findById(id);
};

// ==========================================
// FIND ADMIN BY EMPLOYEE ID
// ==========================================

const findAdminByEmployeeId = (employeeId) => {
  return Admin.findOne({ employeeId });
};

// ==========================================
// UPDATE ADMIN
// ==========================================

const updateAdmin = (id, payload) => {
  return Admin.findByIdAndUpdate(id, payload, {
    returnDocument: "after",
  });
};

// ==========================================
// DELETE ADMIN
// ==========================================

const deleteAdmin = (id) => {
  return Admin.findByIdAndDelete(id);
};

// ==========================================
// EXPORT
// ==========================================

module.exports = Object.freeze({
  createAdmin,
  findAdminByEmail,
  findAdminById,
  findAdminByEmployeeId,
  updateAdmin,
  deleteAdmin,
});
