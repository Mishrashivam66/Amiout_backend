"use strict";

const crypto = require("node:crypto");

const Outpass = require("../models/Outpass");
const authRepository = require("../../auth/repositories/auth.repository");

const { sendEmail } = require("../../auth/utils/email");
const { createQRToken, getValidityWindow } = require("./qrService");

// ============================================================
// CONSTANTS
// ============================================================

const TOKEN_BYTES = 32;
const PARENT_ACTIONABLE_STATUSES = ["PENDING", "APPROVED"];

// ============================================================
// HELPERS
// ============================================================

const createError = (message, statusCode = 400) =>
  Object.assign(new Error(message), {
    statusCode,
  });

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
// RESOLVE STUDENT EMAIL
// ============================================================

const getStudentEmail = async (studentId) => {
  if (!studentId) {
    return null;
  }

  const student = await authRepository.findUserById(studentId);

  if (!student) {
    return null;
  }

  return (
    String(student.email || "")
      .trim()
      .toLowerCase() || null
  );
};

// ============================================================
// EMAIL STUDENT AFTER PARENT DECISION
// ============================================================

const notifyStudentOfParentDecision = async ({
  outpass,
  decision,
  qrStatus,
}) => {
  const email = await getStudentEmail(outpass.student);

  if (!email) {
    console.warn("AMIOUT: Student email unavailable:", outpass.outpassId);

    return {
      sent: false,
      reason: "STUDENT_EMAIL_NOT_FOUND",
    };
  }

  const approved = decision === "APPROVED";

  const subject = approved
    ? "AMIOUT - Parent Approved Your Outpass"
    : "AMIOUT - Parent Rejected Your Outpass";

  let explanation;
  let nextStep;

  if (!approved) {
    explanation = "Your parent has rejected this outpass request.";

    nextStep =
      "The outpass cannot be used, and any previously issued QR has been revoked.";
  } else if (qrStatus === "READY") {
    explanation =
      "Your parent has approved your outpass and university faculty approval is already recorded.";

    nextStep =
      "Your secure QR is ready. Open the AMIOUT Student Dashboard to view it within its validity window.";
  } else if (qrStatus === "AWAITING_FACULTY") {
    explanation = "Your parent has approved your outpass request.";

    nextStep =
      "Your QR will be generated after the assigned authorized faculty approves the request.";
  } else if (qrStatus === "EXPIRED") {
    explanation = "Your parent has approved your outpass request.";

    nextStep =
      "The outpass QR validity window has expired, so no new QR can be issued. Contact your university authority if needed.";
  } else {
    explanation = "Your parent has approved your outpass request.";

    nextStep =
      "QR issuance is still incomplete. Please contact the university authority if the QR is not available.";
  }

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

      <p>
        ${escapeHtml(explanation)}
      </p>

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
          ${approved ? "Approved by Parent" : "Rejected by Parent"}
        </p>
      </div>

      <p>
        ${escapeHtml(nextStep)}
      </p>

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

      status: {
        $in: PARENT_ACTIONABLE_STATUSES,
      },

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

  // Raw token is returned only to the trusted caller
  // responsible for sending the parent SMS.

  return {
    token,
    expiresAt,
  };
};

// ============================================================
// REVIEW OUTPASS THROUGH SECURE PARENT LINK
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

    status: {
      $in: PARENT_ACTIONABLE_STATUSES,
    },

    isDeleted: false,
  })
    .select(
      "outpassId studentName enrollmentNumber " +
        "outDate outTime inTime " +
        "destination reason status " +
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

    facultyApprovalStatus:
      outpass.status === "APPROVED" ? "APPROVED" : "PENDING",

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

  // Retry if faculty approval changes during parent submission.

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = new Date();

    // ========================================================
    // STEP 1: FIND VALID PARENT APPROVAL LINK
    // ========================================================

    const outpass = await Outpass.findOne({
      "parentDecision.tokenHash": tokenHash,

      "parentDecision.tokenExpiresAt": {
        $gt: now,
      },

      "parentDecision.tokenUsedAt": null,
      "parentDecision.status": "PENDING",

      status: {
        $in: PARENT_ACTIONABLE_STATUSES,
      },

      isDeleted: false,
    }).select(
      "_id student studentName " +
        "outpassId destination outDate " +
        "status approvedAt approvedByFaculty " +
        "parentDecision.status " +
        "parentDecision.tokenExpiresAt",
    );

    if (!outpass) {
      throw createError(
        "Link expired, already used or request no longer eligible for parent consent.",
        409,
      );
    }

    // ========================================================
    // STEP 2: CHECK FACULTY APPROVAL
    // ========================================================

    const facultyApproved =
      outpass.status === "APPROVED" &&
      Boolean(outpass.approvedAt) &&
      Boolean(outpass.approvedByFaculty);

    let qr = null;
    let qrStatus = "AWAITING_FACULTY";

    // ========================================================
    // STEP 3: GENERATE QR CONDITIONALLY
    // ========================================================

    if (normalizedDecision === "APPROVED") {
      if (outpass.status === "APPROVED" && !facultyApproved) {
        qrStatus = "FACULTY_RECORD_INCOMPLETE";
      } else if (facultyApproved) {
        let expired = false;

        try {
          const { expiresAt } = getValidityWindow(outpass.outDate);

          expired = now >= expiresAt;
        } catch (error) {
          console.error("AMIOUT: Invalid QR validity window:", error.message);

          qrStatus = "QR_ISSUANCE_PENDING";
          expired = true;
        }

        if (expired) {
          if (qrStatus !== "QR_ISSUANCE_PENDING") {
            qrStatus = "EXPIRED";
          }
        } else {
          try {
            qr = createQRToken(outpass, now);
            qrStatus = "READY";
          } catch (error) {
            console.error(
              "AMIOUT: QR generation failed after parent consent:",
              error.message,
            );

            qrStatus = "QR_ISSUANCE_PENDING";
          }
        }
      }
    } else {
      qrStatus = "REJECTED";
    }

    // ========================================================
    // STEP 4: PREPARE VERIFIED DECISION
    // ========================================================

    const updates = {
      // Parent decision
      "parentDecision.status": normalizedDecision,
      "parentDecision.method": "SMS_LINK",
      "parentDecision.decidedAt": now,
      "parentDecision.tokenUsedAt": now,

      // If parent rejects, immediately reject the outpass
      ...(normalizedDecision === "REJECTED"
        ? {
            status: "REJECTED",
            rejectedAt: now,
            rejectionRemark: "Outpass rejected by parent.",
          }
        : {}),

      // QR details
      qrGenerated: Boolean(qr),
      qrGeneratedAt: qr?.qrGeneratedAt || null,
      qrToken: qr?.token || null,
      qrValidFrom: qr?.qrValidFrom || null,
      qrExpiresAt: qr?.qrExpiresAt || null,

      // Revoke QR when parent rejects
      qrRevokedAt: normalizedDecision === "REJECTED" ? now : null,
    };

    // ========================================================
    // STEP 5: ATOMIC FILTER
    // ========================================================

    const filter = {
      _id: outpass._id,

      "parentDecision.tokenHash": tokenHash,

      "parentDecision.tokenExpiresAt": {
        $gt: now,
      },

      "parentDecision.tokenUsedAt": null,
      "parentDecision.status": "PENDING",

      status: outpass.status,
      isDeleted: false,

      approvedAt: outpass.approvedAt || null,
      approvedByFaculty: outpass.approvedByFaculty || null,
    };

    // ========================================================
    // STEP 6: ATOMIC DATABASE UPDATE
    // ========================================================

    let updated;

    try {
      updated = await Outpass.findOneAndUpdate(
        filter,
        {
          $set: updates,

          $unset: {
            "parentDecision.tokenHash": "",
          },
        },
        {
          new: true,
          runValidators: true,
        },
      ).select(
        "student studentName " +
          "outpassId destination outDate " +
          "status approvedAt " +
          "approvedByFaculty " +
          "parentDecision.status " +
          "parentDecision.decidedAt " +
          "qrGenerated",
      );
    } catch (error) {
      if (
        error.code === 112 ||
        error.hasErrorLabel?.("TransientTransactionError")
      ) {
        continue;
      }

      throw error;
    }

    if (!updated) {
      // Faculty approval may have been committed concurrently.
      // Recheck the updated state.
      continue;
    }

    // ========================================================
    // STEP 7: NOTIFY STUDENT
    // ========================================================

    try {
      await notifyStudentOfParentDecision({
        outpass: updated,
        decision: normalizedDecision,
        qrStatus,
      });
    } catch (error) {
      console.error(
        "AMIOUT parent decision email failed:",
        updated.outpassId,
        error.message,
      );
    }

    // ========================================================
    // STEP 8: SUCCESS RESPONSE
    // ========================================================

    let message;

    if (normalizedDecision === "REJECTED") {
      message = "Parent rejection recorded. QR access blocked.";
    } else if (qrStatus === "READY") {
      message =
        "Parent consent verified. Faculty approval complete; QR issued.";
    } else if (qrStatus === "AWAITING_FACULTY") {
      message =
        "Parent consent verified. Awaiting faculty approval before QR issuance.";
    } else if (qrStatus === "EXPIRED") {
      message =
        "Parent consent verified, but the QR validity window has expired.";
    } else {
      message = "Parent consent verified. QR issuance requires follow-up.";
    }

    return {
      outpassId: updated.outpassId,
      parentStatus: updated.parentDecision.status,

      facultyApprovalStatus:
        normalizedDecision === "REJECTED"
          ? "BLOCKED"
          : updated.status === "APPROVED" &&
              Boolean(updated.approvedAt) &&
              Boolean(updated.approvedByFaculty)
            ? "APPROVED"
            : "PENDING",

      qrGenerated: updated.qrGenerated === true,
      qrStatus,
      decidedAt: updated.parentDecision.decidedAt,
      message,
    };
  }

  throw createError("Outpass changed during consent. Refresh and retry.", 409);
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  createParentApprovalToken,
  reviewOutpass,
  submitParentDecision,
});
