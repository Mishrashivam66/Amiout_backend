"use strict";

const Mentor = require("../modules/auth/models/Mentor");

const FACULTY_ROLES = new Set(["MENTOR", "COORDINATOR", "HOD", "HOI"]);

const ROLE_SCOPE_TYPES = Object.freeze({
  MENTOR: "GROUP",
  COORDINATOR: "SECTION",
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
});

const normalizeRole = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

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
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      if (allowedRoles.length === 0) {
        return res.status(403).json({
          success: false,
          message: "No authorized roles configured.",
        });
      }

      // Read only trusted roles established by authentication
      // middleware, never roles supplied in request body/query.
      const primaryRole = normalizeRole(req.user.role);

      const declaredRoles = [
        primaryRole,
        ...(Array.isArray(req.user.roles)
          ? req.user.roles.map(normalizeRole)
          : []),
      ].filter(Boolean);

      // Non-faculty routes retain ordinary role checking.
      const matchesNonFacultyRole = allowedRoles.some(
        (role) => !FACULTY_ROLES.has(role) && declaredRoles.includes(role),
      );

      if (matchesNonFacultyRole) {
        return next();
      }

      const requestedFacultyRoles = allowedRoles.filter((role) =>
        FACULTY_ROLES.has(role),
      );

      if (requestedFacultyRoles.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Access denied.",
        });
      }

      const facultyId = req.user._id || req.user.id;

      if (!facultyId) {
        return res.status(403).json({
          success: false,
          message: "Faculty account not found.",
        });
      }

      // Faculty role authorization comes from the
      // actual database, not only the JWT's primary role.
      const faculty = await Mentor.findById(facultyId)
        .select("role roles isActive isVerified roleAssignments")
        .lean();

      if (
        !faculty ||
        faculty.isActive !== true ||
        faculty.isVerified !== true
      ) {
        return res.status(403).json({
          success: false,
          message: "Faculty account is not active or verified.",
        });
      }

      const facultyDeclaredRoles = new Set(
        [faculty.role, ...(faculty.roles || [])]
          .map(normalizeRole)
          .filter(Boolean),
      );

      const now = new Date();

      const isAuthorized = requestedFacultyRoles.some(
        (role) =>
          facultyDeclaredRoles.has(role) &&
          (faculty.roleAssignments || []).some((assignment) =>
            isActiveRoleAssignment(assignment, role, now),
          ),
      );

      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          message: "No active authorized faculty role assignment.",
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

module.exports = authorize;
