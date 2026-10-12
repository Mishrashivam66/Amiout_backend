"use strict";

const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");

const { AUTH_CONSTANTS } = require("../constants");

// ==========================================
// SUPPORTED ACCOUNT TYPES
// ==========================================

const ACCOUNT_TYPES = Object.freeze({
  STUDENT: "STUDENT",
  FACULTY: "FACULTY",
  ADMIN: "ADMIN",
  SECURITY: "SECURITY",
});

// ==========================================
// SUPPORTED ROLES
// ==========================================

const SUPPORTED_ROLES = Object.freeze([
  "STUDENT",
  "MENTOR",
  "COORDINATOR",
  "HOD",
  "HOI",
  "ADMIN",
  "SECURITY",
  "SUPER_ADMIN",
]);

// ==========================================
// ROLE TO ACCOUNT TYPE
// ==========================================

const ROLE_ACCOUNT_TYPES = Object.freeze({
  STUDENT: ACCOUNT_TYPES.STUDENT,

  MENTOR: ACCOUNT_TYPES.FACULTY,
  COORDINATOR: ACCOUNT_TYPES.FACULTY,
  HOD: ACCOUNT_TYPES.FACULTY,
  HOI: ACCOUNT_TYPES.FACULTY,

  ADMIN: ACCOUNT_TYPES.ADMIN,
  SUPER_ADMIN: ACCOUNT_TYPES.ADMIN,

  SECURITY: ACCOUNT_TYPES.SECURITY,
});

// ==========================================
// NORMALIZE ROLE
// ==========================================

const normalizeRole = (role) => {
  return String(role || "")
    .trim()
    .toUpperCase();
};

// ==========================================
// RESOLVE ACCOUNT TYPE
// ==========================================

const resolveAccountType = (user) => {
  if (user.accountType) {
    const accountType = String(user.accountType).trim().toUpperCase();

    if (!Object.values(ACCOUNT_TYPES).includes(accountType)) {
      throw new Error("Invalid account type.");
    }

    return accountType;
  }

  // Backward compatibility for existing
  // Student, Mentor and Admin login services.

  const role = normalizeRole(user.role);
  const accountType = ROLE_ACCOUNT_TYPES[role];

  if (!accountType) {
    throw new Error("Unable to resolve account type.");
  }

  return accountType;
};

// ==========================================
// RESOLVE USER ID
// ==========================================

const resolveUserId = (user) => {
  const id = user._id || user.id;

  if (!id) {
    throw new Error("User ID is required.");
  }

  return String(id);
};

// ==========================================
// RESOLVE ASSIGNED ROLES
// ==========================================

const resolveRoles = (user) => {
  const roles = [...(Array.isArray(user.roles) ? user.roles : []), user.role]
    .filter(Boolean)
    .map(normalizeRole);

  const uniqueRoles = [...new Set(roles)];

  const invalidRoles = uniqueRoles.filter(
    (role) => !SUPPORTED_ROLES.includes(role),
  );

  if (invalidRoles.length > 0) {
    throw new Error("Invalid assigned role.");
  }

  return uniqueRoles;
};

// ==========================================
// GENERATE ACCESS TOKEN
// ==========================================

const generateAccessToken = (user) => {
  const id = resolveUserId(user);
  const accountType = resolveAccountType(user);
  const roles = resolveRoles(user);

  const activeRole = normalizeRole(user.activeRole || user.role || roles[0]);

  if (!activeRole || !roles.includes(activeRole)) {
    throw new Error("Unauthorized active role.");
  }

  // All roles must belong to the same account
  // type. Actual permissions must also be
  // verified against database assignments.

  for (const role of roles) {
    if (ROLE_ACCOUNT_TYPES[role] !== accountType) {
      throw new Error("Role does not match account type.");
    }
  }

  return jwt.sign(
    {
      id,
      email: user.email,
      accountType,
      role: activeRole,
      roles,
    },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRES,
    },
  );
};

// ==========================================
// GENERATE REFRESH TOKEN
// ==========================================

const generateRefreshToken = (user) => {
  const id = resolveUserId(user);
  const accountType = resolveAccountType(user);

  return jwt.sign(
    {
      id,
      accountType,
      sessionId: user.sessionId || randomUUID(),
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRES,
    },
  );
};

// ==========================================
// VERIFY ACCESS TOKEN
// ==========================================

const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
  });
};

// ==========================================
// VERIFY REFRESH TOKEN
// ==========================================

const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
    algorithms: ["HS256"],
  });
};

// ==========================================
// DECODE TOKEN
// ==========================================

// Decoding does not verify the signature.
// Never use this for authentication.

const decodeToken = (token) => {
  return jwt.decode(token);
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = Object.freeze({
  ACCOUNT_TYPES,
  SUPPORTED_ROLES,
  ROLE_ACCOUNT_TYPES,

  normalizeRole,
  resolveAccountType,
  resolveRoles,

  generateAccessToken,
  generateRefreshToken,

  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
});
