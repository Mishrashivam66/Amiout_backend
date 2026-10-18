"use strict";

const legacy = require("./legacyApproveOutpassService");

const { approveOutpassForRole } = require("./sharedApprovalService");

const approveOutpass = (
  facultyId,
  outpassId,
  remark = "",
  trustedActiveRole = null,
) => {
  // Existing Mentor/Coordinator controllers remain compatible.
  if (!trustedActiveRole) {
    return legacy.approveOutpass(facultyId, outpassId, remark);
  }

  return approveOutpassForRole(facultyId, outpassId, remark, trustedActiveRole);
};

module.exports = Object.freeze({
  approveOutpass,
});
