const jwt = require("jsonwebtoken");

const { AUTH_CONSTANTS } = require("../constants");

// ============================================================================
// Generate Access Token
// ============================================================================
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRES,
    },
  );
};

// ============================================================================
// Generate Refresh Token
// ============================================================================
const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRES,
    },
  );
};

// ============================================================================
// Verify Access Token
// ============================================================================
const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};

// ============================================================================
// Verify Refresh Token
// ============================================================================
const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

// ============================================================================
// Decode Token
// ============================================================================
const decodeToken = (token) => {
  return jwt.decode(token);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
};
