// ==========================================
// APP ERROR CLASS
// ==========================================

class AppError extends Error {
  constructor(message, statusCode = 500, errors = []) {
    super(message);

    this.statusCode = statusCode;

    this.success = false;

    this.errors = errors;

    this.status = String(statusCode).startsWith("4") ? "fail" : "error";

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
