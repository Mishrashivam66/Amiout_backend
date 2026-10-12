"use strict";

const MentorMaster = require("../../academic/models/MentorMaster");

const {
  findAccountById,
  ACCOUNT_MODELS,
  normalizeAccountType,
  normalizeEmail,
  normalizeRole,
  getAuthorizedAccountRoles,
  isAccountAllowed,
} = require("../repositories/commonAuth.repository");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// EDITABLE PROFILE FIELDS
// ==========================================

const EDITABLE_FIELDS = Object.freeze({
  STUDENT: ["name", "mobileNumber", "gender", "dateOfBirth", "profilePhoto"],

  FACULTY: ["name", "phone", "profilePhoto"],

  ADMIN: ["name", "phone", "profilePhoto"],

  SECURITY: ["name", "phone", "profilePhoto"],
});

// ==========================================
// VERIFY ACTIVE MENTOR MAPPING
// ==========================================

const hasActiveMentorMapping = async (account) => {
  const mapping = await MentorMaster.exists({
    mentorEmail: normalizeEmail(account.email),
    isActive: true,
    isDeleted: false,
  });

  return Boolean(mapping);
};

// ==========================================
// RESOLVE AUTHORIZED ROLES
// ==========================================

const resolveAuthorizedRoles = async (account, accountType) => {
  let roles = getAuthorizedAccountRoles(account, accountType)
    .map(normalizeRole)
    .filter(Boolean);

  roles = [...new Set(roles)];

  if (accountType === "FACULTY" && roles.includes("MENTOR")) {
    const hasMapping = await hasActiveMentorMapping(account);

    if (!hasMapping) {
      roles = roles.filter((role) => role !== "MENTOR");
    }
  }

  return roles;
};

// ==========================================
// VALIDATE ACCOUNT
// ==========================================

const loadAuthorizedAccount = async (userId, accountType) => {
  const type = normalizeAccountType(accountType);

  if (!ACCOUNT_MODELS[type]) {
    throw new Error("Invalid account type.");
  }

  const account = await findAccountById(userId, type);

  if (!account) {
    throw new Error(AUTH_MESSAGES.USER_NOT_FOUND);
  }

  if (!account.isActive) {
    throw new Error(AUTH_MESSAGES.ACCOUNT_DISABLED);
  }

  if (!account.isVerified) {
    throw new Error(AUTH_MESSAGES.ACCOUNT_NOT_VERIFIED);
  }

  if (!isAccountAllowed(account)) {
    throw new Error("Account is not authorized.");
  }

  const roles = await resolveAuthorizedRoles(account, type);

  if (!roles.length) {
    throw new Error("No active authorized role assigned to this account.");
  }

  return {
    account,
    accountType: type,
    roles,
  };
};

// ==========================================
// BUILD SAFE PROFILE
// ==========================================

const buildSafeProfile = (account, accountType, roles, requestedRole) => {
  const preferredRole = normalizeRole(account.role);

  const tokenRole = normalizeRole(requestedRole);

  // Use JWT role when supplied and
  // currently authorized.
  //
  // Never accept an arbitrary role
  // supplied by the frontend.

  const activeRole =
    tokenRole && roles.includes(tokenRole)
      ? tokenRole
      : roles.includes(preferredRole)
        ? preferredRole
        : roles[0];

  const baseProfile = {
    id: account._id,

    name: account.name,
    email: account.email,

    accountType,
    role: activeRole,
    roles,

    profilePhoto: account.profilePhoto || null,

    isVerified: account.isVerified,
    isActive: account.isActive,

    mustChangePassword: account.mustChangePassword === true,

    lastLogin: account.lastLogin,
    createdAt: account.createdAt,
  };

  switch (accountType) {
    case "STUDENT":
      return {
        ...baseProfile,

        enrollmentNo: account.enrollmentNo,

        mobileNumber: account.mobileNumber,

        gender: account.gender,

        dateOfBirth: account.dateOfBirth,

        course: account.course,

        branch: account.branch,

        semester: account.semester,

        section: account.section,
      };

    case "FACULTY":
      return {
        ...baseProfile,

        employeeId: account.employeeId,

        phone: account.phone,

        department: account.department,
      };

    case "ADMIN":
      return {
        ...baseProfile,

        phone: account.phone,
      };

    case "SECURITY":
      return {
        ...baseProfile,

        employeeId: account.employeeId,

        phone: account.phone,

        assignedGate: account.assignedGate,
      };

    default:
      return baseProfile;
  }
};

// ==========================================
// GET MY PROFILE
// ==========================================

const getProfileService = async (
  userId,
  accountType = "STUDENT",
  activeRole = null,
) => {
  const {
    account,
    accountType: type,
    roles,
  } = await loadAuthorizedAccount(userId, accountType);

  return {
    success: true,

    user: buildSafeProfile(account, type, roles, activeRole),
  };
};

// ==========================================
// UPDATE MY PROFILE
// ==========================================

const updateProfileService = async (
  userId,
  payload = {},
  accountType = "STUDENT",
  activeRole = null,
) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid profile data.");
  }

  const {
    account,
    accountType: type,
    roles,
  } = await loadAuthorizedAccount(userId, accountType);

  // ========================================
  // MANDATORY PASSWORD CHANGE
  // ========================================

  if (account.mustChangePassword === true) {
    throw new Error(
      "You must change your temporary password before updating your profile.",
    );
  }

  // ========================================
  // SUPER ADMIN READ-ONLY
  // ========================================

  if (type === "ADMIN" && roles.includes("SUPER_ADMIN")) {
    throw new Error("Super Admin has read-only access.");
  }

  // ========================================
  // FILTER EDITABLE FIELDS
  // ========================================

  const editableFields = EDITABLE_FIELDS[type] || [];

  const updateData = {};

  for (const field of editableFields) {
    if (
      Object.prototype.hasOwnProperty.call(payload, field) &&
      payload[field] !== undefined
    ) {
      updateData[field] = payload[field];
    }
  }

  if (!Object.keys(updateData).length) {
    throw new Error("No editable profile fields provided.");
  }

  // ========================================
  // UPDATE ACCOUNT
  // ========================================

  for (const [field, value] of Object.entries(updateData)) {
    account.set(field, value);
  }

  await account.save();

  // ========================================
  // RESPONSE
  // ========================================

  return {
    success: true,

    message: "Profile updated successfully.",

    user: buildSafeProfile(account, type, roles, activeRole),
  };
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  getProfileService,
  updateProfileService,
};
