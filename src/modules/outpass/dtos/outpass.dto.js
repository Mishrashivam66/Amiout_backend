"use strict";

// ============================================================
// HELPERS
// ============================================================

const getId = (value) => {
  if (!value) return null;

  if (value._id) {
    return String(value._id);
  }

  return String(value);
};

const getValue = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return value;
};

const getFaculty = (faculty) => {
  if (!faculty) return null;

  // Faculty ObjectId may be present without populated data.
  // Never substitute the assigned mentor's name.
  const isPopulated =
    typeof faculty === "object" && typeof faculty.name === "string";

  return {
    id: getId(faculty),

    name: isPopulated ? faculty.name : null,

    designation: isPopulated ? faculty.designation || null : null,

    email: isPopulated ? faculty.email || null : null,
  };
};

const getParentDecision = (decision) => ({
  status: decision?.status || "PENDING",

  method: decision?.method || null,

  decidedAt: decision?.decidedAt || null,

  callOutcome: decision?.callOutcome || null,

  callVerifiedAt: decision?.callVerifiedAt || null,
});

// ============================================================
// OUTPASS DTO
// ============================================================

const outpassDTO = (outpass) => {
  if (!outpass) return null;

  // ==========================================================
  // ACTUAL APPROVING FACULTY
  // ==========================================================

  const approvingFaculty = getFaculty(outpass.approvedByFaculty);

  const facultyApprovalStatus =
    outpass.approvedByFaculty && outpass.approvedAt
      ? "APPROVED"
      : outpass.status === "REJECTED"
        ? "REJECTED"
        : "PENDING";

  return {
    // ========================================================
    // IDENTIFICATION
    // ========================================================

    id: getId(outpass._id),

    outpassId: outpass.outpassId,

    status: outpass.status,

    // ========================================================
    // STUDENT INFORMATION
    // ========================================================

    student: {
      id: getId(outpass.student),

      name: getValue(outpass.studentName),

      enrollmentNumber: getValue(outpass.enrollmentNumber),

      course: getValue(outpass.course),

      branch: getValue(outpass.branch),

      semester: getValue(outpass.semester),

      section: getValue(outpass.section),

      group: getValue(outpass.group),
    },

    // Flat fields for existing Security Dashboard.
    studentName: getValue(outpass.studentName),

    enrollmentNumber: getValue(outpass.enrollmentNumber),

    branch: getValue(outpass.branch),

    course: getValue(outpass.course),

    semester: getValue(outpass.semester),

    section: getValue(outpass.section),

    group: getValue(outpass.group),

    // ========================================================
    // ASSIGNED MENTOR
    // Retained for compatibility.
    // This is NOT necessarily the approving faculty.
    // ========================================================

    mentor: getFaculty(outpass.mentor),

    assignedFaculty: getFaculty(outpass.assignedFaculty),

    assignedRole: outpass.assignedRole || null,

    // ========================================================
    // PARENT INFORMATION
    // ========================================================

    parent: {
      name: getValue(outpass.parentName),

      email: getValue(outpass.parentEmail),

      mobileNumber: getValue(outpass.parentMobileNumber),
    },

    // ========================================================
    // PARENT APPROVAL
    // Never expose parent approval token/hash.
    // ========================================================

    parentDecision: getParentDecision(outpass.parentDecision),

    parentApproval: getParentDecision(outpass.parentDecision),

    // ========================================================
    // UNIVERSITY / FACULTY APPROVAL
    // Actual faculty who approved this outpass.
    // ========================================================

    facultyApproval: {
      status: facultyApprovalStatus,

      approvedBy: approvingFaculty,

      approvedAuthorityRole: outpass.approvedAuthorityRole || null,

      approvedAt: outpass.approvedAt || null,

      remark: outpass.approvalRemark || "",
    },

    // Additional fields for API compatibility.
    approvedByFaculty: approvingFaculty,

    approvedAuthorityRole: outpass.approvedAuthorityRole || null,

    approvedAt: outpass.approvedAt || null,

    approvalRemark: outpass.approvalRemark || "",

    // ========================================================
    // LEGACY MENTOR REMARK
    // ========================================================

    mentorRemark: outpass.mentorRemark || null,

    // ========================================================
    // OUTPASS REQUEST
    // ========================================================

    reason: outpass.reason,

    destination: outpass.destination,

    outDate: outpass.outDate,

    outTime: outpass.outTime,

    // Optional planned return time.
    inTime: outpass.inTime ?? null,

    // Retained for old records.
    expectedReturn: outpass.expectedReturn ?? null,

    // ========================================================
    // QR DETAILS
    // Never expose the raw QR token here.
    // ========================================================

    qrGenerated: outpass.qrGenerated === true,

    qrGeneratedAt: outpass.qrGeneratedAt || null,

    qrValidFrom: outpass.qrValidFrom || null,

    qrExpiresAt: outpass.qrExpiresAt || null,

    qrRevokedAt: outpass.qrRevokedAt || null,

    // ========================================================
    // SECURITY EXIT
    // ========================================================

    exitVerified: outpass.exitVerified === true,

    exitVerifiedAt: outpass.exitVerifiedAt || null,

    // ========================================================
    // SECURITY ENTRY
    // ========================================================

    entryVerified: outpass.entryVerified === true,

    entryVerifiedAt: outpass.entryVerifiedAt || null,

    // ========================================================
    // OTHER TIMESTAMPS
    // ========================================================

    rejectedAt: outpass.rejectedAt || null,

    cancelledAt: outpass.cancelledAt || null,

    createdAt: outpass.createdAt || null,

    updatedAt: outpass.updatedAt || null,
  };
};

// ============================================================
// OUTPASS LIST DTO
// ============================================================

const outpassListDTO = (outpasses = []) => {
  if (!Array.isArray(outpasses)) {
    return [];
  }

  return outpasses.map(outpassDTO);
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  outpassDTO,
  outpassListDTO,
};
