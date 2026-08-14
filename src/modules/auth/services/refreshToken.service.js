const {
  findRefreshToken,
  findUserById,
} = require("../repositories/auth.repository");

const { verifyRefreshToken, generateAccessToken } = require("../utils/jwt");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// REFRESH TOKEN SERVICE
// ==========================================

const refreshTokenService = async (refreshToken) => {
  // ==========================================
  // TOKEN REQUIRED
  // ==========================================

  if (!refreshToken) {
    throw new Error("Refresh token is required.");
  }

  // ==========================================
  // VERIFY JWT
  // ==========================================

  const decoded = verifyRefreshToken(refreshToken);

  // ==========================================
  // FIND TOKEN
  // ==========================================

  const token = await findRefreshToken(refreshToken);

  if (!token) {
    throw new Error("Invalid refresh token.");
  }

  // ==========================================
  // REVOKED
  // ==========================================

  if (token.isRevoked) {
    throw new Error("Refresh token has expired.");
  }

  // ==========================================
  // FIND USER
  // ==========================================

  const user = await findUserById(decoded.id);

  if (!user) {
    throw new Error(AUTH_MESSAGES.USER_NOT_FOUND);
  }

  if (!user.isActive) {
    throw new Error(AUTH_MESSAGES.ACCOUNT_DISABLED);
  }

  // ==========================================
  // NEW ACCESS TOKEN
  // ==========================================

  const accessToken = generateAccessToken(user);

  // ==========================================
  // RESPONSE
  // ==========================================

  return {
    success: true,

    accessToken,

    expiresIn: "15m",
  };
};

module.exports = refreshTokenService;
