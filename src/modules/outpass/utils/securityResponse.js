"use strict";

// ============================================================
// AMIOUT SECURITY RESPONSE
// Only information required by authorized gate security.
// Never expose QR tokens, parent approval tokens, or
// unmasked parent mobile numbers.
// ============================================================

const getFaculty = (value) => {
  if (!value) return null;

  // Not populated: do not invent a faculty name.
  if (typeof value !== "object" || !value.name) {
    return null;
  }

  return {
    id: String(value._id || ""),
    name: value.name,
    designation: value.designation || null,
  };
};

const maskMobile = (number) => {
  if (!number) return null;

  const value = String(number).trim();

  if (value.length < 4) return "****";

  return "*".repeat(value.length - 4) + value.slice(-4);
};

const getAcademicName = (value) => {
  if (value && typeof value === "object") {
    return value.name || value.code || null;
  }

  return typeof value === "string" ? value : null;
};

const buildSecurityResponse = (outpass) => {
  if (!outpass) return null;

  const parentDecision = outpass.parentDecision || {};

  const approver = getFaculty(outpass.approvedByFaculty);

  const phoneVerifier =
    parentDecision.method === "PHONE_CALL"
      ? getFaculty(parentDecision.verifiedByFaculty)
      : null;

  const facultyApproved =
    Boolean(outpass.approvedByFaculty) && Boolean(outpass.approvedAt);

  return {
    id: String(outpass._id),

    // ========================================================
    // STUDENT IDENTITY
    // ========================================================

    studentName: outpass.studentName || null,

    enrollmentNumber: outpass.enrollmentNumber || null,

    student: {
      name: outpass.studentName || null,

      enrollmentNumber: outpass.enrollmentNumber || null,

      branch: outpass.branch || null,
      course: outpass.course || null,
      semester: outpass.semester ?? null,
      section: outpass.section || null,
      group: outpass.group || null,
    },

    // ========================================================
    // ACADEMIC DETAILS
    // ========================================================

    academic: {
      institute: getAcademicName(outpass.academicInstitute),

      program: getAcademicName(outpass.academicProgram),

      department: outpass.academicDepartment || null,

      batch: outpass.academicBatch || null,
    },

    // ========================================================
    // OUTPASS DETAILS
    // ========================================================

    outpassId: outpass.outpassId,

    status: outpass.status,

    reason: outpass.reason || null,

    destination: outpass.destination || null,

    outDate: outpass.outDate || null,

    outTime: outpass.outTime || null,

    inTime: outpass.inTime ?? null,

    // ========================================================
    // PARENT INFORMATION
    // ========================================================

    parent: {
      name: outpass.parentName || null,

      mobileNumber: maskMobile(outpass.parentMobileNumber),
    },

    parentDecision: {
      status: parentDecision.status || "PENDING",

      method: parentDecision.method || null,

      decidedAt: parentDecision.decidedAt || null,

      verifiedByFaculty: phoneVerifier,

      verifiedByRole:
        parentDecision.method === "PHONE_CALL"
          ? parentDecision.verifiedByRole || null
          : null,

      callVerifiedAt:
        parentDecision.method === "PHONE_CALL"
          ? parentDecision.callVerifiedAt || null
          : null,
    },

    // Easy-to-use aliases for the frontend
    parentApproval: {
      status: parentDecision.status || "PENDING",

      method: parentDecision.method || null,

      approvedAt:
        parentDecision.status === "APPROVED"
          ? parentDecision.decidedAt || null
          : null,

      verifiedBy: phoneVerifier,

      verifiedByRole:
        parentDecision.method === "PHONE_CALL"
          ? parentDecision.verifiedByRole || null
          : null,
    },

    // ========================================================
    // UNIVERSITY APPROVAL
    // Use actual approver, never assigned faculty.
    // ========================================================

    facultyApproval: {
      status: facultyApproved ? "APPROVED" : "PENDING",

      approvedBy: approver,

      approvedAuthorityRole: outpass.approvedAuthorityRole || null,

      approvedAt: outpass.approvedAt || null,

      remark: outpass.approvalRemark || "",
    },

    universityApproval: {
      status: facultyApproved ? "APPROVED" : "PENDING",

      approvedBy: approver,

      role: outpass.approvedAuthorityRole || null,

      approvedAt: outpass.approvedAt || null,
    },

    approvedByFaculty: approver,

    approvedAuthorityRole: outpass.approvedAuthorityRole || null,

    approvedAt: outpass.approvedAt || null,

    // ========================================================
    // QR VALIDITY
    // ========================================================

    qrGenerated: outpass.qrGenerated === true,

    qrValidFrom: outpass.qrValidFrom || null,

    qrExpiresAt: outpass.qrExpiresAt || null,

    // ========================================================
    // SECURITY GATE MOVEMENT
    // ========================================================

    exitVerified: outpass.exitVerified === true,

    exitVerifiedAt: outpass.exitVerifiedAt || null,

    entryVerified: outpass.entryVerified === true,

    entryVerifiedAt: outpass.entryVerifiedAt || null,
  };
};

module.exports = {
  buildSecurityResponse,
};
