"use strict";

const asyncHandler = require("express-async-handler");

const studentMonitoringService = require("../services/studentMonitoring.service");

const studentExcelService = require("../services/studentExcelExport.service");

const getActorId = (req) => req.user?._id || req.user?.id || null;

// ============================================================
// GET /api/v1/super-admin/students
// PAGINATED STUDENT LIST
// ============================================================

const getStudents = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const data = await studentMonitoringService.getStudents(
    getActorId(req),
    req.query,
  );

  return res.status(200).json({
    success: true,
    message: "Students fetched successfully.",
    data,
  });
});

// ============================================================
// GET /api/v1/super-admin/students/filters
// FILTER OPTIONS
// ============================================================

const getStudentFilters = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const data = await studentMonitoringService.getStudentFilters(
    getActorId(req),
  );

  return res.status(200).json({
    success: true,
    message: "Student filters fetched successfully.",
    data,
  });
});

// ============================================================
// GET /api/v1/super-admin/students/export
//
// DOWNLOAD ALL STUDENTS MATCHING DASHBOARD FILTERS.
//
// NOT restricted by the dashboard page or page size.
//
// SUPER_ADMIN authorization is enforced by:
// 1. superAdmin.routes.js
// 2. studentMonitoring.service.js
// ============================================================

const exportStudents = asyncHandler(async (req, res) => {
  const data = await studentMonitoringService.getStudentsForExport(
    getActorId(req),
    req.query,
  );

  const buffer = await studentExcelService.buildStudentExcel({
    students: data.students,
    total: data.total,
    filters: req.query,
  });

  const filename = "AMIOUT_Filtered_University_Students.xlsx";

  return res
    .status(200)
    .set({
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

      "Content-Disposition": `attachment; filename="${filename}"`,

      "Cache-Control": "no-store, private",

      "X-Content-Type-Options": "nosniff",
    })
    .send(Buffer.from(buffer));
});

module.exports = Object.freeze({
  getStudents,
  getStudentFilters,
  exportStudents,
});
