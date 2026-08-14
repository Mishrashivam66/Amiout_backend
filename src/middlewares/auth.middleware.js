const User = require("../modules/auth/models/User");
const Mentor = require("../modules/auth/models/Mentor");
const Admin = require("../modules/auth/models/Admin");

const { verifyAccessToken } = require("../modules/auth/utils/jwt");

// ==========================================
// AUTH MIDDLEWARE
// ==========================================
const logger = require("../utils/logger");
const protect = async (req, res, next) => {
  try {
    let token;

    // ==========================================
    // GET TOKEN
    // ==========================================

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // ==========================================
    // TOKEN REQUIRED
    // ==========================================

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token is required.",
      });
    }

    // ==========================================
    // VERIFY TOKEN
    // ==========================================

    const decoded = verifyAccessToken(token);

    let user = null;

    // ==========================================
    // FIND ACCOUNT BASED ON ROLE
    // ==========================================

    if (decoded.role === "MENTOR") {
      user = await Mentor.findById(decoded.id);
    } else if (decoded.role === "STUDENT") {
      user = await User.findById(decoded.id);
    } else if (decoded.role === "ADMIN") {
      user = await Admin.findById(decoded.id);
    } else if (decoded.role === "SUPER_ADMIN") {
      user = await Admin.findById(decoded.id);
    } else if (decoded.role === "SECURITY") {
      user = await User.findById(decoded.id);
    }

    // ==========================================
    // USER NOT FOUND
    // ==========================================

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid role or user not found.",
      });
    }

    // ==========================================
    // ACCOUNT ACTIVE CHECK
    // ==========================================

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive.",
      });
    }

    // ==========================================
    // ATTACH USER
    // ==========================================

    req.user = user;

    next();
  } catch (error) {
    logger.error("AUTH ERROR:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

module.exports = Object.freeze({
  protect,
});
