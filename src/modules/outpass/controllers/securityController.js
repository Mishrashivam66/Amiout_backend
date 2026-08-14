const asyncHandler = require("express-async-handler");

const { verifyExit } = require("../services/verifyExitService");

const verifyExitController = asyncHandler(async (req, res) => {
  const result = await verifyExit(req.params.id);

  res.status(result.success ? 200 : 400).json(result);
});

module.exports = Object.freeze({
  verifyExitController,
});
