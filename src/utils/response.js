// ==========================================
// SUCCESS RESPONSE
// ==========================================

const successResponse = (res, message, data = {}, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,

    message,

    data,
  });
};

// ==========================================
// ERROR RESPONSE
// ==========================================

const errorResponse = (res, message, statusCode = 400, errors = []) => {
  return res.status(statusCode).json({
    success: false,

    message,

    errors,
  });
};

module.exports = {
  successResponse,

  errorResponse,
};
