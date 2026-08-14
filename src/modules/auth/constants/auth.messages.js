const AUTH_MESSAGES = Object.freeze({
  REGISTER_SUCCESS: "Registration successful. Please verify your email.",

  LOGIN_SUCCESS: "Login successful.",

  LOGOUT_SUCCESS: "Logout successful.",

  OTP_SENT: "OTP sent successfully.",

  OTP_VERIFIED: "OTP verified successfully.",

  INVALID_OTP: "Invalid or expired OTP.",

  USER_NOT_FOUND: "User not found.",

  INVALID_CREDENTIALS: "Invalid email or password.",

  ACCOUNT_NOT_VERIFIED: "Please verify your account first.",

  ACCOUNT_DISABLED: "Your account has been disabled.",

  PASSWORD_RESET_LINK_SENT: "Password reset link sent successfully.",

  PASSWORD_RESET_SUCCESS: "Password reset successful.",

  PASSWORD_CHANGED: "Password changed successfully.",

  ACCESS_DENIED: "Access denied.",

  UNAUTHORIZED: "Unauthorized access.",
});

module.exports = AUTH_MESSAGES;
