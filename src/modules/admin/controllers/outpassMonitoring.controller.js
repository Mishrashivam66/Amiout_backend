"use strict";

const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");

const Outpass = require("../../outpass/models/Outpass");

// ============================================================
// HELPERS
// ============================================================

const fail = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const text = (value) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

const maskPhone = (value) => {
  const phone = text(value).replace(/\D/g, "");
  return phone.length >= 4 ? `******${phone.slice(-4)}` : "";
};

const formatIST = (value) => {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

const safeExcelText = (value) => {
  const str = text(value);
  return /^[=+\-@\t\r\n]/.test(str) ? `'${str}` : str;
};

const facultyIdentity = (faculty) => {
  if (!faculty || typeof faculty !== "object") {
    return null;
  }

  return {
    id: faculty._id,
    name: faculty.name || "",
    email: faculty.email || "",
  };
};

const COMMON_POPULATES = [
  {
    path: "student",
    select: "name email enrollmentNumber mobileNumber",
  },
  {
    path: "mentor",
    select: "name email",
  },
  {
    path: "assignedFaculty",
    select: "name email",
  },
  {
    path: "approvedByFaculty",
    select: "name email",
  },
  {
    path: "rejectedByFaculty",
    select: "name email",
  },
  {
    path: "academicInstitute",
    select: "name",
  },
  {
    path: "academicProgram",
    select: "name code",
  },
  {
    path: "exitVerifiedBy",
    select: "name email",
  },
  {
    path: "entryVerifiedBy",
    select: "name email",
  },
  {
    path: "parentDecision.verifiedByFaculty",
    select: "name email",
  },
  {
    path: "parentConsentAcknowledgement.acknowledgedBy",
    select: "name email",
  },
];

// ============================================================
// FULL DETAILS
// ============================================================

const getOutpassDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid outpass ID.",
    });
  }

  const record = await Outpass.findOne({
    _id: id,
    isDeleted: false,
  })
    .populate(COMMON_POPULATES)
    .populate({
      path: "assignmentHistory.fromFaculty",
      select: "name email",
    })
    .populate({
      path: "assignmentHistory.toFaculty",
      select: "name email",
    })
    .populate({
      path: "timeline.performedBy",
      select: "name email",
    })
    .lean();

  if (!record) {
    return res.status(404).json({
      success: false,
      message: "Outpass not found.",
    });
  }

  const parent = record.parentDecision || {};

  const data = {
    _id: record._id,
    outpassId: record.outpassId,
    status: record.status,

    // STUDENT
    student: {
      name: record.studentName || record.student?.name,
      enrollmentNumber: record.enrollmentNumber,
      email: record.student?.email || "",
      institute: record.academicInstitute?.name || "",
      program: record.academicProgram?.name || "",
      department: record.academicDepartment || "",
      batch: record.academicBatch || "",
      course: record.course,
      branch: record.branch,
      semester: record.semester,
      section: record.section,
      group: record.group,
    },

    // REQUEST
    request: {
      reason: record.reason,
      destination: record.destination,
      outDate: record.outDate,
      outTime: record.outTime,
      inTime: record.inTime,
      dailyTripNumber: record.dailyTripNumber,
      outpassDayIST: record.outpassDayIST,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      cancelledAt: record.cancelledAt,
      cancelledReason: record.cancelledReason,
    },

    // PARENT
    parent: {
      name: record.parentName,
      mobileMasked: maskPhone(record.parentMobileNumber),
      status: parent.status || "PENDING",
      method: parent.method || "",
      decidedAt: parent.decidedAt || null,
      verifiedBy: facultyIdentity(parent.verifiedByFaculty),
      verifiedByRole: parent.verifiedByRole || "",
      callOutcome: parent.callOutcome || "",
      callRemarks: parent.callRemarks || "",
      callVerifiedAt: parent.callVerifiedAt || null,
      smsStatus: record.parentSMSStatus,
      smsSentAt: record.parentSMSSentAt,
    },

    // FACULTY
    faculty: {
      mentor: facultyIdentity(record.mentor),
      assigned: facultyIdentity(record.assignedFaculty),
      assignedRole: record.assignedRole || "",

      approvedBy: facultyIdentity(record.approvedByFaculty),
      approvedRole: record.approvedAuthorityRole || "",
      approvedAt: record.approvedAt || null,
      approvalRemark: record.approvalRemark || "",

      rejectedBy: facultyIdentity(record.rejectedByFaculty),
      rejectedRole: record.rejectedAuthorityRole || "",
      rejectedAt: record.rejectedAt || null,
      rejectionRemark: record.rejectionRemark || "",

      parentConsentAcknowledgement: {
        parentStatusAtApproval:
          record.parentConsentAcknowledgement?.parentStatusAtApproval || "",
        acknowledgedBy: facultyIdentity(
          record.parentConsentAcknowledgement?.acknowledgedBy,
        ),
        acknowledgedRole:
          record.parentConsentAcknowledgement?.acknowledgedRole || "",
        acknowledgedAt:
          record.parentConsentAcknowledgement?.acknowledgedAt || null,
        remark: record.parentConsentAcknowledgement?.remark || "",
      },

      approvalBypass: {
        used: record.approvalBypass?.used || false,
        authorityRole: record.approvalBypass?.authorityRole || "",
        bypassedRoles: record.approvalBypass?.bypassedRoles || [],
        reason: record.approvalBypass?.reason || "",
        performedAt: record.approvalBypass?.performedAt || null,
      },
    },

    // QR METADATA - NO SECRET TOKEN
    qr: {
      generated: record.qrGenerated === true,
      generatedAt: record.qrGeneratedAt || null,
      validFrom: record.qrValidFrom || null,
      expiresAt: record.qrExpiresAt || null,
      revokedAt: record.qrRevokedAt || null,
    },

    // GATE
    security: {
      exitVerified: record.exitVerified === true,
      exitVerifiedAt: record.exitVerifiedAt || null,
      exitVerifiedBy: record.exitVerifiedBy
        ? {
            name: record.exitVerifiedBy.name || "",
            email: record.exitVerifiedBy.email || "",
          }
        : null,

      entryVerified: record.entryVerified === true,
      entryVerifiedAt: record.entryVerifiedAt || null,
      entryVerifiedBy: record.entryVerifiedBy
        ? {
            name: record.entryVerifiedBy.name || "",
            email: record.entryVerifiedBy.email || "",
          }
        : null,
    },

    // AUDIT
    assignmentHistory: (record.assignmentHistory || []).map((item) => ({
      fromFaculty: facultyIdentity(item.fromFaculty),
      toFaculty: facultyIdentity(item.toFaculty),
      fromRole: item.fromRole || "",
      toRole: item.toRole || "",
      reason: item.reason || "",
      remarks: item.remarks || "",
      transferredAt: item.transferredAt,
    })),

    timeline: (record.timeline || []).map((event) => ({
      event: event.event,
      title: event.title,
      description: event.description,
      performedAt: event.performedAt,
      performedBy: event.performedBy
        ? {
            name: event.performedBy.name || "",
            email: event.performedBy.email || "",
          }
        : null,
    })),
  };

  return res.status(200).json({
    success: true,
    message: "Full outpass details fetched.",
    data,
  });
});

// ============================================================
// IST DATE HELPERS
// ============================================================

const parseDay = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) {
    fail(400, "Invalid date. Use YYYY-MM-DD.");
  }

  const date = new Date(`${value}T00:00:00+05:30`);

  if (
    Number.isNaN(date.getTime()) ||
    new Date(date.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10) !==
      value
  ) {
    fail(400, "Invalid calendar date.");
  }

  return date;
};

const getDateRange = (query) => {
  const type = text(query.type || "day")
    .trim()
    .toLowerCase();

  if (type === "day") {
    const start = parseDay(query.date);

    return {
      start,
      end: new Date(start.getTime() + 86400000),
      label: text(query.date),
    };
  }

  if (type === "month") {
    const month = text(query.month);

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      fail(400, "Invalid month. Use YYYY-MM.");
    }

    const [year, monthNumber] = month.split("-").map(Number);

    const start = parseDay(`${month}-01`);

    const nextMonthStart =
      monthNumber === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;

    return {
      start,
      end: parseDay(nextMonthStart),
      label: month,
    };
  }

  if (type === "year") {
    const year = Number(query.year);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      fail(400, "Invalid report year.");
    }

    return {
      start: parseDay(`${year}-01-01`),
      end: parseDay(`${year + 1}-01-01`),
      label: String(year),
    };
  }

  if (type === "custom") {
    const start = parseDay(query.startDate);
    const lastDay = parseDay(query.endDate);

    if (start > lastDay) {
      fail(400, "Start date must not exceed end date.");
    }

    if (lastDay.getTime() - start.getTime() > 366 * 86400000) {
      fail(400, "Maximum custom range is 366 days.");
    }

    return {
      start,
      end: new Date(lastDay.getTime() + 86400000),
      label: `${query.startDate}_to_${query.endDate}`,
    };
  }

  fail(400, "Invalid report type.");
};

// ============================================================
// EXCEL REPORT EXPORT
// ============================================================

const exportOutpassesExcel = asyncHandler(async (req, res) => {
  const range = getDateRange(req.query);

  const filter = {
    isDeleted: false,
    outDate: {
      $gte: range.start,
      $lt: range.end,
    },
  };

  if (req.query.status && req.query.status !== "ALL") {
    const allowedStatuses = Outpass.schema.path("status").enumValues;

    if (!allowedStatuses.includes(req.query.status)) {
      fail(400, "Invalid outpass status.");
    }

    filter.status = req.query.status;
  }

  // Maximum 5,000 records per export.
  // Reports are NOT restricted to table pagination.
  const total = await Outpass.countDocuments(filter);

  if (total > 5000) {
    fail(
      400,
      "More than 5,000 records match. Please choose a smaller date range.",
    );
  }

  const records = await Outpass.find(filter)
    .populate(COMMON_POPULATES)
    .sort({ outDate: 1, createdAt: 1 })
    .lean();

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "AMIOUT";
  workbook.created = new Date();

  // SUMMARY WORKSHEET
  const summarySheet = workbook.addWorksheet("Summary");

  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 34 },
    { header: "Value", key: "value", width: 35 },
  ];

  const statusCounts = {};

  records.forEach((record) => {
    const status = record.status || "UNKNOWN";

    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  summarySheet.addRows([
    {
      metric: "Report",
      value: "AMIOUT Outpass Report",
    },
    {
      metric: "Period",
      value: range.label,
    },
    {
      metric: "Date Basis",
      value: "Outpass Date (IST)",
    },
    {
      metric: "Total Outpasses",
      value: records.length,
    },
    ...Object.entries(statusCounts).map(([status, count]) => ({
      metric: status,
      value: count,
    })),
  ]);

  // OUTPASS WORKSHEET
  const sheet = workbook.addWorksheet("Outpass Records");

  sheet.columns = [
    { header: "Outpass No.", key: "id", width: 25 },
    { header: "Student", key: "student", width: 27 },
    { header: "Enrollment", key: "enrollment", width: 25 },
    { header: "Institute", key: "institute", width: 28 },
    { header: "Program", key: "program", width: 27 },
    { header: "Department", key: "department", width: 32 },
    { header: "Batch", key: "batch", width: 17 },
    { header: "Semester", key: "semester", width: 13 },
    { header: "Section", key: "section", width: 13 },
    { header: "Group", key: "group", width: 13 },
    { header: "Outpass Date", key: "date", width: 23 },
    { header: "Out Time", key: "outTime", width: 17 },
    { header: "In Time", key: "inTime", width: 17 },
    { header: "Destination", key: "destination", width: 30 },
    { header: "Reason", key: "reason", width: 40 },
    { header: "Status", key: "status", width: 18 },
    { header: "Trip No.", key: "trip", width: 13 },
    { header: "Parent Status", key: "parentStatus", width: 18 },
    { header: "Consent Method", key: "parentMethod", width: 19 },
    { header: "Consent Time", key: "parentAt", width: 24 },
    { header: "Assigned Faculty", key: "faculty", width: 27 },
    { header: "Assigned Role", key: "assignedRole", width: 19 },
    { header: "Approved By", key: "approvedBy", width: 27 },
    { header: "Approver Role", key: "approvedRole", width: 20 },
    { header: "Approved At", key: "approvedAt", width: 24 },
    { header: "Rejected At", key: "rejectedAt", width: 24 },
    { header: "QR Generated", key: "qr", width: 17 },
    { header: "QR Valid From", key: "qrFrom", width: 24 },
    { header: "QR Expires", key: "qrEnd", width: 24 },
    { header: "Exit Verified", key: "exit", width: 18 },
    { header: "Exit Time", key: "exitAt", width: 24 },
    { header: "Exit Guard", key: "exitGuard", width: 24 },
    { header: "Entry Verified", key: "entry", width: 18 },
    { header: "Entry Time", key: "entryAt", width: 24 },
    { header: "Entry Guard", key: "entryGuard", width: 24 },
    { header: "Applied At", key: "createdAt", width: 24 },
  ];

  for (const record of records) {
    sheet.addRow({
      id: safeExcelText(record.outpassId),
      student: safeExcelText(record.studentName),
      enrollment: safeExcelText(record.enrollmentNumber),
      institute: safeExcelText(record.academicInstitute?.name),
      program: safeExcelText(record.academicProgram?.name),
      department: safeExcelText(record.academicDepartment),
      batch: safeExcelText(record.academicBatch),
      semester: record.semester,
      section: safeExcelText(record.section),
      group: safeExcelText(record.group),
      date: formatIST(record.outDate),
      outTime: safeExcelText(record.outTime),
      inTime: safeExcelText(record.inTime),
      destination: safeExcelText(record.destination),
      reason: safeExcelText(record.reason),
      status: record.status,
      trip: record.dailyTripNumber,
      parentStatus: record.parentDecision?.status || "PENDING",
      parentMethod: record.parentDecision?.method || "",
      parentAt: formatIST(record.parentDecision?.decidedAt),
      faculty: safeExcelText(record.assignedFaculty?.name),
      assignedRole: record.assignedRole || "",
      approvedBy: safeExcelText(record.approvedByFaculty?.name),
      approvedRole: record.approvedAuthorityRole || "",
      approvedAt: formatIST(record.approvedAt),
      rejectedAt: formatIST(record.rejectedAt),
      qr: record.qrGenerated ? "YES" : "NO",
      qrFrom: formatIST(record.qrValidFrom),
      qrEnd: formatIST(record.qrExpiresAt),
      exit: record.exitVerified ? "YES" : "NO",
      exitAt: formatIST(record.exitVerifiedAt),
      exitGuard: safeExcelText(record.exitVerifiedBy?.name),
      entry: record.entryVerified ? "YES" : "NO",
      entryAt: formatIST(record.entryVerifiedAt),
      entryGuard: safeExcelText(record.entryVerifiedBy?.name),
      createdAt: formatIST(record.createdAt),
    });
  }

  // STYLING
  for (const worksheet of workbook.worksheets) {
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    worksheet.getRow(1).font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
    };

    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF123047" },
    };

    worksheet.getRow(1).height = 24;

    worksheet.autoFilter = {
      from: {
        row: 1,
        column: 1,
      },
      to: {
        row: Math.max(1, worksheet.rowCount),
        column: worksheet.columnCount,
      },
    };
  }

  const filename = `AMIOUT_Outpasses_${range.label}.xlsx`;

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  res.setHeader("Cache-Control", "no-store");

  await workbook.xlsx.write(res);
  return res.end();
});

module.exports = Object.freeze({
  getOutpassDetails,
  exportOutpassesExcel,
});
