"use strict";

const { approveOutpassForRole } = require("../sharedApprovalService");

module.exports = Object.freeze({
  approveOutpass: (facultyId, outpassId, remark = "") =>
    approveOutpassForRole(facultyId, outpassId, remark, "COORDINATOR"),
});
