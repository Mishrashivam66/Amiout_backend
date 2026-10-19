"use strict";

const asyncHandler = require("express-async-handler");

const superAdminService = require("../services/superAdmin.service");

// ============================================================
// AMIOUT ENTERPRISE - SUPER ADMIN CONTROLLER
// ============================================================

const getActorId = (req) => {
  return req.user?._id || req.user?.id || null;
};

// ============================================================
// POST /api/v1/super-admin/admins
// ============================================================

const createAdmin = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const result = await superAdminService.createAdmin(getActorId(req), req.body);

  return res.status(201).json({
    success: true,
    message: "Admin account created successfully.",
    data: result,
  });
});

// ============================================================
// GET /api/v1/super-admin/admins
// ============================================================

const getAdmins = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const result = await superAdminService.getAdmins(getActorId(req));

  return res.status(200).json({
    success: true,
    message: "Admin accounts fetched successfully.",
    data: result,
  });
});

// ============================================================
// PATCH /api/v1/super-admin/admins/:id/status
// ============================================================

const changeAdminStatus = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const result = await superAdminService.changeAdminStatus(
    getActorId(req),
    req.params.id,
    req.body?.isActive,
  );

  return res.status(200).json({
    success: true,
    message: result.message,
    data: {
      admin: result.admin,
    },
  });
});

module.exports = Object.freeze({
  createAdmin,
  getAdmins,
  changeAdminStatus,
});
