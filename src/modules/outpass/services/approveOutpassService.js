"use strict";

const { approveOutpassForRole } = require("./sharedApprovalService");

// ============================================================
// AMIOUT ENTERPRISE - FACULTY APPROVAL ENTRY POINT
//
// Mentor approval uses unified service by default.
// Coordinator, HOD and HOI must pass a trusted role
// from their protected backend controllers.
//
// No legacy approval fallback.
// ============================================================

const approveOutpass = async (
  facultyId,
  outpassId,
  remark = "",
  trustedActiveRole = "MENTOR",
) => {
  return approveOutpassForRole(facultyId, outpassId, remark, trustedActiveRole);
};

module.exports = Object.freeze({
  approveOutpass,
});
