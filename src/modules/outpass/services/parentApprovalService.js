"use strict";

const crypto = require("crypto");

const Outpass = require("../models/Outpass");

const TOKEN_BYTES = 32;

const createError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

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
// CREATE SECURE TOKEN
// Called when an outpass is created.
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
    { new: true },
  );

  if (!updated) {
    throw createError("Parent approval link cannot be generated.", 409);
  }

  // Raw token must only be passed to the SMS provider.
  // Never persist it or return it to the student.
  return {
    token,
    expiresAt,
  };
};

// ============================================================
// REVIEW OUTPASS THROUGH TOKEN
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
        "outDate outTime destination reason " +
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

  // Atomic update:
  // The same token cannot be used twice.
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
    "outpassId studentName parentDecision.status " + "parentDecision.decidedAt",
  );

  if (!outpass) {
    throw createError(
      "Link expired, already used or request no longer pending.",
      409,
    );
  }

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
