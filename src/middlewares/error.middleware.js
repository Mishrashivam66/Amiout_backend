const AppError = require("../utils/AppError");

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

const errorHandler = (err, req, res, next) => {
  let error = err;

  if (!(error instanceof AppError)) {
    error = new AppError(
      err.message || "Internal Server Error",
      err.statusCode || 500,
    );
  }

  return res.status(error.statusCode).json({
    success: false,

    status: error.status,

    message: error.message,

    errors: error.errors,

    stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
  });
};

module.exports = errorHandler;
