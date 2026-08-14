const applyService = require("./applyOutpassService");
const approveService = require("./approveOutpassService");
const rejectService = require("./rejectOutpassService");

const historyService = require("./historyService");
const dashboardService = require("./dashboardService");
const cancelService = require("./cancelOutpassService");

module.exports = Object.freeze({
  ...applyService,
  ...approveService,
  ...rejectService,

  ...historyService,
  ...dashboardService,
  ...cancelService,
});
