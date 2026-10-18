"use strict";

const Mentor = require("../modules/auth/models/Mentor");

// ============================================================
// FACULTY ROLES AND SCOPES
// ============================================================

const FACULTY_ROLES = new Set(["MENTOR", "COORDINATOR", "HOD", "HOI"]);

const ROLE_SCOPE_TYPES = Object.freeze({
  MENTOR: "GROUP",
  COORDINATOR: "SECTION",
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
});

// ============================================================
// HELPERS
// ============================================================

const normalizeRole = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const forbidden = (res, message, code) =>
  res.status(403).json({
    success: false,
    message,
    ...(code ? { code } : {}),
  });

// ============================================================
// VALIDATE ACTIVE FACULTY ASSIGNMENT
// ============================================================

const isActiveRoleAssignment = (assignment, role, now) => {
  if (!assignment || assignment.isActive !== true) {
    return false;
  }

  if (normalizeRole(assignment.role) !== role) {
    return false;
  }

  if (normalizeRole(assignment.scopeType) !== ROLE_SCOPE_TYPES[role]) {
    return false;
  }

  if (!String(assignment.scopeId || "").trim()) {
    return false;
  }

  if (assignment.startsAt) {
    const start = new Date(assignment.startsAt);

    if (!Number.isFinite(start.getTime()) || start > now) {
      return false;
    }
  }

  if (assignment.expiresAt) {
    const end = new Date(assignment.expiresAt);

    if (!Number.isFinite(end.getTime()) || end <= now) {
      return false;
    }
  }

  return true;
};

// ============================================================
// AUTHORIZE ROLES
// ============================================================

// Supports:
// authorize("MENTOR")
// authorize("MENTOR", "COORDINATOR")
// authorize(["MENTOR", "COORDINATOR"])

const authorize = (...roles) => {
  const allowedRoles = [
    ...new Set(roles.flat().map(normalizeRole).filter(Boolean)),
  ];

  return async (req, res, next) => {
    try {
      // ======================================================
      // AUTHENTICATION CHECK
      // ======================================================

      if (!req.user || !req.auth) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // ======================================================
      // MANDATORY FIRST-LOGIN PASSWORD CHANGE
      // ======================================================

      if (req.auth.mustChangePassword === true) {
        return forbidden(
          res,
          "You must change your temporary password before continuing.",
          "PASSWORD_CHANGE_REQUIRED",
        );
      }

      // ======================================================
      // ALLOWED ROLES CHECK
      // ======================================================

      if (allowedRoles.length === 0) {
        return forbidden(res, "No authorized roles configured.");
      }

      // ======================================================
      // TRUSTED USER ROLES
      // ======================================================

      const primaryRole = normalizeRole(req.user.role);

      const declaredRoles = [
        primaryRole,
        ...(Array.isArray(req.user.roles)
          ? req.user.roles.map(normalizeRole)
          : []),
      ].filter(Boolean);

      // ======================================================
      // NON-FACULTY AUTHORIZATION
      // ======================================================

      const matchesNonFacultyRole = allowedRoles.some(
        (role) => !FACULTY_ROLES.has(role) && declaredRoles.includes(role),
      );

      if (matchesNonFacultyRole) {
        return next();
      }

      // ======================================================
      // FACULTY ROLES
      // ======================================================

      const requestedFacultyRoles = allowedRoles.filter((role) =>
        FACULTY_ROLES.has(role),
      );

      if (requestedFacultyRoles.length === 0) {
        return forbidden(res, "Access denied.");
      }

      // ======================================================
      // ACCOUNT ID
      // ======================================================

      const facultyId = req.user._id || req.user.id;

      if (!facultyId) {
        return forbidden(res, "Faculty account not found.");
      }

      // ======================================================
      // REVALIDATE FACULTY FROM DATABASE
      // ======================================================

      const faculty = await Mentor.findById(facultyId)
        .select("role roles isActive isVerified roleAssignments")
        .lean();

      if (
        !faculty ||
        faculty.isActive !== true ||
        faculty.isVerified !== true
      ) {
        return forbidden(res, "Faculty account is not active or verified.");
      }

      // ======================================================
      // DECLARED FACULTY ROLES
      // ======================================================

      const facultyDeclaredRoles = new Set(
        [faculty.role, ...(faculty.roles || [])]
          .map(normalizeRole)
          .filter(Boolean),
      );

      // ======================================================
      // VERIFY ACTIVE ASSIGNMENTS
      // ======================================================

      const now = new Date();

      const isAuthorized = requestedFacultyRoles.some(
        (role) =>
          facultyDeclaredRoles.has(role) &&
          (faculty.roleAssignments || []).some((assignment) =>
            isActiveRoleAssignment(assignment, role, now),
          ),
      );

      if (!isAuthorized) {
        return forbidden(res, "No active authorized faculty role assignment.");
      }

      // ======================================================
      // AUTHORIZED
      // ======================================================

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

// ============================================================
// EXPORT
// ============================================================

module.exports = authorize;
