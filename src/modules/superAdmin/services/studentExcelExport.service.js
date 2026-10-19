"use strict";

const ExcelJS = require("exceljs");

// ============================================================
// AMIOUT ENTERPRISE
// SUPER ADMIN - FILTERED UNIVERSITY STUDENTS EXCEL
//
// All data comes from StudentMaster.
// No hardcoded student records.
// No passwords or authentication secrets.
// ============================================================

const COLORS = {
  navy: "FF10243A",
  gold: "FFD4A72C",
  white: "FFFFFFFF",
  pale: "FFF2F6FB",
  green: "FF15803D",
  red: "FFB91C1C",
};

const getLabel = (value, keys) => {
  if (!value || typeof value !== "object") {
    return "Not Recorded";
  }

  for (const key of keys) {
    const result = value[key];

    if (typeof result === "string" && result.trim()) {
      return result.trim();
    }
  }

  return "Not Recorded";
};

const safeText = (value) => {
  if (value === undefined || value === null || value === "") {
    return "Not Recorded";
  }

  const result = String(value);

  // Prevent formula injection through imported Excel data.
  if (/^\s*[=+\-@\t\r]/.test(result)) {
    return `'${result}`;
  }

  return result;
};

const istDate = (value) => {
  if (!value) return "Not Recorded";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "Not Recorded";
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
};

const buildStudentExcel = async ({
  students = [],
  total = 0,
  filters = {},
}) => {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "AMIOUT Enterprise";
  workbook.subject = "University Student Monitoring";
  workbook.title = "Filtered University Students Report";
  workbook.created = new Date();

  // ==========================================================
  // SHEET 1: EXPORT SUMMARY
  // ==========================================================

  const overview = workbook.addWorksheet("Report Summary");

  overview.mergeCells("A1:D1");
  overview.getCell("A1").value =
    "AMIOUT ENTERPRISE - UNIVERSITY STUDENT REPORT";

  overview.getCell("A1").font = {
    size: 16,
    bold: true,
    color: { argb: COLORS.white },
  };

  overview.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.navy },
  };

  overview.getRow(1).height = 36;

  overview.addRow(["University", "Amity University Madhya Pradesh"]);

  overview.addRow(["Generated At (IST)", istDate(new Date())]);

  overview.addRow(["Total Matching Students", total]);

  overview.addRow(["Report Type", "Filtered StudentMaster Export"]);

  overview.addRow([]);

  overview.addRow(["APPLIED FILTERS", "SELECTED VALUES"]);

  const studentFilterDescriptions = [
    ["Search", "search"],
    ["Institute", "institute"],
    ["Program", "program"],
    ["Batch", "batch"],
    ["Semester", "semester"],
    ["Section", "section"],
    ["Group", "group"],
    ["Account Status", "isActive"],
    ["Registration Status", "isRegistered"],
  ];

  // IDs are intentionally not presented as academic names.
  // The actual resolved names appear on the Student Records sheet.
  for (const [label, key] of studentFilterDescriptions) {
    const value = filters[key];

    if (!value) continue;

    overview.addRow([label, safeText(value)]);
  }

  overview.addRow([]);

  overview.addRow([
    "Scope",
    "Every student matching the selected filters; " +
      "not restricted to current website page.",
  ]);

  overview.addRow(["Data Source", "MongoDB StudentMaster"]);

  overview.getColumn("A").width = 29;
  overview.getColumn("B").width = 64;
  overview.getColumn("C").width = 18;
  overview.getColumn("D").width = 18;

  overview.getRow(8).font = {
    bold: true,
    color: { argb: COLORS.navy },
  };

  // ==========================================================
  // SHEET 2: STUDENT RECORDS
  // ==========================================================

  const sheet = workbook.addWorksheet("Student Records");

  sheet.columns = [
    { header: "S.No.", key: "serial", width: 9 },
    { header: "Student Name", key: "name", width: 30 },
    { header: "Enrollment Number", key: "enrollment", width: 24 },
    { header: "Roll Number", key: "roll", width: 20 },
    { header: "Email", key: "email", width: 38 },
    { header: "Mobile Number", key: "mobile", width: 19 },
    { header: "Institute", key: "institute", width: 45 },
    { header: "Program", key: "program", width: 45 },
    { header: "Batch", key: "batch", width: 17 },
    { header: "Admission Year", key: "admissionYear", width: 18 },
    { header: "Passing Year", key: "passingYear", width: 18 },
    { header: "Semester", key: "semester", width: 13 },
    { header: "Section", key: "section", width: 13 },
    { header: "Group", key: "group", width: 15 },
    { header: "Mentor Group", key: "mentorGroup", width: 22 },
    { header: "Primary Mentor", key: "mentor", width: 29 },
    { header: "Mentor Email", key: "mentorEmail", width: 38 },
    { header: "Backup Mentor", key: "backupMentor", width: 29 },
    { header: "Account Status", key: "status", width: 20 },
    { header: "Registration", key: "registration", width: 20 },
    { header: "Imported At (IST)", key: "createdAt", width: 26 },
  ];

  sheet.views = [
    {
      state: "frozen",
      ySplit: 1,
      xSplit: 2,
    },
  ];

  sheet.autoFilter = {
    from: "A1",
    to: "U1",
  };

  const headerRow = sheet.getRow(1);
  headerRow.height = 34;

  headerRow.eachCell((cell) => {
    cell.font = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: COLORS.white },
    };

    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.navy },
    };

    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };

    cell.border = {
      bottom: {
        style: "medium",
        color: { argb: COLORS.gold },
      },
    };
  });

  // ==========================================================
  // ADD ALL MATCHING STUDENTS
  // ==========================================================

  for (const [index, student] of students.entries()) {
    const primary = student.primaryMentor;
    const backup = student.backupMentor;

    const row = sheet.addRow({
      serial: index + 1,
      name: safeText(student.name),
      enrollment: safeText(student.enrollmentNumber),
      roll: safeText(student.rollNumber),
      email: safeText(student.email),
      mobile: safeText(student.mobileNumber),

      institute: getLabel(student.institute, [
        "name",
        "instituteName",
        "shortName",
        "code",
      ]),

      program: getLabel(student.program, [
        "name",
        "programName",
        "shortName",
        "code",
      ]),

      batch: safeText(student.batch),
      admissionYear: student.admissionYear ?? "",
      passingYear: student.passingYear ?? "",
      semester: student.semester ?? "",
      section: safeText(student.section),
      group: safeText(student.group),

      mentorGroup: getLabel(student.mentorGroup, ["groupName", "name"]),

      mentor: getLabel(primary, ["name", "mentorName"]),

      mentorEmail: safeText(primary?.mentorEmail || primary?.email),

      backupMentor: getLabel(backup, ["name", "mentorName"]),

      status: student.isActive ? "ACTIVE" : "INACTIVE",

      registration: student.isRegistered ? "REGISTERED" : "NOT REGISTERED",

      createdAt: istDate(student.createdAt),
    });

    row.height = 25;

    row.alignment = {
      vertical: "middle",
      wrapText: true,
    };

    if (index % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COLORS.pale },
        };
      });
    }

    const statusCell = row.getCell("status");

    statusCell.font = {
      bold: true,
      color: {
        argb: student.isActive ? COLORS.green : COLORS.red,
      },
    };

    row.getCell("enrollment").numFmt = "@";
    row.getCell("roll").numFmt = "@";
    row.getCell("mobile").numFmt = "@";
  }

  if (!students.length) {
    sheet.addRow({
      name: "No students match the selected filters.",
    });
  }

  // Build in memory so errors are handled before
  // the HTTP response begins.
  return workbook.xlsx.writeBuffer();
};

module.exports = Object.freeze({
  buildStudentExcel,
});
