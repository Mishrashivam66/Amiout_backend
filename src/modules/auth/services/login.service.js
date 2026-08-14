const {
  findUserByEmail,
  saveUser,
  saveRefreshToken,
} = require("../repositories/auth.repository");

const { generateAccessToken, generateRefreshToken } = require("../utils/jwt");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// LOGIN SERVICE
// ==========================================

const loginService = async (email, password, deviceInfo = {}) => {
  // ==========================================
  // FIND USER
  // ==========================================

  const user = await findUserByEmail(email);

  if (!user) {
    throw new Error(AUTH_MESSAGES.INVALID_CREDENTIALS);
  }

  // ==========================================
  // ACCOUNT STATUS
  // ==========================================

  if (!user.isVerified) {
    throw new Error(AUTH_MESSAGES.ACCOUNT_NOT_VERIFIED);
  }

  if (!user.isActive) {
    throw new Error(AUTH_MESSAGES.ACCOUNT_DISABLED);
  }

  // ==========================================
  // PASSWORD CHECK
  // ==========================================

  const isPasswordCorrect = await user.matchPassword(password);

  if (!isPasswordCorrect) {
    throw new Error(AUTH_MESSAGES.INVALID_CREDENTIALS);
  }

  // ==========================================
  // GENERATE TOKENS
  // ==========================================

  const accessToken = generateAccessToken(user);

  const refreshToken = generateRefreshToken(user);

  // ==========================================
  // SAVE REFRESH TOKEN
  // ==========================================

  await saveRefreshToken({
    user: user._id,
    token: refreshToken,
    device: deviceInfo.device || "Unknown Device",
    browser: deviceInfo.browser || "",
    operatingSystem: deviceInfo.operatingSystem || "",
    ipAddress: deviceInfo.ipAddress || "",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  // ==========================================
  // UPDATE LAST LOGIN
  // ==========================================

  user.lastLogin = new Date();

  await saveUser(user);

  // ==========================================
  // RESPONSE
  // ==========================================

  return {
    success: true,
    message: AUTH_MESSAGES.LOGIN_SUCCESS,
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
    },
  };
};

module.exports = loginService;
