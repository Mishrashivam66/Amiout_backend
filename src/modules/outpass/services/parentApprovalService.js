"use strict";

const crypto = require("crypto");

const Outpass = require("../models/Outpass");

const authRepository = require("../../auth/repositories/auth.repository");

const { sendEmail } = require("../../auth/utils/email");

const TOKEN_BYTES = 32;

// ============================================================
// HELPERS
// ============================================================

const createError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return replacements[char];
  });

const getExpiryMinutes = () => {
  const value = Number(process.env.PARENT_APPROVAL_LINK_EXPIRY_MINUTES || 30);

  return Number.isInteger(value) && value >= 5 && value <= 1440 ? value : 30;
};

const validateToken = (token) => {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
    throw createError("Invalid parent approval link.", 400);
  }

  return hashToken(token);
};

// ============================================================
// STUDENT EMAIL RESOLUTION
// ============================================================

const getStudentEmail = async (studentId) => {
  if (!studentId) {
    return null;
  }

  const student = await authRepository.findUserById(studentId);

  if (!student) {
    return null;
  }

  const email = String(student.email || "")
    .trim()
    .toLowerCase();

  return email || null;
};

// ============================================================
// SEND PARENT DECISION EMAIL TO STUDENT
// ============================================================

const notifyStudentOfParentDecision = async ({ outpass, decision }) => {
  const email = await getStudentEmail(outpass.student);

  if (!email) {
    console.warn(
      "AMIOUT: Student email unavailable for outpass",
      outpass.outpassId,
    );

    return {
      sent: false,
      reason: "STUDENT_EMAIL_NOT_FOUND",
    };
  }

  const approved = decision === "APPROVED";

  const subject = approved
    ? "AMIOUT - Parent Approved Your Outpass"
    : "AMIOUT - Parent Rejected Your Outpass";

  const statusText = approved ? "Approved by Parent" : "Rejected by Parent";

  const explanation = approved
    ? "Your parent has approved your outpass " +
      "request. Your request is now awaiting " +
      "approval from the assigned faculty."
    : "Your parent has rejected your outpass " +
      "request. Please check your AMIOUT " +
      "dashboard for further details.";

  const nextStep = approved
    ? "Your digital QR pass will become available " +
      "only after the required faculty approval " +
      "and security checks are completed."
    : "A rejected parent decision cannot be " +
      "silently overridden by faculty.";

  const html = `
    <div style="
      font-family:Arial,sans-serif;
      max-width:600px;
      margin:0 auto;
      padding:24px;
      color:#172033;
    ">
      <h2 style="color:#087f5b;">
        AMIOUT - Parent Approval Update
      </h2>

      <p>
        Dear ${escapeHtml(outpass.studentName || "Student")},
      </p>

      <p>${escapeHtml(explanation)}</p>

      <div style="
        background:#f5f7fa;
        padding:16px;
        border-radius:8px;
        margin:20px 0;
      ">
        <p>
          <strong>Outpass ID:</strong>
          ${escapeHtml(outpass.outpassId)}
        </p>

        <p>
          <strong>Destination:</strong>
          ${escapeHtml(outpass.destination || "-")}
        </p>

        <p>
          <strong>Parent Decision:</strong>
          ${escapeHtml(statusText)}
        </p>
      </div>

      <p>${escapeHtml(nextStep)}</p>

      <p>
        Log in to your AMIOUT Student Dashboard
        to view the latest status.
      </p>

      <p>
        Regards,<br />
        <strong>AMIOUT Team</strong>
      </p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject,
    html,
  });

  return {
    sent: true,
  };
};

// ============================================================
// CREATE SECURE PARENT APPROVAL TOKEN
// ============================================================

const createParentApprovalToken = async (outpassId) => {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");

  const tokenHash = hashToken(token);

  const now = new Date();

  const expiresAt = new Date(now.getTime() + getExpiryMinutes() * 60 * 1000);

  const updated = await Outpass.findOneAndUpdate(
    {
      _id: outpassId,
      status: "PENDING",
      "parentDecision.status": "PENDING",
      isDeleted: false,
    },
    {
      $set: {
        "parentDecision.tokenHash": tokenHash,
        "parentDecision.tokenExpiresAt": expiresAt,
        "parentDecision.tokenUsedAt": null,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) {
    throw createError("Parent approval link cannot be generated.", 409);
  }

  // Never store or expose the raw token to students.
  return {
    token,
    expiresAt,
  };
};

// ============================================================
// REVIEW OUTPASS THROUGH SECURE TOKEN
// ============================================================

const reviewOutpass = async (token) => {
  const tokenHash = validateToken(token);

  const outpass = await Outpass.findOne({
    "parentDecision.tokenHash": tokenHash,
    "parentDecision.tokenExpiresAt": {
      $gt: new Date(),
    },
    "parentDecision.tokenUsedAt": null,
    "parentDecision.status": "PENDING",
    status: "PENDING",
    isDeleted: false,
  })
    .select(
      "outpassId studentName enrollmentNumber " +
        "outDate outTime inTime destination reason " +
        "parentDecision.status " +
        "parentDecision.tokenExpiresAt",
    )
    .lean();

  if (!outpass) {
    throw createError(
      "This approval link is invalid, expired or already used.",
      410,
    );
  }

  return {
    outpassId: outpass.outpassId,
    studentName: outpass.studentName,
    enrollmentNumber: outpass.enrollmentNumber,
    outDate: outpass.outDate,
    outTime: outpass.outTime,
    inTime: outpass.inTime || null,
    destination: outpass.destination,
    reason: outpass.reason,
    parentStatus: "PENDING",
    expiresAt: outpass.parentDecision.tokenExpiresAt,
  };
};

// ============================================================
// PARENT APPROVE / REJECT
// ============================================================

const submitParentDecision = async (token, decision) => {
  const tokenHash = validateToken(token);

  const normalizedDecision = String(decision || "")
    .trim()
    .toUpperCase();

  if (!["APPROVED", "REJECTED"].includes(normalizedDecision)) {
    throw createError("Decision must be APPROVED or REJECTED.", 400);
  }

  const now = new Date();

  // Atomic update ensures:
  // - One-time link usage
  // - No duplicate parent decisions
  // - No changes after link expiry
  // - No changes to a non-pending outpass

  const outpass = await Outpass.findOneAndUpdate(
    {
      "parentDecision.tokenHash": tokenHash,
      "parentDecision.tokenExpiresAt": {
        $gt: now,
      },
      "parentDecision.tokenUsedAt": null,
      "parentDecision.status": "PENDING",
      status: "PENDING",
      isDeleted: false,
    },
    {
      $set: {
        "parentDecision.status": normalizedDecision,
        "parentDecision.method": "SMS_LINK",
        "parentDecision.decidedAt": now,
        "parentDecision.tokenUsedAt": now,
      },
      $unset: {
        "parentDecision.tokenHash": "",
      },
    },
    {
      new: true,
      runValidators: true,
    },
  ).select(
    "student studentName outpassId destination " +
      "parentDecision.status parentDecision.decidedAt",
  );

  if (!outpass) {
    throw createError(
      "Link expired, already used or request no longer pending.",
      409,
    );
  }

  // ==========================================================
  // EMAIL STUDENT AFTER SUCCESSFUL DATABASE UPDATE
  // ==========================================================

  try {
    await notifyStudentOfParentDecision({
      outpass,
      decision: normalizedDecision,
    });

    console.log(
      "Parent decision student email processed:",
      outpass.outpassId,
      normalizedDecision,
    );
  } catch (error) {
    // Email failure must never undo an accepted decision.
    console.error(
      "AMIOUT parent decision email failed:",
      outpass.outpassId,
      error.message,
    );
  }

  // ==========================================================
  // RESPONSE
  // ==========================================================

  return {
    outpassId: outpass.outpassId,
    parentStatus: outpass.parentDecision.status,
    decidedAt: outpass.parentDecision.decidedAt,
    message:
      normalizedDecision === "APPROVED"
        ? "Parent approval recorded successfully."
        : "Parent rejection recorded successfully.",
  };
};

module.exports = Object.freeze({
  createParentApprovalToken,
  reviewOutpass,
  submitParentDecision,
});
