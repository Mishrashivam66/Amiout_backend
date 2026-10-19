"use strict";

const PDFDocument = require("pdfkit");

// ============================================================
// AMIOUT ENTERPRISE
// PREMIUM UNIVERSITY OUTPASS AUDIT PDF
//
// Receives the existing getReportRecords() payload.
//
// FEATURES:
// - Navy and gold university branding
// - Executive summary
// - Outpass register
// - Complete outpass details
// - Parent approval and bypass audit
// - Faculty approval and escalation
// - Security EXIT / ENTRY verification
// - QR validity information
// - Assignment history and timeline
// - Audit warnings
// - Automatic page breaks and page numbers
//
// No database modifications.
// No raw QR tokens, passwords or OTPs.
// ============================================================

const C = {
  navy: "#101E35",
  navy2: "#172A45",
  gold: "#C39325",
  ink: "#1F2937",
  muted: "#607089",
  border: "#DCE4EF",
  pale: "#F4F7FB",
  green: "#087F5B",
  greenBg: "#E8F7EF",
  amber: "#9A6700",
  amberBg: "#FFF5D9",
  red: "#B42318",
  redBg: "#FFF0EF",
  white: "#FFFFFF",
};

const PAGE = {
  x: 42,
  width: 511,
  contentTop: 122,
  bottom: 778,
};

// ============================================================
// SAFE FORMATTING
// ============================================================

function safe(value) {
  if (value === undefined || value === null || value === "") {
    return "Not Recorded";
  }

  return String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ");
}

function who(person) {
  return person?.name || (person?.id ? `ID ${person.id}` : "Not Recorded");
}

function when(value) {
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
}

function dateOnly(value) {
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
  }).format(date);
}

// ============================================================
// MAIN PDF GENERATOR
// ============================================================

function writePdf(res, payload) {
  const records = Array.isArray(payload?.records) ? payload.records : [];

  const summary = payload?.summary || {};

  const doc = new PDFDocument({
    autoFirstPage: false,
    size: "A4",

    margins: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },

    bufferPages: true,
    compress: true,

    info: {
      Title: "AMIOUT Enterprise - University Outpass Audit Report",
      Author: "AMIOUT Enterprise",
      Subject: "Authorized university outpass monitoring and gate verification",
    },
  });

  let y = PAGE.contentTop;

  let currentOutpass = "EXECUTIVE SUMMARY";

  // ==========================================================
  // UNIVERSITY HEADER
  // ==========================================================

  function frame() {
    const width = doc.page.width;

    // Navy background
    doc.rect(0, 0, width, 88).fill(C.navy);

    // Gold divider
    doc.rect(0, 85, width, 3).fill(C.gold);

    // University name
    doc
      .fillColor(C.gold)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("AMITY UNIVERSITY MADHYA PRADESH", PAGE.x, 17, { width: 365 });

    // System name
    doc
      .fillColor(C.white)
      .font("Helvetica-Bold")
      .fontSize(17)
      .text("AMIOUT ENTERPRISE", PAGE.x, 36, { width: 350 });

    // Report title
    doc
      .fillColor("#CAD5E5")
      .font("Helvetica")
      .fontSize(8)
      .text("UNIVERSITY OUTPASS AUDIT REPORT", PAGE.x, 63, { width: 360 });

    // Confidential marker
    doc
      .fillColor(C.gold)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("CONFIDENTIAL", 449, 28, {
        width: 104,
        align: "right",
      });

    // Current report section
    doc
      .fillColor(C.muted)
      .font("Helvetica")
      .fontSize(8)
      .text(currentOutpass, PAGE.x, 98, { width: PAGE.width });

    y = PAGE.contentTop;
  }

  doc.on("pageAdded", frame);

  doc.on("error", (err) => {
    res.destroy(err);
  });

  // ==========================================================
  // RESPONSE HEADERS
  // ==========================================================

  res.set({
    "Content-Type": "application/pdf",

    "Content-Disposition": 'attachment; filename="AMIOUT_Outpass_Audit.pdf"',

    "Cache-Control": "no-store, private",

    "X-Content-Type-Options": "nosniff",
  });

  doc.pipe(res);

  // ==========================================================
  // AUTOMATIC PAGE BREAK
  // ==========================================================

  function space(height = 0) {
    if (y + height > PAGE.bottom) {
      doc.addPage();
    }
  }

  // ==========================================================
  // SECTION HEADING
  // ==========================================================

  function heading(title) {
    space(37);

    doc.roundedRect(PAGE.x, y, PAGE.width, 29, 6).fill(C.navy2);

    doc
      .fillColor(C.white)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(title.toUpperCase(), PAGE.x + 13, y + 9, {
        width: PAGE.width - 26,
        lineBreak: false,
      });

    y += 39;
  }

  // ==========================================================
  // TWO-COLUMN DETAIL ROW
  // ==========================================================

  function row(fields) {
    const gutter = 11;

    const columnWidth = (PAGE.width - gutter) / 2;

    const heights = fields.map(([, value]) => {
      doc.font("Helvetica").fontSize(9);

      return doc.heightOfString(safe(value), {
        width: columnWidth - 22,
        lineGap: 2,
      });
    });

    const height = Math.max(48, ...heights.map((h) => h + 29));

    space(height + 7);

    fields.forEach(([label, value], index) => {
      const x = PAGE.x + index * (columnWidth + gutter);

      // Card
      doc
        .roundedRect(x, y, columnWidth, height, 7)
        .fillAndStroke(C.pale, C.border);

      // Field label
      doc
        .fillColor(C.muted)
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .text(String(label).toUpperCase(), x + 11, y + 9, {
          width: columnWidth - 22,
        });

      // Field value
      doc
        .fillColor(C.ink)
        .font("Helvetica")
        .fontSize(9)
        .text(safe(value), x + 11, y + 23, {
          width: columnWidth - 22,
          lineGap: 2,
        });
    });

    y += height + 7;
  }

  // ==========================================================
  // DETAIL SECTION
  // ==========================================================

  function fields(title, values) {
    heading(title);

    for (let i = 0; i < values.length; i += 2) {
      row(values.slice(i, i + 2));
    }

    y += 5;
  }

  // ==========================================================
  // AUDIT WARNING BOX
  // ==========================================================

  function note(message, level = "warning") {
    const color = level === "critical" ? C.red : C.amber;

    const bg = level === "critical" ? C.redBg : C.amberBg;

    doc.font("Helvetica").fontSize(9);

    const bodyHeight = doc.heightOfString(safe(message), {
      width: PAGE.width - 32,
      lineGap: 2,
    });

    const height = Math.max(44, bodyHeight + 24);

    space(height + 10);

    doc.roundedRect(PAGE.x, y, PAGE.width, height, 8).fillAndStroke(bg, color);

    doc
      .fillColor(color)
      .font("Helvetica")
      .fontSize(9)
      .text(safe(message), PAGE.x + 16, y + 12, {
        width: PAGE.width - 32,
        lineGap: 2,
      });

    y += height + 10;
  }

  // ==========================================================
  // AUDIT TIMELINE / HISTORY CARDS
  // ==========================================================

  function entries(title, list, mapper) {
    if (!list?.length) return;

    heading(title);

    for (const [index, item] of list.entries()) {
      const description = safe(mapper(item, index));

      doc.font("Helvetica").fontSize(9);

      const height = Math.max(
        36,
        doc.heightOfString(description, {
          width: PAGE.width - 36,
          lineGap: 3,
        }) + 20,
      );

      space(height + 6);

      doc
        .roundedRect(PAGE.x, y, PAGE.width, height, 7)
        .fillAndStroke(index % 2 ? C.white : C.pale, C.border);

      doc
        .fillColor(C.ink)
        .font("Helvetica")
        .fontSize(9)
        .text(description, PAGE.x + 16, y + 10, {
          width: PAGE.width - 32,
          lineGap: 3,
        });

      y += height + 6;
    }
  }

  // ==========================================================
  // PAGE 1 — EXECUTIVE SUMMARY
  // ==========================================================

  doc.addPage();

  doc
    .fillColor(C.navy)
    .font("Helvetica-Bold")
    .fontSize(22)
    .text("Executive Summary", PAGE.x, y, { width: PAGE.width });

  y += 36;

  doc
    .fillColor(C.muted)
    .font("Helvetica")
    .fontSize(9)
    .text(
      `Generated ${when(new Date())}  |  Timezone: Asia/Kolkata (IST)`,
      PAGE.x,
      y,
      { width: PAGE.width },
    );

  y += 28;

  // ==========================================================
  // SUMMARY STATISTICS
  // ==========================================================

  const cards = [
    ["TOTAL REQUESTS", summary.total ?? records.length, C.navy],
    ["RETURNED", summary.returned ?? 0, C.green],
    ["CURRENTLY OUTSIDE", summary.outside ?? 0, C.navy],
    ["PENDING APPROVAL", summary.pending ?? 0, C.amber],
    ["PARENT PENDING", summary.parentPending ?? 0, C.amber],
    ["BYPASS RECORDED", summary.bypassUsed ?? 0, C.navy],
    ["PENDING + BYPASS", summary.pendingBypass ?? 0, C.amber],
    ["REJECTED", summary.rejected ?? 0, C.red],
  ];

  const cardGap = 10;

  const cardWidth = (PAGE.width - cardGap * 3) / 4;

  for (const [index, [title, value, ink]] of cards.entries()) {
    const column = index % 4;

    const cardRow = Math.floor(index / 4);

    const x = PAGE.x + column * (cardWidth + cardGap);

    const top = y + cardRow * 85;

    doc.roundedRect(x, top, cardWidth, 75, 9).fillAndStroke(C.pale, C.border);

    doc
      .fillColor(C.muted)
      .font("Helvetica-Bold")
      .fontSize(7.2)
      .text(title, x + 11, top + 12, {
        width: cardWidth - 22,
      });

    doc
      .fillColor(ink)
      .font("Helvetica-Bold")
      .fontSize(25)
      .text(String(value), x + 11, top + 36, {
        width: cardWidth - 22,
      });
  }

  y += 188;

  // ==========================================================
  // OUTPASS SUMMARY REGISTER
  // ==========================================================

  heading("Outpass Register (First 8 Records)");

  const widths = [145, 147, 107, 112];

  const offsets = [
    0,
    widths[0],
    widths[0] + widths[1],
    widths[0] + widths[1] + widths[2],
  ];

  const columns = ["OUTPASS NUMBER", "STUDENT", "PARENT", "STATUS"];

  doc.rect(PAGE.x, y, PAGE.width, 29).fill(C.gold);

  columns.forEach((label, index) => {
    doc
      .fillColor(C.navy)
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(label, PAGE.x + offsets[index] + 8, y + 10, {
        width: widths[index] - 12,
      });
  });

  y += 29;

  for (const [index, outpass] of records.slice(0, 8).entries()) {
    const parentLabel = outpass?.bypass?.parentPendingBypass
      ? "PENDING + BYPASS"
      : safe(outpass?.parent?.status);

    const values = [
      safe(outpass.outpassId),
      safe(outpass.student?.name),
      parentLabel,
      safe(outpass.status),
    ];

    const rowHeight = 34;

    space(rowHeight + 2);

    doc
      .rect(PAGE.x, y, PAGE.width, rowHeight)
      .fillAndStroke(index % 2 ? C.white : C.pale, C.border);

    values.forEach((value, j) => {
      doc
        .fillColor(j === 0 ? C.navy : C.ink)
        .font(j === 0 ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8.2)
        .text(value, PAGE.x + offsets[j] + 8, y + 9, {
          width: widths[j] - 12,
          height: 24,
          ellipsis: true,
        });
    });

    y += rowHeight;
  }

  if (records.length > 8) {
    y += 7;

    doc
      .fillColor(C.muted)
      .fontSize(9)
      .text(
        `${records.length - 8} additional records are detailed on following pages.`,
        PAGE.x,
        y,
      );

    y += 24;
  }

  y += 12;

  // ==========================================================
  // AUDIT INTERPRETATION
  // ==========================================================

  note(
    "AUDIT INTERPRETATION: Parent PENDING remains PENDING. " +
      "A faculty bypass record alone is not independent proof of a verified parent phone call. " +
      "Authority escalation may also set the Bypass Used flag.",
  );

  note(
    "Gate at time of scan is not stored in the current Outpass model; " +
      "it cannot be reconstructed reliably from a guard's current gate assignment.",
  );

  // ==========================================================
  // DETAILED REPORTS
  // ==========================================================

  for (const [index, o] of records.entries()) {
    currentOutpass = `OUTPASS DETAIL ${index + 1} OF ${records.length}  |  ${safe(o.outpassId)}`;

    doc.addPage();

    // --------------------------------------------------------
    // OUTPASS IDENTITY HEADER
    // --------------------------------------------------------

    doc.roundedRect(PAGE.x, y, PAGE.width, 94, 10).fill(C.navy2);

    doc
      .fillColor(C.gold)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(
        `OUTPASS RECORD ${index + 1} / ${records.length}`,
        PAGE.x + 16,
        y + 13,
      );

    doc
      .fillColor(C.white)
      .font("Helvetica-Bold")
      .fontSize(17)
      .text(safe(o.outpassId), PAGE.x + 16, y + 33, {
        width: 337,
      });

    doc
      .fillColor("#DFE8F3")
      .font("Helvetica")
      .fontSize(9)
      .text(
        `${safe(o.student?.name)}  |  ${safe(o.student?.enrollmentNumber)}`,
        PAGE.x + 16,
        y + 64,
        {
          width: PAGE.width - 30,
        },
      );

    doc
      .fillColor(C.gold)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(safe(o.status), PAGE.x + 378, y + 34, {
        width: 115,
        align: "right",
      });

    y += 110;

    // --------------------------------------------------------
    // STUDENT / ACADEMIC DETAILS
    // --------------------------------------------------------

    fields("Student and Academic Details", [
      ["Student", o.student?.name],
      ["Enrollment Number", o.student?.enrollmentNumber],
      ["Institute", o.academic?.institute?.name],
      ["Program", o.academic?.program?.name],
      ["Course", o.student?.course],
      ["Branch", o.student?.branch],
      [
        "Semester / Section / Group",
        `${safe(o.student?.semester)} / ${safe(o.student?.section)} / ${safe(o.student?.group)}`,
      ],
      [
        "Department / Batch",
        `${safe(o.academic?.department)} / ${safe(o.academic?.batch)}`,
      ],
    ]);

    // --------------------------------------------------------
    // REQUEST DETAILS
    // --------------------------------------------------------

    fields("Request and Trip Information", [
      ["Applied At (IST)", when(o.createdAt)],
      ["Requested Out Date (IST)", dateOnly(o.request?.outDate)],
      ["Requested Out Time", o.request?.outTime],
      ["Expected Return Time", o.request?.inTime],
      ["Destination", o.request?.destination],
      ["Daily Trip Number", o.request?.dailyTripNumber],
      ["Reason", o.request?.reason],
      ["Current Status", o.status],
    ]);

    // --------------------------------------------------------
    // PARENT CONSENT
    // --------------------------------------------------------

    fields("Parent Consent and Phone-Call Audit", [
      ["Parent Name", o.parent?.name],
      ["Parent Phone (Masked)", o.parent?.mobileMasked],
      ["Parent Consent Status", o.parent?.status],
      ["Consent Method", o.parent?.method],
      ["Parent Decision At (IST)", when(o.parent?.decidedAt)],
      ["SMS Delivery Status", o.parent?.smsStatus],
      ["Phone Call Outcome", o.parent?.callOutcome],
      ["Call Verified At (IST)", when(o.parent?.callVerifiedAt)],
      ["Verified By Faculty", who(o.parent?.verifiedBy)],
      ["Phone Call Remarks", o.parent?.callRemarks],
    ]);

    // --------------------------------------------------------
    // PARENT PENDING + BYPASS WARNING
    // --------------------------------------------------------

    if (o.parent?.status === "PENDING" && o.bypass?.parentPendingBypass) {
      note(
        "PARENT PENDING + FACULTY BYPASS RECORDED: " +
          "The parent status remains PENDING. " +
          (o.parent.callOutcome === "CONSENT"
            ? "A phone consent outcome is recorded; inspect the accompanying audit fields."
            : "Independent phone-consent verification is not established by this report unless the phone verification fields are present."),
      );
    }

    // --------------------------------------------------------
    // FACULTY APPROVAL
    // --------------------------------------------------------

    fields("Faculty Approval and Escalation", [
      ["Approving Authority", o.faculty?.approvedRole],
      ["Approved By", who(o.faculty?.approvedBy)],
      ["Approved At (IST)", when(o.faculty?.approvedAt)],
      ["Approval Remarks", o.faculty?.approvalRemark],
      ["Assigned Role", o.faculty?.assignedRole],
      ["Assigned Faculty", who(o.faculty?.assignedTo)],
      ["Rejected By", who(o.faculty?.rejectedBy)],
      ["Rejected At (IST)", when(o.faculty?.rejectedAt)],
    ]);

    // --------------------------------------------------------
    // BYPASS AND ACKNOWLEDGEMENT
    // --------------------------------------------------------

    fields("Faculty Bypass and Parent Acknowledgement", [
      ["Bypass Used", o.bypass?.used ? "YES" : "NO"],
      [
        "Parent Pending Bypass",
        o.bypass?.parentPendingBypass ? "RECORDED" : "NO",
      ],
      ["Bypass Authority", o.bypass?.authorityRole],
      ["Performed By", who(o.bypass?.performedBy)],
      ["Performed At (IST)", when(o.bypass?.performedAt)],
      ["Bypassed Roles", (o.bypass?.bypassedRoles || []).join(", ")],
      ["Bypass Reason", o.bypass?.reason],
      ["Acknowledged By", who(o.bypass?.acknowledgedBy)],
      ["Acknowledged Role", o.bypass?.acknowledgedRole],
      ["Acknowledged At (IST)", when(o.bypass?.acknowledgedAt)],
      ["Acknowledgement Remarks", o.bypass?.acknowledgementRemark],
    ]);

    // --------------------------------------------------------
    // QR + SECURITY VERIFICATION
    // --------------------------------------------------------

    fields("QR and Campus Gate Verification", [
      ["QR Generated At", when(o.qr?.generatedAt)],
      ["QR Valid From", when(o.qr?.validFrom)],
      ["QR Expires At", when(o.qr?.expiresAt)],
      ["QR Revoked At", when(o.qr?.revokedAt)],
      ["EXIT Verified", o.security?.exitVerified ? "YES" : "NO"],
      ["Actual EXIT Time (IST)", when(o.security?.exitVerifiedAt)],
      ["EXIT Security Guard", who(o.security?.exitGuard)],
      ["EXIT Guard ID", o.security?.exitGuard?.id],
      ["ENTRY Verified", o.security?.entryVerified ? "YES" : "NO"],
      ["Actual ENTRY Time (IST)", when(o.security?.entryVerifiedAt)],
      ["ENTRY Security Guard", who(o.security?.entryGuard)],
      ["ENTRY Guard ID", o.security?.entryGuard?.id],
      ["Actual Gate At Scan", "Not Recorded in Outpass"],
    ]);

    // --------------------------------------------------------
    // RETURN NOT VERIFIED
    // --------------------------------------------------------

    if (
      o.status === "EXITED" &&
      !o.security?.entryVerifiedAt &&
      o.qr?.expiresAt &&
      new Date(o.qr.expiresAt) < new Date()
    ) {
      note(
        "RETURN NOT VERIFIED: This record remains EXITED after its QR validity ended. " +
          "Review against physical gate logs; do not automatically mark ENTRY.",
        "critical",
      );
    }

    // --------------------------------------------------------
    // ASSIGNMENT HISTORY
    // --------------------------------------------------------

    entries(
      "Faculty Assignment History",
      o.assignmentHistory,
      (h) =>
        `${when(h.transferredAt)} | ` +
        `${safe(h.fromRole)} -> ${safe(h.toRole)} | ` +
        `${safe(h.reason)} | ` +
        `${who(h.fromFaculty)} -> ${who(h.toFaculty)} | ` +
        `${safe(h.remarks)}`,
    );

    // --------------------------------------------------------
    // COMPLETE OUTPASS TIMELINE
    // --------------------------------------------------------

    entries(
      "Outpass Timeline",
      o.timeline,
      (t) =>
        `${when(t.performedAt)} | ` +
        `${safe(t.title)} | ` +
        `${safe(t.description)} | ` +
        `By: ${who(t.performedBy)}`,
    );

    // --------------------------------------------------------
    // AUDIT CONSISTENCY FLAGS
    // --------------------------------------------------------

    if (o.anomalies?.length) {
      note(`AUDIT CONSISTENCY REVIEW: ${o.anomalies.join(", ")}`, "critical");
    }
  }

  // ==========================================================
  // FOOTERS + PAGE NUMBERING
  // ==========================================================

  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);

    // Footer divider
    doc
      .moveTo(PAGE.x, 797)
      .lineTo(PAGE.x + PAGE.width, 797)
      .strokeColor(C.border)
      .lineWidth(1)
      .stroke();

    // Confidentiality footer
    doc
      .fillColor(C.muted)
      .font("Helvetica")
      .fontSize(8)
      .text(
        "CONFIDENTIAL | AMIOUT Enterprise | Authorized University Use Only",
        PAGE.x,
        806,
        {
          width: 390,
          lineBreak: false,
        },
      );

    // Page number
    doc
      .fillColor(C.navy)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(`Page ${i - range.start + 1} of ${range.count}`, 462, 806, {
        width: 91,
        align: "right",
        lineBreak: false,
      });
  }

  // ==========================================================
  // FINISH PDF STREAM
  // ==========================================================

  doc.end();
}

module.exports = Object.freeze({
  writePdf,
});
