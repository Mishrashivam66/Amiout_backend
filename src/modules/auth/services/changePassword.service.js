const {
  findUserById,
  saveUser,
  revokeAllUserTokens,
} = require("../repositories/auth.repository");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// CHANGE PASSWORD SERVICE
// ==========================================

const changePasswordService = async (userId, oldPassword, newPassword) => {
  // ==========================================
  // FIND USER
  // ==========================================

  const user = await findUserById(userId);

  if (!user) {
    throw new Error(AUTH_MESSAGES.USER_NOT_FOUND);
  }

  // ==========================================
  // VERIFY OLD PASSWORD
  // ==========================================

  const isPasswordMatched = await user.matchPassword(oldPassword);

  if (!isPasswordMatched) {
    throw new Error("Old password is incorrect.");
  }

  // ==========================================
  // SAME PASSWORD CHECK
  // ==========================================

  if (oldPassword === newPassword) {
    throw new Error("New password must be different from the old password.");
  }

  // ==========================================
  // UPDATE PASSWORD
  // ==========================================

  user.password = newPassword;

  user.passwordChangedAt = new Date();

  await saveUser(user);

  // ==========================================
  // LOGOUT FROM ALL DEVICES
  // ==========================================

  await revokeAllUserTokens(user._id);

  // ==========================================
  // RESPONSE
  // ==========================================

  return {
    success: true,

    message: AUTH_MESSAGES.PASSWORD_CHANGED,
  };
};

module.exports = changePasswordService;
