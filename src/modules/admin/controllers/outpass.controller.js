const asyncHandler = require("express-async-handler");

const outpassService = require("../services/outpass.service");

// ============================================================================
// Get All Outpasses
// ============================================================================
const getAllOutpasses = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;

  const search = req.query.search || "";
  const status = req.query.status || "";

  const result = await outpassService.getAllOutpasses({
    page,
    limit,
    search,
    status,
  });

  return res.status(200).json(result);
});

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  getAllOutpasses,
});
