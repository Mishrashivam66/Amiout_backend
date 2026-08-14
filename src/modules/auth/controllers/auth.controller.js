const {
  registerService,
  loginService,

  verifyOtpService,
  resendOtpService,

  forgotPasswordService,
  verifyResetOtpService,
  resendResetOtpService,
  resetPasswordService,

  changePasswordService,
  refreshTokenService,
  logoutService,
  getProfileService,
  updateProfileService,
} = require("../services");

// ==========================================
// REGISTER
// ==========================================

const register = async (req, res, next) => {
  try {
    const result = await registerService(req.body);

    return res.status(201).json(result);
  } catch (error) {
    console.error("REGISTER ERROR >>>", error);
    console.error(error.stack);

    next(error);
  }
};

// ==========================================
// LOGIN
// ==========================================

const login = async (req, res, next) => {
  try {
    const deviceInfo = {
      device: req.headers["user-agent"],
      browser: req.headers["sec-ch-ua"] || "",
      operatingSystem: req.headers["sec-ch-ua-platform"] || "",
      ipAddress: req.ip,
    };

    const result = await loginService(
      req.body.email,
      req.body.password,
      deviceInfo,
    );

    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: result.success,
      message: result.message,
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// VERIFY OTP
// ==========================================

const verifyOtp = async (req, res, next) => {
  try {
    const result = await verifyOtpService(req.body.email, req.body.otp);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// RESEND OTP
// ==========================================

const resendOtp = async (req, res, next) => {
  try {
    const result = await resendOtpService(req.body.email);

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
    const result = await forgotPasswordService(req.body.email);

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
    const result = await verifyResetOtpService(req.body.email, req.body.otp);

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
    const result = await resendResetOtpService(req.body.email);

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
      req.body.email,
      req.body.password,
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
    const result = await changePasswordService(
      req.user.id,
      req.body.oldPassword,
      req.body.newPassword,
    );

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// REFRESH TOKEN
// ==========================================

const refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;

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
    const token = req.cookies.refreshToken;

    const result = await logoutService(token);

    res.clearCookie("refreshToken");

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
    const result = await getProfileService(req.user.id);

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
    const result = await updateProfileService(req.user.id, req.body);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,

  verifyOtp,
  resendOtp,

  forgotPassword,
  verifyResetOtp,
  resendResetOtp,
  resetPassword,

  changePassword,
  refreshToken,
  logout,

  getProfile,
  updateProfile,
};
