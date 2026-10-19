"use strict";

const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const premiumPdf = require("./premiumOutpassPdf.service");
// ============================================================
// AMIOUT ENTERPRISE - OUTPASS REPORT GENERATOR
//
// Excel: Detailed multi-column university audit export.
// PDF: University-branded detailed report.
//
// No passwords, OTPs, QR tokens or parent SMS tokens.
// ============================================================

const fmt = (value) => {
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
    second: "2-digit",
    hour12: true,
  }).format(date);
};

const text = (value) =>
  value === undefined || value === null || value === ""
    ? "Not Recorded"
    : String(value);

const person = (value) => value?.name || value?.id || "Not Recorded";

const yesNo = (value) => (value ? "YES" : "NO");

const excelText = (value) => {
  const result = text(value);

  // Prevent user-authored text becoming a spreadsheet formula.
  return /^[\s]*[=+\-@]/.test(result) ? `'${result}` : result;
};

function makeRow(o) {
  return {
    outpassId: excelText(o.outpassId),
    status: o.status,

    student: excelText(o.student.name),
    enrollment: excelText(o.student.enrollmentNumber),
    course: excelText(o.student.course),
    branch: excelText(o.student.branch),
    semester: o.student.semester,
    section: excelText(o.student.section),
    group: excelText(o.student.group),

    institute: excelText(o.academic.institute?.name),
    program: excelText(o.academic.program?.name),

    requestedAt: fmt(o.createdAt),
    outDate: fmt(o.request.outDate),
    requestedOutTime: excelText(o.request.outTime),
    destination: excelText(o.request.destination),
    reason: excelText(o.request.reason),
    trip: o.request.dailyTripNumber || "",

    parent: excelText(o.parent.name),
    parentPhone: excelText(o.parent.mobileMasked),
    parentStatus: o.parent.status,
    parentMethod: excelText(o.parent.method),
    parentDecisionAt: fmt(o.parent.decidedAt),
    phoneOutcome: excelText(o.parent.callOutcome),
    phoneRemarks: excelText(o.parent.callRemarks),
    phoneVerifiedAt: fmt(o.parent.callVerifiedAt),
    phoneVerifiedBy: excelText(person(o.parent.verifiedBy)),

    approvedRole: excelText(o.faculty.approvedRole),
    approvedBy: excelText(person(o.faculty.approvedBy)),
    approvedAt: fmt(o.faculty.approvedAt),
    approvalRemarks: excelText(o.faculty.approvalRemark),
    rejectedAt: fmt(o.faculty.rejectedAt),

    bypassUsed: yesNo(o.bypass.used),
    parentPendingBypass: yesNo(o.bypass.parentPendingBypass),
    bypassRole: excelText(o.bypass.authorityRole),
    bypassBy: excelText(person(o.bypass.performedBy)),
    bypassAt: fmt(o.bypass.performedAt),
    bypassReason: excelText(o.bypass.reason),
    bypassedRoles: excelText(o.bypass.bypassedRoles.join(", ")),
    acknowledgedBy: excelText(person(o.bypass.acknowledgedBy)),
    acknowledgementAt: fmt(o.bypass.acknowledgedAt),

    qrGeneratedAt: fmt(o.qr.generatedAt),
    qrValidFrom: fmt(o.qr.validFrom),
    qrExpiresAt: fmt(o.qr.expiresAt),

    exitVerified: yesNo(o.security.exitVerified),
    exitAt: fmt(o.security.exitVerifiedAt),
    exitGuard: excelText(person(o.security.exitGuard)),
    exitGuardId: excelText(o.security.exitGuard?.id),

    entryVerified: yesNo(o.security.entryVerified),
    entryAt: fmt(o.security.entryVerifiedAt),
    entryGuard: excelText(person(o.security.entryGuard)),
    entryGuardId: excelText(o.security.entryGuard?.id),

    timeline: excelText(
      o.timeline
        .map(
          (t) => `${fmt(t.performedAt)} - ${t.title}: ${t.description || ""}`,
        )
        .join(" | "),
    ),
    assignmentHistory: excelText(
      o.assignmentHistory
        .map(
          (h) =>
            `${fmt(h.transferredAt)} - ${h.fromRole || "None"} to ${h.toRole || "None"} (${h.reason})`,
        )
        .join(" | "),
    ),
    anomalies: excelText(o.anomalies.join(", ")),
  };
}

const columns = [
  ["Outpass Number", "outpassId", 24],
  ["Status", "status", 16],
  ["Student", "student", 26],
  ["Enrollment", "enrollment", 23],
  ["Course", "course", 28],
  ["Branch", "branch", 26],
  ["Semester", "semester", 12],
  ["Section", "section", 12],
  ["Group", "group", 12],
  ["Institute", "institute", 36],
  ["Program", "program", 36],
  ["Applied At (IST)", "requestedAt", 27],
  ["Out Date (IST)", "outDate", 27],
  ["Requested OUT Time", "requestedOutTime", 20],
  ["Destination", "destination", 26],
  ["Reason", "reason", 48],
  ["Daily Trip Number", "trip", 17],
  ["Parent Name", "parent", 26],
  ["Parent Mobile (Masked)", "parentPhone", 24],
  ["Parent Status", "parentStatus", 18],
  ["Parent Method", "parentMethod", 18],
  ["Parent Decision At", "parentDecisionAt", 27],
  ["Phone Call Outcome", "phoneOutcome", 20],
  ["Phone Call Remarks", "phoneRemarks", 45],
  ["Phone Verified At", "phoneVerifiedAt", 27],
  ["Phone Verified By", "phoneVerifiedBy", 28],
  ["Approver Role", "approvedRole", 18],
  ["Approved By", "approvedBy", 28],
  ["Approved At", "approvedAt", 27],
  ["Approval Remarks", "approvalRemarks", 40],
  ["Rejected At", "rejectedAt", 27],
  ["Bypass Used", "bypassUsed", 16],
  ["Parent Pending Bypass", "parentPendingBypass", 23],
  ["Bypass Authority", "bypassRole", 18],
  ["Bypass Performed By", "bypassBy", 28],
  ["Bypass Timestamp", "bypassAt", 27],
  ["Bypass Reason", "bypassReason", 48],
  ["Bypassed Roles", "bypassedRoles", 28],
  ["Acknowledged By", "acknowledgedBy", 28],
  ["Acknowledged At", "acknowledgementAt", 27],
  ["QR Generated At", "qrGeneratedAt", 27],
  ["QR Valid From", "qrValidFrom", 27],
  ["QR Expires At", "qrExpiresAt", 27],
  ["EXIT Verified", "exitVerified", 16],
  ["EXIT At", "exitAt", 27],
  ["EXIT Guard", "exitGuard", 28],
  ["EXIT Guard ID", "exitGuardId", 26],
  ["ENTRY Verified", "entryVerified", 16],
  ["ENTRY At", "entryAt", 27],
  ["ENTRY Guard", "entryGuard", 28],
  ["ENTRY Guard ID", "entryGuardId", 26],
  ["Timeline Events", "timeline", 80],
  ["Assignment History", "assignmentHistory", 80],
  ["Audit Consistency Flags", "anomalies", 40],
];

async function writeExcel(res, payload) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "AMIOUT Enterprise";
  workbook.subject = "Super Admin Outpass Audit Report";

  const overview = workbook.addWorksheet("Overview");

  overview.addRow(["AMIOUT ENTERPRISE - UNIVERSITY OUTPASS REPORT"]);
  overview.addRow(["Amity University Madhya Pradesh"]);
  overview.addRow(["Report Time (IST)", fmt(new Date())]);
  overview.addRow(["Records", payload.records.length]);
  overview.addRow([]);

  for (const [label, key] of [
    ["Total Outpasses", "total"],
    ["Pending Approval", "pending"],
    ["Approved", "approved"],
    ["Currently Outside", "outside"],
    ["Returned", "returned"],
    ["Rejected", "rejected"],
    ["Parent Pending", "parentPending"],
    ["Any Bypass Recorded", "bypassUsed"],
    ["Parent Pending + Bypass Recorded", "pendingBypass"],
  ]) {
    overview.addRow([label, payload.summary[key] ?? 0]);
  }

  overview.addRow([]);
  overview.addRow([
    "Note",
    "Parent PENDING is not equivalent to parent APPROVED.",
  ]);
  overview.addRow([
    "Note",
    "Bypass Used can include faculty-authority escalation.",
  ]);
  overview.addRow([
    "Note",
    "Gate-at-scan is not stored in the current Outpass model.",
  ]);

  overview.getColumn(1).width = 42;
  overview.getColumn(2).width = 85;
  overview.getRow(1).font = {
    bold: true,
    color: { argb: "FFD4A72C" },
    size: 16,
  };

  const sheet = workbook.addWorksheet("Detailed Outpasses");

  sheet.columns = columns.map(([header, key, width]) => ({
    header,
    key,
    width,
  }));

  sheet.views = [{ state: "frozen", ySplit: 1 }];

  sheet.autoFilter = {
    from: "A1",
    to: `${sheet.getColumn(columns.length).letter}1`,
  };

  sheet.getRow(1).height = 30;
  sheet.getRow(1).font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
  };

  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF10243A" },
  };

  for (const record of payload.records) {
    const row = sheet.addRow(makeRow(record));

    row.alignment = {
      vertical: "top",
      wrapText: true,
    };

    if (record.anomalies.length) {
      row.getCell("anomalies").font = {
        color: { argb: "FFC2413B" },
        bold: true,
      };
    }
  }

  res.set({
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="AMIOUT_Outpass_Audit.xlsx"',
    "Cache-Control": "no-store",
  });

  await workbook.xlsx.write(res);
  res.end();
}

function writePdf(res, payload) {
  const pdf = new PDFDocument({
    size: "A4",
    margin: 42,
    bufferPages: false,
    info: {
      Title: "AMIOUT Enterprise - Outpass Audit Report",
      Author: "AMIOUT Enterprise",
    },
  });

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": 'attachment; filename="AMIOUT_Outpass_Audit.pdf"',
    "Cache-Control": "no-store",
  });

  pdf.pipe(res);

  const heading = (title) => {
    pdf.moveDown(0.7);
    pdf.fillColor("#B8860B").font("Helvetica-Bold").fontSize(11).text(title);
    pdf.moveDown(0.3);
  };

  const field = (label, value) => {
    pdf
      .fillColor("#374151")
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`${label}: `, { continued: true })
      .font("Helvetica")
      .fillColor("#111827")
      .text(text(value));
  };

  pdf
    .fillColor("#11243D")
    .font("Helvetica-Bold")
    .fontSize(21)
    .text("AMIOUT ENTERPRISE");

  pdf.fillColor("#B8860B").fontSize(12).text("UNIVERSITY OUTPASS AUDIT REPORT");

  pdf
    .fillColor("#64748B")
    .font("Helvetica")
    .fontSize(9)
    .text("Amity University Madhya Pradesh")
    .text(`Generated: ${fmt(new Date())}`)
    .text("Timezone: Asia/Kolkata (IST)");

  heading("Report Summary");

  for (const [label, key] of [
    ["Total Outpasses", "total"],
    ["Pending", "pending"],
    ["Approved", "approved"],
    ["Currently Outside", "outside"],
    ["Returned", "returned"],
    ["Rejected", "rejected"],
    ["Parent Pending", "parentPending"],
    ["Bypass Used", "bypassUsed"],
    ["Parent Pending + Bypass", "pendingBypass"],
  ]) {
    field(label, payload.summary[key] ?? 0);
  }

  heading("Audit Notes");
  pdf
    .fillColor("#374151")
    .fontSize(9)
    .text(
      "Parent PENDING remains PENDING even when a faculty-authorized bypass is recorded. Bypass Used may also represent authority escalation. Gate-at-scan is not stored in the current Outpass model.",
    );

  for (const [index, o] of payload.records.entries()) {
    pdf.addPage();

    pdf
      .fillColor("#11243D")
      .font("Helvetica-Bold")
      .fontSize(15)
      .text(`OUTPASS ${index + 1}: ${o.outpassId}`);

    field("Status", o.status);

    heading("Student and Request");
    field("Student", o.student.name);
    field("Enrollment", o.student.enrollmentNumber);
    field("Institute", o.academic.institute?.name);
    field("Program", o.academic.program?.name);
    field(
      "Academic",
      `Semester ${o.student.semester}, Section ${o.student.section}, Group ${o.student.group}`,
    );
    field("Applied At", fmt(o.createdAt));
    field("Out Date", fmt(o.request.outDate));
    field("Destination", o.request.destination);
    field("Reason", o.request.reason);
    field("Daily Trip Number", o.request.dailyTripNumber);

    heading("Parent Consent");
    field("Parent", o.parent.name);
    field("Parent Status", o.parent.status);
    field("Method", o.parent.method);
    field("Decision Time", fmt(o.parent.decidedAt));
    field("Phone Outcome", o.parent.callOutcome);
    field("Phone Remarks", o.parent.callRemarks);
    field("Phone Verified At", fmt(o.parent.callVerifiedAt));
    field("Phone Verified By", person(o.parent.verifiedBy));

    heading("Faculty Approval and Bypass");
    field("Approver", person(o.faculty.approvedBy));
    field("Authority Role", o.faculty.approvedRole);
    field("Approved At", fmt(o.faculty.approvedAt));
    field("Approval Remark", o.faculty.approvalRemark);
    field("Bypass Used", yesNo(o.bypass.used));
    field(
      "Parent Pending Override Recorded",
      yesNo(o.bypass.parentPendingBypass),
    );
    field("Bypass Authority", o.bypass.authorityRole);
    field("Bypass Performed By", person(o.bypass.performedBy));
    field("Bypass Reason", o.bypass.reason);
    field("Bypass Time", fmt(o.bypass.performedAt));
    field("Acknowledged By", person(o.bypass.acknowledgedBy));
    field("Acknowledged At", fmt(o.bypass.acknowledgedAt));

    heading("Security Gate Verification");
    field("EXIT Verified", yesNo(o.security.exitVerified));
    field("EXIT At", fmt(o.security.exitVerifiedAt));
    field("EXIT Guard", person(o.security.exitGuard));
    field("EXIT Guard ID", o.security.exitGuard?.id);
    field("ENTRY Verified", yesNo(o.security.entryVerified));
    field("ENTRY At", fmt(o.security.entryVerifiedAt));
    field("ENTRY Guard", person(o.security.entryGuard));
    field("ENTRY Guard ID", o.security.entryGuard?.id);
    field("Gate At Scan", "Not Recorded in Outpass");
    field("QR Generated At", fmt(o.qr.generatedAt));
    field("QR Valid From", fmt(o.qr.validFrom));
    field("QR Expires At", fmt(o.qr.expiresAt));

    if (o.assignmentHistory.length) {
      heading("Faculty Assignment History");
      for (const h of o.assignmentHistory) {
        field(
          fmt(h.transferredAt),
          `${h.fromRole || "None"} to ${h.toRole || "None"} - ${h.reason}`,
        );
      }
    }

    if (o.timeline.length) {
      heading("Outpass Timeline");
      for (const t of o.timeline) {
        field(fmt(t.performedAt), `${t.title} - ${t.description || ""}`);
      }
    }

    if (o.anomalies.length) {
      heading("Audit Consistency Flags");
      field("Review Required", o.anomalies.join(", "));
    }
  }

  pdf.end();
}

module.exports = Object.freeze({
  writeExcel,
  writePdf: premiumPdf.writePdf,
});
