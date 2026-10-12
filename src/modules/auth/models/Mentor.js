"use strict";

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const { AUTH_CONSTANTS } = require("../constants");

// ==========================================
// FACULTY ROLES AND SCOPES
// ==========================================

const FACULTY_ROLE_SCOPES = Object.freeze({
  MENTOR: "GROUP",
  COORDINATOR: "SECTION",
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
});

const FACULTY_ROLES = Object.freeze(Object.keys(FACULTY_ROLE_SCOPES));

const FACULTY_SCOPES = Object.freeze(Object.values(FACULTY_ROLE_SCOPES));

const normalizeRole = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

// ==========================================
// FACULTY ROLE ASSIGNMENT SCHEMA
// ==========================================

const roleAssignmentSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: FACULTY_ROLES,
      required: true,
      uppercase: true,
      trim: true,
    },

    scopeType: {
      type: String,
      enum: FACULTY_SCOPES,
      required: true,
      uppercase: true,
      trim: true,
    },

    scopeId: {
      type: String,
      required: true,
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    startsAt: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    _id: true,
    timestamps: true,
  },
);

// ==========================================
// MENTOR / FACULTY SCHEMA
// ==========================================

const mentorSchema = new mongoose.Schema(
  {
    // ======================================
    // BASIC INFORMATION
    // ======================================

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 150,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    employeeId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    designation: {
      type: String,
      trim: true,
      maxlength: 150,
      default: "",
    },

    profilePhoto: {
      type: String,
      default: "",
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    department: {
      type: String,
      default: "",
      trim: true,
    },

    // ======================================
    // AUTHENTICATION
    // ======================================

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    // Backward compatibility
    role: {
      type: String,
      enum: FACULTY_ROLES,
      default: "MENTOR",
      uppercase: true,
    },

    // Multiple faculty roles
    roles: {
      type: [
        {
          type: String,
          enum: FACULTY_ROLES,
          uppercase: true,
        },
      ],
      default: ["MENTOR"],
    },

    // Academic access assignments
    roleAssignments: {
      type: [roleAssignmentSchema],
      default: [],
    },

    // ======================================
    // ACCOUNT STATUS
    // ======================================

    isVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Website-controlled availability
    availabilityStatus: {
      type: String,
      enum: ["AVAILABLE", "UNAVAILABLE"],
      default: "AVAILABLE",
    },

    availabilityUpdatedAt: {
      type: Date,
      default: Date.now,
    },

    // ======================================
    // FIRST LOGIN PASSWORD CHANGE
    // ======================================

    mustChangePassword: {
      type: Boolean,
      default: false,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    // ======================================
    // SECURITY
    // ======================================

    refreshToken: {
      type: String,
      default: null,
      select: false,
    },

    passwordChangedAt: {
      type: Date,
      default: null,
    },

    // ======================================
    // PASSWORD RESET
    // ======================================

    resetPasswordToken: {
      type: String,
      default: null,
      select: false,
    },

    resetPasswordExpires: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// ==========================================
// VALIDATE FACULTY ROLES AND ASSIGNMENTS
// ==========================================

mentorSchema.pre("validate", function () {
  const primaryRole = normalizeRole(this.role);

  if (!FACULTY_ROLES.includes(primaryRole)) {
    throw new Error("Invalid primary faculty role.");
  }

  this.role = primaryRole;

  const normalizedRoles = [
    ...new Set(
      (this.roles || [])
        .filter(Boolean)
        .map(normalizeRole)
        .filter((role) => FACULTY_ROLES.includes(role)),
    ),
  ];

  if (!normalizedRoles.includes(primaryRole)) {
    normalizedRoles.push(primaryRole);
  }

  this.roles = normalizedRoles;

  const assignmentKeys = new Set();

  for (const assignment of this.roleAssignments || []) {
    const role = normalizeRole(assignment.role);
    const scopeType = normalizeRole(assignment.scopeType);
    const scopeId = String(assignment.scopeId || "").trim();

    if (!FACULTY_ROLES.includes(role)) {
      throw new Error(`Invalid faculty role: ${role}`);
    }

    if (FACULTY_ROLE_SCOPES[role] !== scopeType) {
      throw new Error(`Invalid scope type for ${role}.`);
    }

    if (!this.roles.includes(role)) {
      throw new Error(`Role assignment ${role} is missing from faculty roles.`);
    }

    if (!scopeId) {
      throw new Error("Role assignment scope ID is required.");
    }

    const assignmentKey = `${role}:${scopeType}:${scopeId}`;

    if (assignmentKeys.has(assignmentKey)) {
      throw new Error(`Duplicate role assignment: ${assignmentKey}`);
    }

    assignmentKeys.add(assignmentKey);

    if (
      assignment.expiresAt &&
      assignment.startsAt &&
      new Date(assignment.expiresAt) <= new Date(assignment.startsAt)
    ) {
      throw new Error("Role assignment expiry must be after its start date.");
    }
  }
});

// ==========================================
// GET ACTIVE ROLE ASSIGNMENTS
// ==========================================

mentorSchema.methods.getActiveRoleAssignments = function (now = new Date()) {
  if (this.isActive !== true) {
    return [];
  }

  return (this.roleAssignments || []).filter((assignment) => {
    if (assignment.isActive !== true) {
      return false;
    }

    const role = normalizeRole(assignment.role);
    const scopeType = normalizeRole(assignment.scopeType);

    if (!this.roles.includes(role)) {
      return false;
    }

    if (FACULTY_ROLE_SCOPES[role] !== scopeType) {
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
// CHECK FACULTY ROLE
// ==========================================

mentorSchema.methods.hasRole = function (role) {
  return this.roles.includes(normalizeRole(role));
};

// ==========================================
// CHECK ACTIVE SCOPE ACCESS
// ==========================================

mentorSchema.methods.hasScopeAccess = function (role, scopeId) {
  const normalizedRole = normalizeRole(role);
  const normalizedScopeId = String(scopeId || "").trim();

  return this.getActiveRoleAssignments().some(
    (assignment) =>
      assignment.role === normalizedRole &&
      assignment.scopeId === normalizedScopeId,
  );
};

// ==========================================
// HASH PASSWORD
// ==========================================

mentorSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(10);

  this.password = await bcrypt.hash(this.password, salt);

  this.passwordChangedAt = new Date();
});

// ==========================================
// MATCH PASSWORD
// ==========================================

mentorSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password || typeof enteredPassword !== "string") {
    return false;
  }

  return bcrypt.compare(enteredPassword, this.password);
};

// ==========================================
// GENERATE PASSWORD RESET TOKEN
// ==========================================

mentorSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.resetPasswordExpires = new Date(
    Date.now() + AUTH_CONSTANTS.PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000,
  );

  return resetToken;
};

// ==========================================
// SECURE JSON TRANSFORM
// ==========================================

mentorSchema.set("toJSON", {
  transform(doc, ret) {
    delete ret.password;
    delete ret.refreshToken;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpires;
    return ret;
  },
});

// ==========================================
// INDEXES
// ==========================================

mentorSchema.index({
  "roleAssignments.role": 1,
  "roleAssignments.scopeId": 1,
});

mentorSchema.index({
  department: 1,
  isActive: 1,
});

mentorSchema.index({
  availabilityStatus: 1,
});

// ==========================================
// EXPORT MODEL
// ==========================================

module.exports =
  mongoose.models.Mentor || mongoose.model("Mentor", mentorSchema);
