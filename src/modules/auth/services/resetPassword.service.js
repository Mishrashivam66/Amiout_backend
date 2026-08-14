const {
  findUserByEmail,
  saveUser,
} = require("../repositories/auth.repository");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// RESET PASSWORD SERVICE
// ==========================================

const resetPasswordService = async (email, password) => {
  // ==========================================
  // FIND USER
  // ==========================================

  const user = await findUserByEmail(email);

  if (!user) {
    throw new Error(AUTH_MESSAGES.USER_NOT_FOUND);
  }

  // ==========================================
  // UPDATE PASSWORD
  // ==========================================

  user.password = password;

  user.passwordChangedAt = new Date();

  // ==========================================
  // SAVE USER
  // ==========================================

  await saveUser(user);

  // ==========================================
  // RESPONSE
  // ==========================================

  return {
    success: true,
    message: AUTH_MESSAGES.PASSWORD_RESET_SUCCESS,
  };
};

module.exports = resetPasswordService;
