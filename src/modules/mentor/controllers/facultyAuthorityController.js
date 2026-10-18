
"use strict";

const asyncHandler = require("express-async-handler");

const {
  approveOutpassForRole,
} = require("../../outpass/services/sharedApprovalService");

const getFacultyId = (req) => req.user?._id || req.user?.id;

const approveForRole = (role) =>
  asyncHandler(async (req, res) => {
    const facultyId = getFacultyId(req);

    if (!facultyId) {
      return res.status(401).json({
        success: false,
        message: "Faculty authentication required.",
      });
    }

    const result = await approveOutpassForRole(
      facultyId,
      req.params.outpassId,
      typeof req.body?.remark === "string"
        ? req.body.remark.trim()
        : "",
      role,
    );

    return res.status(result?.success ? 200 : 400).json(result);
  });

module.exports = Object.freeze({
  approveAsHOD: approveForRole("HOD"),
  approveAsHOI: approveForRole("HOI"),
});
