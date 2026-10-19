"use strict";

const {
  registerService,
  loginService,

  verifyOtpService,
  resendOtpService,

  // ACCOUNT ACTIVATION
  requestActivationOtpService,
  verifyActivationOtpService,
  resendActivationOtpService,

  forgotPasswordService,
  verifyResetOtpService,
  resendResetOtpService,
  resetPasswordService,

  changePasswordService,
  refreshTokenService,
  logoutService,
  getProfileService,
  updateProfileService,
  switchRoleService,
} = require("../services");

// ==========================================
// REFRESH TOKEN COOKIE CONFIG
// ==========================================

const getRefreshCookieOptions = () => {
  const isDeployed =
    process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isDeployed,
    sameSite: isDeployed ? "none" : "lax",
    path: "/",
  };
};

const clearRefreshCookie = (res) => {
  res.clearCookie("refreshToken", getRefreshCookieOptions());
};

// ==========================================
// REGISTER
// ==========================================

const register = async (req, res, next) => {
  try {
    const result = await registerService(req.body);

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// LOGIN
// ==========================================

const login = async (req, res, next) => {
  try {
    const deviceInfo = {
      device: req.headers["user-agent"] || "",

      browser: req.headers["sec-ch-ua"] || "",

      operatingSystem: req.headers["sec-ch-ua-platform"] || "",

      ipAddress: req.ip || "",
    };

    const result = await loginService(
      req.body?.email,
      req.body?.password,
      deviceInfo,
    );

    res.cookie("refreshToken", result.refreshToken, {
      ...getRefreshCookieOptions(),
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const mustChangePassword =
      result.mustChangePassword === true ||
      result.user?.mustChangePassword === true;

    return res.status(200).json({
      success: result.success,
      message: result.message,

      accessToken: result.accessToken,

      user: {
        ...result.user,
        mustChangePassword,
      },

      mustChangePassword,

      nextAction: mustChangePassword
        ? "CHANGE_PASSWORD"
        : result.nextAction || null,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// EMAIL VERIFICATION OTP
// ==========================================

const verifyOtp = async (req, res, next) => {
  try {
    const result = await verifyOtpService(req.body?.email, req.body?.otp);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const resendOtp = async (req, res, next) => {
  try {
    const result = await resendOtpService(req.body?.email);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// ACCOUNT ACTIVATION - REQUEST OTP
// ==========================================

const requestActivationOtp = async (req, res, next) => {
  try {
    const result = await requestActivationOtpService(req.body?.email);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// ACCOUNT ACTIVATION - VERIFY OTP
// ==========================================

const verifyActivationOtp = async (req, res, next) => {
  try {
    const result = await verifyActivationOtpService(
      req.body?.email,
      req.body?.otp,
    );

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// ACCOUNT ACTIVATION - RESEND OTP
// ==========================================

const resendActivationOtp = async (req, res, next) => {
  try {
    const result = await resendActivationOtpService(req.body?.email);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// FORGOT PASSWORD
// ==========================================

const forgotPassword = async (req, res, next) => {
  try {
    const result = await forgotPasswordService(req.body?.email);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// VERIFY RESET OTP
// ==========================================

const verifyResetOtp = async (req, res, next) => {
  try {
    const result = await verifyResetOtpService(req.body?.email, req.body?.otp);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// RESEND RESET OTP
// ==========================================

const resendResetOtp = async (req, res, next) => {
  try {
    const result = await resendResetOtpService(req.body?.email);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// RESET PASSWORD
// ==========================================

const resetPassword = async (req, res, next) => {
  try {
    const result = await resetPasswordService(
      req.body?.email,
      req.body?.password,
    );

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// CHANGE PASSWORD
// ==========================================

const changePassword = async (req, res, next) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const result = await changePasswordService(
      req.auth.id,
      req.body?.oldPassword,
      req.body?.newPassword,
      req.auth.accountType,
    );

    clearRefreshCookie(res);

    return res.status(200).json({
      ...result,
      requireLogin: true,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// REFRESH TOKEN
// ==========================================

const refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Refresh token is required.",
      });
    }

    const result = await refreshTokenService(token);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// LOGOUT
// ==========================================

const logout = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;

    const result = token
      ? await logoutService(token)
      : {
          success: true,
          message: "Logged out successfully.",
        };

    clearRefreshCookie(res);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// GET PROFILE
// ==========================================

const getProfile = async (req, res, next) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const result = await getProfileService(
      req.auth.id,
      req.auth.accountType,
      req.auth.activeRole || req.auth.role,
    );

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// UPDATE PROFILE
// ==========================================

const updateProfile = async (req, res, next) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (req.auth.role === "SUPER_ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Super Admin has read-only access.",
      });
    }

    const result = await updateProfileService(
      req.auth.id,
      req.body,
      req.auth.accountType,
      req.auth.activeRole || req.auth.role,
    );

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// SWITCH FACULTY ROLE
// ==========================================

const switchRole = async (req, res, next) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const result = await switchRoleService(
      req.auth.id,
      req.body?.role,
      req.auth.accountType,
      req.cookies?.refreshToken,
    );

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  register,
  login,

  verifyOtp,
  resendOtp,

  requestActivationOtp,
  verifyActivationOtp,
  resendActivationOtp,

  forgotPassword,
  verifyResetOtp,
  resendResetOtp,
  resetPassword,

  changePassword,
  refreshToken,
  logout,

  getProfile,
  updateProfile,
  switchRole,
};
