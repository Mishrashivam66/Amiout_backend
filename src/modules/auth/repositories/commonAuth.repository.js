"use strict";

const mongoose = require("mongoose");

const User = require("../models/User");
const Mentor = require("../models/Mentor");
const Admin = require("../models/Admin");
const Security = require("../models/SecurityTemp");

// ==========================================
// ACCOUNT TYPES
// ==========================================

const ACCOUNT_MODELS = Object.freeze({
  STUDENT: User,
  FACULTY: Mentor,
  ADMIN: Admin,
  SECURITY: Security,
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
  STUDENT: "STUDENT",

  MENTOR: "FACULTY",
  COORDINATOR: "FACULTY",
  HOD: "FACULTY",
  HOI: "FACULTY",

  ADMIN: "ADMIN",
  SUPER_ADMIN: "ADMIN",

  SECURITY: "SECURITY",
});

// ==========================================
// NORMALIZATION
// ==========================================

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .toUpperCase();

const normalizeAccountType = (accountType) =>
  String(accountType || "")
    .trim()
    .toUpperCase();

// ==========================================
// ACTIVE FACULTY ASSIGNMENTS
// ==========================================

const FACULTY_SCOPE_TYPES = Object.freeze({
  MENTOR: "GROUP",
  COORDINATOR: "SECTION",
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
});

const getActiveFacultyAssignments = (account, now = new Date()) => {
  if (!account) {
    return [];
  }

  const assignments = Array.isArray(account.roleAssignments)
    ? account.roleAssignments
    : [];

  return assignments.filter((assignment) => {
    if (!assignment || assignment.isActive !== true) {
      return false;
    }

    const role = normalizeRole(assignment.role);

    const scopeType = String(assignment.scopeType || "")
      .trim()
      .toUpperCase();

    if (!FACULTY_SCOPE_TYPES[role] || FACULTY_SCOPE_TYPES[role] !== scopeType) {
      return false;
    }

    if (!assignment.scopeId) {
      return false;
    }

    const startsAt = assignment.startsAt ? new Date(assignment.startsAt) : null;

    const expiresAt = assignment.expiresAt
      ? new Date(assignment.expiresAt)
      : null;

    if (startsAt && (!Number.isFinite(startsAt.getTime()) || startsAt > now)) {
      return false;
    }

    if (
      expiresAt &&
      (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now)
    ) {
      return false;
    }

    return true;
  });
};

// ==========================================
// GET AUTHORIZED ACCOUNT ROLES
// ==========================================

const getAuthorizedAccountRoles = (account, accountType, now = new Date()) => {
  if (!account) {
    return [];
  }

  const type = normalizeAccountType(accountType);

  // STUDENT
  if (type === "STUDENT") {
    return normalizeRole(account.role) === "STUDENT" ? ["STUDENT"] : [];
  }

  // SECURITY
  if (type === "SECURITY") {
    return normalizeRole(account.role) === "SECURITY" ? ["SECURITY"] : [];
  }

  // ADMIN / SUPER_ADMIN
  // These are mutually exclusive roles.
  if (type === "ADMIN") {
    const role = normalizeRole(account.role);

    return ["ADMIN", "SUPER_ADMIN"].includes(role) ? [role] : [];
  }

  if (type !== "FACULTY") {
    return [];
  }

  // ======================================
  // ACTIVE FACULTY ROLES
  // ======================================

  const activeAssignments = getActiveFacultyAssignments(account, now);

  const roles = [
    ...new Set(
      activeAssignments.map((assignment) => normalizeRole(assignment.role)),
    ),
  ];

  // ======================================
  // LEGACY MENTOR COMPATIBILITY
  // ======================================

  const allAssignments = Array.isArray(account.roleAssignments)
    ? account.roleAssignments
    : [];

  // If a Mentor assignment has ever been
  // explicitly recorded, its active status
  // determines access. Do not bypass an
  // expired or revoked assignment through
  // legacy role fields.

  const hasExplicitMentorAssignment = allAssignments.some(
    (assignment) => normalizeRole(assignment?.role) === "MENTOR",
  );

  const hasLegacyMentorRole =
    normalizeRole(account.role) === "MENTOR" ||
    (Array.isArray(account.roles) &&
      account.roles.some((role) => normalizeRole(role) === "MENTOR"));

  if (
    !hasExplicitMentorAssignment &&
    hasLegacyMentorRole &&
    !roles.includes("MENTOR")
  ) {
    roles.push("MENTOR");
  }

  // MentorMaster verification is performed
  // by the authentication services.
  // Middleware must also verify it for
  // protected Mentor requests.

  return roles;
};

// ==========================================
// FIND ACCOUNT BY EMAIL
// ==========================================

const findAccountByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return null;
  }

  const results = await Promise.all(
    Object.entries(ACCOUNT_MODELS).map(async ([accountType, Model]) => {
      const account = await Model.findOne({
        email: normalizedEmail,
      }).select("+password");

      return account ? { accountType, account } : null;
    }),
  );

  const matches = results.filter(Boolean);

  if (matches.length > 1) {
    throw new Error("Account configuration conflict. Contact administrator.");
  }

  return matches[0] || null;
};

// ==========================================
// FIND ACCOUNT BY ID
// ==========================================

const findAccountById = async (id, accountType, includePassword = false) => {
  const type = normalizeAccountType(accountType);

  const Model = ACCOUNT_MODELS[type];

  if (!Model || !mongoose.isValidObjectId(id)) {
    return null;
  }

  let query = Model.findById(id);

  if (includePassword) {
    query = query.select("+password");
  }

  return query;
};

// ==========================================
// FIND ACCOUNT BY ROLE
// ==========================================

const findAccountByRole = async (id, role) => {
  const normalizedRole = normalizeRole(role);

  const accountType = ROLE_ACCOUNT_TYPES[normalizedRole];

  if (!accountType) {
    return null;
  }

  const account = await findAccountById(id, accountType);

  if (!account || !isAccountAllowed(account)) {
    return null;
  }

  const authorizedRoles = getAuthorizedAccountRoles(account, accountType);

  if (!authorizedRoles.includes(normalizedRole)) {
    return null;
  }

  return {
    accountType,
    account,
  };
};

// ==========================================
// UPDATE LAST LOGIN
// ==========================================

const updateAccountLastLogin = async (id, accountType) => {
  const type = normalizeAccountType(accountType);

  const Model = ACCOUNT_MODELS[type];

  if (!Model || !mongoose.isValidObjectId(id)) {
    return null;
  }

  return Model.findByIdAndUpdate(
    id,
    {
      $set: {
        lastLogin: new Date(),
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );
};

// ==========================================
// ACCOUNT STATUS
// ==========================================

const isAccountAllowed = (account) => {
  return Boolean(
    account && account.isActive === true && account.isVerified === true,
  );
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = Object.freeze({
  ACCOUNT_MODELS,
  SUPPORTED_ROLES,
  ROLE_ACCOUNT_TYPES,

  normalizeEmail,
  normalizeRole,
  normalizeAccountType,

  getActiveFacultyAssignments,
  getAuthorizedAccountRoles,

  findAccountByEmail,
  findAccountById,
  findAccountByRole,

  updateAccountLastLogin,
  isAccountAllowed,
});
