"use strict";

const MentorMaster = require("../../academic/models/MentorMaster");

const {
  findAccountById,
  getAuthorizedAccountRoles,
  isAccountAllowed,
  normalizeRole,
  normalizeEmail,
} = require("../repositories/commonAuth.repository");

const {
  findRefreshToken,
  updateSessionActiveRole,
} = require("../repositories/auth.repository");

const { verifyRefreshToken, generateAccessToken } = require("../utils/jwt");

const FACULTY_ROLES = ["MENTOR", "COORDINATOR", "HOD", "HOI"];

const switchRoleService = async (
  userId,
  requestedRole,
  accountType,
  refreshToken,
) => {
  const role = normalizeRole(requestedRole);

  if (accountType !== "FACULTY") {
    throw new Error("Faculty account required.");
  }

  if (!FACULTY_ROLES.includes(role)) {
    throw new Error("Invalid faculty role.");
  }

  if (!refreshToken) {
    throw new Error("Active refresh session required.");
  }

  // Verify the signed refresh token.
  const decoded = verifyRefreshToken(refreshToken);

  if (
    String(decoded.id) !== String(userId) ||
    decoded.accountType !== "FACULTY" ||
    !decoded.sessionId
  ) {
    throw new Error("Invalid faculty session.");
  }

  // Verify the database session.
  const session = await findRefreshToken(refreshToken);

  if (
    !session ||
    String(session.user) !== String(userId) ||
    session.accountType !== "FACULTY" ||
    String(session.sessionId) !== String(decoded.sessionId)
  ) {
    throw new Error("Session expired or revoked.");
  }

  // Load current faculty account.
  const account = await findAccountById(userId, "FACULTY");

  if (!account || !isAccountAllowed(account)) {
    throw new Error("Faculty account is not active.");
  }

  if (account.mustChangePassword === true) {
    throw new Error("Complete password setup first.");
  }

  // Preserve password-change session invalidation.
  if (account.passwordChangedAt) {
    const changedAt = new Date(account.passwordChangedAt).getTime();

    if (
      !Number.isFinite(changedAt) ||
      typeof decoded.iat !== "number" ||
      decoded.iat * 1000 < Math.ceil(changedAt / 1000) * 1000
    ) {
      throw new Error("Please log in again.");
    }
  }

  let roles = getAuthorizedAccountRoles(account, "FACULTY");

  // Mentor role also requires MentorMaster mapping.
  if (roles.includes("MENTOR")) {
    const mapping = await MentorMaster.exists({
      mentorEmail: normalizeEmail(account.email),
      isActive: true,
      isDeleted: false,
    });

    if (!mapping) {
      roles = roles.filter((r) => r !== "MENTOR");
    }
  }

  if (!roles.includes(role)) {
    throw new Error("No active authorization for selected role.");
  }

  // Persist the selected role in this session.
  const updatedSession = await updateSessionActiveRole({
    token: refreshToken,
    userId,
    sessionId: decoded.sessionId,
    activeRole: role,
  });

  if (!updatedSession) {
    throw new Error("Unable to update faculty session.");
  }

  const accessToken = generateAccessToken({
    _id: account._id,
    email: account.email,
    accountType: "FACULTY",
    role,
    activeRole: role,
    roles,
  });

  return {
    success: true,
    message: "Faculty role switched successfully.",
    accessToken,
    user: {
      id: String(account._id),
      name: account.name,
      email: account.email,
      accountType: "FACULTY",
      role,
      roles,
      isActive: account.isActive,
      isVerified: account.isVerified,
      mustChangePassword: false,
      employeeId: account.employeeId,
    },
  };
};

module.exports = switchRoleService;
