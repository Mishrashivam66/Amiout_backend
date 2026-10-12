"use strict";

const MentorMaster = require("../modules/academic/models/MentorMaster");

const {
  findAccountById,
  getAuthorizedAccountRoles,
  getActiveFacultyAssignments,
  isAccountAllowed,
  ROLE_ACCOUNT_TYPES,
  normalizeEmail,
} = require("../modules/auth/repositories/commonAuth.repository");

const {
  verifyAccessToken,
  normalizeRole,
} = require("../modules/auth/utils/jwt");

const logger = require("../utils/logger");

// ==========================================
// ERROR RESPONSE
// ==========================================

const authError = (res, status, message, code) => {
  return res.status(status).json({
    success: false,
    message,
    ...(code ? { code } : {}),
  });
};

// ==========================================
// VERIFY ACTIVE MENTOR MAPPING
// ==========================================

const hasActiveMentorMapping = async (user) => {
  const mapping = await MentorMaster.exists({
    mentorEmail: normalizeEmail(user.email),
    isActive: true,
    isDeleted: false,
  });

  return Boolean(mapping);
};

// ==========================================
// CHECK PASSWORD CHANGE TIMESTAMP
// ==========================================

const wasTokenIssuedBeforePasswordChange = (decoded, user) => {
  if (!user.passwordChangedAt) {
    return false;
  }

  const changedAtMs = new Date(user.passwordChangedAt).getTime();

  if (!Number.isFinite(changedAtMs)) {
    return true;
  }

  if (typeof decoded.iat !== "number" || !Number.isFinite(decoded.iat)) {
    return true;
  }

  // JWT iat has second-level precision.
  // Tokens issued in the same second as
  // the password change are rejected too.

  const tokenIssuedAtMs = decoded.iat * 1000;

  return tokenIssuedAtMs < changedAtMs;
};

// ==========================================
// PROTECT MIDDLEWARE
// ==========================================

const protect = async (req, res, next) => {
  try {
    // ======================================
    // GET BEARER TOKEN
    // ======================================

    const authorization = req.headers.authorization || "";

    const [scheme, token, extra] = authorization.trim().split(/\s+/);

    if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
      return authError(res, 401, "Access token is required.");
    }

    // ======================================
    // VERIFY ACCESS TOKEN
    // ======================================

    const decoded = verifyAccessToken(token);

    if (!decoded || !decoded.id || !decoded.role) {
      return authError(res, 401, "Invalid access token.");
    }

    const activeRole = normalizeRole(decoded.role);

    const accountType = String(
      decoded.accountType || ROLE_ACCOUNT_TYPES[activeRole] || "",
    )
      .trim()
      .toUpperCase();

    if (
      !ROLE_ACCOUNT_TYPES[activeRole] ||
      ROLE_ACCOUNT_TYPES[activeRole] !== accountType
    ) {
      return authError(res, 401, "Invalid account type or role.");
    }

    // ======================================
    // FIND ACCOUNT
    // ======================================

    const user = await findAccountById(decoded.id, accountType);

    if (!user) {
      return authError(res, 401, "Account not found.");
    }

    // ======================================
    // VERIFY ACCOUNT STATUS
    // ======================================

    if (!user.isActive) {
      return authError(res, 403, "Your account has been deactivated.");
    }

    if (!user.isVerified) {
      return authError(res, 403, "Please verify your account first.");
    }

    if (!isAccountAllowed(user)) {
      return authError(res, 403, "Account is not authorized.");
    }

    // ======================================
    // INVALIDATE OLD ACCESS TOKENS
    // ======================================

    if (wasTokenIssuedBeforePasswordChange(decoded, user)) {
      return authError(
        res,
        401,
        "Password changed. Please log in again.",
        "SESSION_EXPIRED",
      );
    }

    // ======================================
    // RESOLVE AUTHORIZED ROLES
    // ======================================

    const authorizedRoles = [
      ...new Set(
        getAuthorizedAccountRoles(user, accountType)
          .map(normalizeRole)
          .filter(Boolean),
      ),
    ];

    if (!authorizedRoles.includes(activeRole)) {
      return authError(res, 403, "Role is not assigned or has expired.");
    }

    // ======================================
    // VERIFY MENTOR MAPPING
    // ======================================

    if (accountType === "FACULTY" && activeRole === "MENTOR") {
      const hasMapping = await hasActiveMentorMapping(user);

      if (!hasMapping) {
        return authError(res, 403, "Active mentor mapping not found.");
      }
    }

    // ======================================
    // ACTIVE FACULTY ASSIGNMENTS
    // ======================================

    let activeAssignments = [];

    if (accountType === "FACULTY") {
      activeAssignments = getActiveFacultyAssignments(user);
    }

    // ======================================
    // ATTACH AUTH CONTEXT
    // ======================================

    req.user = user;

    req.auth = {
      id: String(user._id),

      accountType,

      role: activeRole,
      activeRole,

      roles: authorizedRoles,

      activeAssignments,

      mustChangePassword: user.mustChangePassword === true,
    };

    // ======================================
    // FIRST LOGIN PASSWORD RESTRICTION
    // ======================================

    // protect must allow /auth/me,
    // /auth/change-password and /auth/logout.
    //
    // Other protected routes must also
    // enforce password setup completion.

    return next();
  } catch (error) {
    logger.error("AUTH ERROR:", error.message);

    return authError(res, 401, "Invalid or expired token.");
  }
};

// ==========================================
// REQUIRE PASSWORD SETUP COMPLETE
// ==========================================

const requirePasswordSetupComplete = (req, res, next) => {
  if (!req.auth) {
    return authError(res, 401, "Authentication required.");
  }

  if (req.auth.mustChangePassword) {
    return authError(
      res,
      403,
      "You must change your temporary password before continuing.",
      "PASSWORD_CHANGE_REQUIRED",
    );
  }

  return next();
};

// ==========================================
// REQUIRE ROLES
// ==========================================

const requireRoles = (...allowedRoles) => {
  const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

  return (req, res, next) => {
    if (!req.auth) {
      return authError(res, 401, "Authentication required.");
    }

    if (req.auth.mustChangePassword) {
      return authError(
        res,
        403,
        "You must change your temporary password before continuing.",
        "PASSWORD_CHANGE_REQUIRED",
      );
    }

    const activeRole = normalizeRole(req.auth.role);

    if (!normalizedAllowedRoles.includes(activeRole)) {
      return authError(res, 403, "You do not have permission.");
    }

    return next();
  };
};

// ==========================================
// REQUIRE FACULTY SCOPE
// ==========================================

const requireFacultyScope = (requiredScopeType) => {
  const normalizedScopeType = String(requiredScopeType || "")
    .trim()
    .toUpperCase();

  const ROLE_SCOPES = Object.freeze({
    MENTOR: "GROUP",
    COORDINATOR: "SECTION",
    HOD: "DEPARTMENT",
    HOI: "INSTITUTE",
  });

  return (req, res, next) => {
    if (!req.auth) {
      return authError(res, 401, "Authentication required.");
    }

    if (req.auth.mustChangePassword) {
      return authError(
        res,
        403,
        "You must change your temporary password before continuing.",
        "PASSWORD_CHANGE_REQUIRED",
      );
    }

    if (req.auth.accountType !== "FACULTY") {
      return authError(res, 403, "Faculty access required.");
    }

    const activeRole = normalizeRole(req.auth.role);

    if (
      !ROLE_SCOPES[activeRole] ||
      ROLE_SCOPES[activeRole] !== normalizedScopeType
    ) {
      return authError(res, 403, "Invalid faculty scope.");
    }

    const assignments = req.auth.activeAssignments || [];

    const matchingAssignments = assignments.filter(
      (assignment) =>
        normalizeRole(assignment.role) === activeRole &&
        String(assignment.scopeType).trim().toUpperCase() ===
          normalizedScopeType,
    );

    if (!matchingAssignments.length) {
      return authError(res, 403, "No active faculty scope assigned.");
    }

    req.auth.scopes = matchingAssignments.map((assignment) => ({
      scopeType: assignment.scopeType,

      scopeId: assignment.scopeId,
    }));

    return next();
  };
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = Object.freeze({
  protect,
  requireRoles,
  requireFacultyScope,
  requirePasswordSetupComplete,
});
