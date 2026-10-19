"use strict";

const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");

// ============================================================
// COMMON HELPERS
// ============================================================

const getSecurityId = (req) => req.user?._id || req.user?.id;

const getSecurityAccount = (req) => {
  const securityId = getSecurityId(req);

  if (
    !securityId ||
    !mongoose.isValidObjectId(securityId) ||
    req.auth?.role !== "SECURITY" ||
    req.auth?.accountType !== "SECURITY"
  ) {
    return null;
  }

  return {
    securityId,
    account: req.user,
  };
};

// ============================================================
// GET SECURITY PROFILE
//
// Uses authenticated Security account.
// Never returns password, tokens or reset secrets.
// ============================================================

const getSecurityProfile = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const context = getSecurityAccount(req);

  if (!context) {
    return res.status(403).json({
      success: false,
      message: "Authorized Security Guard access required.",
    });
  }

  const security = context.account;

  return res.status(200).json({
    success: true,
    message: "Security profile retrieved successfully.",

    data: {
      _id: context.securityId,

      name: security.name || "",
      email: security.email || "",

      phone: security.phone || security.mobileNumber || "",

      employeeId: security.employeeId || security.securityId || "",

      role: "SECURITY",

      assignedGate: security.assignedGate || security.gate || "",

      isActive: security.isActive,

      createdAt: security.createdAt || null,
    },
  });
});

// ============================================================
// GET SECURITY GATE HISTORY
//
// Shows movements verified by this Security Guard.
//
// Does not expose QR secrets or parent contact details.
// ============================================================

const getSecurityGateHistory = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const context = getSecurityAccount(req);

  if (!context) {
    return res.status(403).json({
      success: false,
      message: "Authorized Security Guard access required.",
    });
  }

  const securityId = new mongoose.Types.ObjectId(String(context.securityId));

  // Query only outpasses handled by this guard.

  const outpasses = await Outpass.find({
    isDeleted: false,

    $or: [{ exitVerifiedBy: securityId }, { entryVerifiedBy: securityId }],
  })
    .select(
      "studentName enrollmentNumber outpassId " +
        "exitVerified exitVerifiedAt exitVerifiedBy " +
        "entryVerified entryVerifiedAt entryVerifiedBy",
    )
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();

  const records = [];

  for (const outpass of outpasses) {
    // EXIT EVENT

    if (
      outpass.exitVerified === true &&
      outpass.exitVerifiedAt &&
      String(outpass.exitVerifiedBy || "") === String(securityId)
    ) {
      records.push({
        _id: `${outpass._id}-EXIT`,

        outpassId: outpass.outpassId,
        studentName: outpass.studentName,
        enrollmentNumber: outpass.enrollmentNumber,

        movement: "EXIT",
        verifiedAt: outpass.exitVerifiedAt,

        verifiedBy: {
          name: context.account.name || "Security Officer",
        },
      });
    }

    // ENTRY EVENT

    if (
      outpass.entryVerified === true &&
      outpass.entryVerifiedAt &&
      String(outpass.entryVerifiedBy || "") === String(securityId)
    ) {
      records.push({
        _id: `${outpass._id}-ENTRY`,

        outpassId: outpass.outpassId,
        studentName: outpass.studentName,
        enrollmentNumber: outpass.enrollmentNumber,

        movement: "ENTRY",
        verifiedAt: outpass.entryVerifiedAt,

        verifiedBy: {
          name: context.account.name || "Security Officer",
        },
      });
    }
  }

  // Latest movement first.

  records.sort(
    (a, b) =>
      new Date(b.verifiedAt).getTime() - new Date(a.verifiedAt).getTime(),
  );

  return res.status(200).json({
    success: true,

    message: "Security gate history retrieved successfully.",

    data: {
      records,

      summary: {
        total: records.length,

        exits: records.filter((item) => item.movement === "EXIT").length,

        entries: records.filter((item) => item.movement === "ENTRY").length,
      },
    },
  });
});

// ============================================================
// EXPORT
// ============================================================

module.exports = Object.freeze({
  getSecurityProfile,
  getSecurityGateHistory,
});
