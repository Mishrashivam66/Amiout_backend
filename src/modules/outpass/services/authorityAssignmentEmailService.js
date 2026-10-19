"use strict";

const Outpass = require("../models/Outpass");
const Mentor = require("../../auth/models/Mentor");
const { sendEmail } = require("../../auth/utils/email");

const AUTHORITY_ROLES = new Set(["HOD", "HOI"]);

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

const formatDate = (date) => {
  if (!date) return "Not specified";

  const parsed = new Date(date);

  return Number.isNaN(parsed.getTime())
    ? "Not specified"
    : new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(parsed);
};

// ============================================================
// SEND ONE EMAIL PER HOD / HOI ASSIGNMENT
//
// - NEW application
// - TRANSFER of pending request
// - Uses atomic email-status claim
// - Does not alter approval or QR state
// ============================================================

const sendAuthorityAssignmentEmail = async ({
  outpassId,
  facultyId,
  assignedRole,
  kind = "NEW",
}) => {
  const role = String(assignedRole || "")
    .trim()
    .toUpperCase();

  if (!AUTHORITY_ROLES.has(role)) {
    return {
      sent: false,
      reason: "NOT_HOD_OR_HOI",
    };
  }

  const faculty = await Mentor.findById(facultyId).select("name email").lean();

  const email = String(faculty?.email || "")
    .trim()
    .toLowerCase();

  if (!faculty || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      sent: false,
      reason: "FACULTY_EMAIL_UNAVAILABLE",
    };
  }

  // Only one concurrent caller can claim this assignment.
  const outpass = await Outpass.findOneAndUpdate(
    {
      _id: outpassId,
      status: "PENDING",
      isDeleted: false,
      assignedFaculty: facultyId,
      assignedRole: role,
      $or: [
        {
          facultyAssignmentEmailStatus: {
            $in: ["NOT_SENT", "FAILED"],
          },
        },
        {
          facultyAssignmentEmailStatus: {
            $exists: false,
          },
        },
      ],
    },
    {
      $set: {
        facultyAssignmentEmailStatus: "PENDING",
        facultyAssignmentEmailLastAttemptAt: new Date(),
      },
    },
    {
      new: true,
      runValidators: true,
    },
  ).select(
    "outpassId studentName enrollmentNumber " +
      "reason destination outDate outTime",
  );

  if (!outpass) {
    return {
      sent: false,
      reason: "ALREADY_CLAIMED_OR_CHANGED",
    };
  }

  const dashboard = role === "HOD" ? "/hod/pending" : "/hoi/pending";

  const rawBase = String(
    process.env.CLIENT_URL || process.env.FRONTEND_URL || "",
  ).trim();

  let dashboardURL = "";

  if (rawBase) {
    try {
      const url = new URL(dashboard, rawBase);

      if (
        url.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" && url.protocol === "http:")
      ) {
        dashboardURL = url.toString();
      }
    } catch (_) {
      // Email can still be delivered without a link.
    }
  }

  const transfer = kind === "TRANSFER";

  const subject =
    `AMIOUT - ${role} Outpass ` +
    `${transfer ? "Reassigned" : "Assigned"} ` +
    `(${outpass.outpassId})`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#13213a">
      <div style="background:#0b1b32;color:#fff;padding:22px;border-radius:12px 12px 0 0">
        <h2 style="margin:0;color:#ffcc62">AMIOUT Enterprise</h2>
        <p>${escapeHtml(role)} Outpass Assignment</p>
      </div>

      <div style="padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
        <p>Dear ${escapeHtml(faculty.name || "Faculty Member")},</p>

        <p>
          An outpass has been
          <b>${transfer ? "transferred" : "assigned"}</b>
          to you for review.
        </p>

        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:8px"><b>Outpass</b></td>
            <td>${escapeHtml(outpass.outpassId)}</td>
          </tr>
          <tr>
            <td style="padding:8px"><b>Student</b></td>
            <td>${escapeHtml(outpass.studentName)}</td>
          </tr>
          <tr>
            <td style="padding:8px"><b>Enrollment</b></td>
            <td>${escapeHtml(outpass.enrollmentNumber)}</td>
          </tr>
          <tr>
            <td style="padding:8px"><b>Reason</b></td>
            <td>${escapeHtml(outpass.reason)}</td>
          </tr>
          <tr>
            <td style="padding:8px"><b>Destination</b></td>
            <td>${escapeHtml(outpass.destination)}</td>
          </tr>
          <tr>
            <td style="padding:8px"><b>Date</b></td>
            <td>${escapeHtml(formatDate(outpass.outDate))}</td>
          </tr>
          <tr>
            <td style="padding:8px"><b>Out Time</b></td>
            <td>${escapeHtml(outpass.outTime)}</td>
          </tr>
        </table>

        <p><b>Faculty Status:</b> PENDING</p>

        <p>
          Please review the parent's decision and
          complete the authorized approval checks.
        </p>

        ${
          dashboardURL
            ? `<p><a href="${escapeHtml(dashboardURL)}">Open ${escapeHtml(role)} Pending Requests</a></p>`
            : ""
        }

        <p style="color:#64748b;font-size:12px">
          This is an automated AMIOUT notification.
        </p>
      </div>
    </div>
  `;

  try {
    const delivery = await sendEmail({
      to: email,
      subject,
      html,
    });

    if (delivery === false || delivery?.success === false) {
      throw new Error("Email provider did not accept the message.");
    }

    await Outpass.updateOne(
      {
        _id: outpass._id,
        assignedFaculty: facultyId,
        assignedRole: role,
        facultyAssignmentEmailStatus: "PENDING",
      },
      {
        $set: {
          facultyAssignmentEmailStatus: "SENT",
          facultyAssignmentEmailSentAt: new Date(),
        },
      },
    );

    return { sent: true };
  } catch (error) {
    await Outpass.updateOne(
      {
        _id: outpass._id,
        assignedFaculty: facultyId,
        assignedRole: role,
        facultyAssignmentEmailStatus: "PENDING",
      },
      {
        $set: {
          facultyAssignmentEmailStatus: "FAILED",
        },
      },
    );

    throw error;
  }
};

module.exports = Object.freeze({
  sendAuthorityAssignmentEmail,
});
