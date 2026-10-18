"use strict";

const credentialService = require("../services/credential.service");

const credentialCandidatesService = require("../services/credentialCandidates.service");

const logger = require("../../../utils/logger");

// ============================================================
// COMMON ERROR HANDLER
// ============================================================

const handleError = (res, error) => {
  logger.error("CREDENTIAL ERROR:", error?.message || "Unknown error");

  const statusCode = Number.isInteger(error.statusCode)
    ? error.statusCode
    : error.code === 11000
      ? 409
      : 500;

  return res.status(statusCode).json({
    success: false,

    message:
      statusCode === 500
        ? "Unable to process credential request."
        : error.message,
  });
};

// ============================================================
// SEND STUDENT CREDENTIALS
// ============================================================

const sendStudentCredentials = async (req, res) => {
  try {
    const result = await credentialService.sendCredentials(
      "STUDENT",
      req.params.id,
    );

    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error);
  }
};

// ============================================================
// SEND FACULTY CREDENTIALS
// ============================================================

const sendFacultyCredentials = async (req, res) => {
  try {
    const result = await credentialService.sendCredentials(
      "FACULTY",
      req.params.id,
    );

    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error);
  }
};

// ============================================================
// GET DELIVERY HISTORY
// ============================================================

const getCredentialStatuses = async (req, res) => {
  try {
    const data = await credentialService.getCredentialStatuses();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ============================================================
// GET IMPORTED STUDENT / FACULTY CANDIDATES
// ============================================================

const getCredentialCandidates = async (req, res) => {
  try {
    const data = await credentialCandidatesService.getCredentialCandidates({
      type: req.query.type,
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
    });

    // Avoid serving stale credential status results.
    res.set("Cache-Control", "no-store");

    return res.status(200).json({
      success: true,
      message: "Credential candidates fetched successfully.",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  sendStudentCredentials,
  sendFacultyCredentials,
  getCredentialStatuses,
  getCredentialCandidates,
});
