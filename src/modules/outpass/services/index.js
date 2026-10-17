"use strict";

const applyService = require("./applyOutpassService");
const approveService = require("./approveOutpassService");
const rejectService = require("./rejectOutpassService");

const historyService = require("./historyService");
const dashboardService = require("./dashboardService");
const cancelService = require("./cancelOutpassService");

if (typeof approveService.approveOutpass !== "function") {
  throw new Error("approveOutpassService export is missing.");
}

module.exports = Object.freeze({
  ...applyService,
  ...rejectService,
  ...historyService,
  ...dashboardService,
  ...cancelService,

  // Ensure correct faculty approval implementation.
  approveOutpass: approveService.approveOutpass,
});
