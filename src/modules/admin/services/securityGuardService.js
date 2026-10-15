
"use strict";

const mongoose = require("mongoose");

const Security = require("../../auth/models/SecurityTemp");

const {
  findAccountByEmail,
  normalizeEmail,
} = require("../../auth/repositories/commonAuth.repository");

const fail = (message) => ({
  success: false,
  message,
});

const clean = (value) =>
  typeof value === "string" ? value.trim() : "";

const createSecurityGuard = async (adminId, data = {}) => {
  if (!mongoose.isValidObjectId(adminId)) {
    return fail("Invalid Admin account.");
  }

  const name = clean(data.name);
  const email = normalizeEmail(data.email);
  const employeeId = clean(data.employeeId).toUpperCase();
  const assignedGate = clean(data.assignedGate);
  const phone = clean(data.phone);

  // Keep original password unchanged, including whitespace.
  const password = data.password;

  if (name.length < 3 || name.length > 100) {
    return fail("Guard name must contain 3 to 100 characters.");
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254
  ) {
    return fail("Enter a valid email address.");
  }

  if (!/^[A-Z0-9_-]{3,30}$/.test(employeeId)) {
    return fail(
      "Employee ID must be 3 to 30 characters using letters, numbers, underscore or hyphen."
    );
  }

  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return fail(
      "Temporary password must contain 12 to 128 characters, including uppercase, lowercase, number and symbol."
    );
  }

  if (!assignedGate || assignedGate.length > 100) {
    return fail("Enter a valid assigned gate.");
  }

  if (phone && !/^[6-9]\d{9}$/.test(phone)) {
    return fail("Enter a valid 10-digit phone number.");
  }

  // Email must be unique across the entire AMIOUT system,
  // not just the Security collection.
  const existingEmail = await findAccountByEmail(email);

  if (existingEmail) {
    return fail("This email address is already registered.");
  }

  const existingEmployee = await Security.findOne({
    employeeId,
  }).select("_id");

  if (existingEmployee) {
    return fail("This Security Employee ID already exists.");
  }

  try {
    // SecurityTemp model hashes password in its pre-save hook.
    const guard = await Security.create({
      name,
      email,
      employeeId,
      phone,
      assignedGate,
      password,

      role: "SECURITY",
      roles: ["SECURITY"],

      // Admin-controlled provisioning.
      // This is NOT public email OTP verification.
      isVerified: true,
      isActive: true,

      // Force password change on first login.
      mustChangePassword: true,

      createdBy: adminId,
    });

    return {
      success: true,
      message:
        "Security Guard account created successfully. Share the temporary credentials securely.",
      data: {
        id: guard._id,
        name: guard.name,
        email: guard.email,
        employeeId: guard.employeeId,
        phone: guard.phone,
        assignedGate: guard.assignedGate,
        role: guard.role,
        isActive: guard.isActive,
        mustChangePassword: guard.mustChangePassword,
      },
    };
  } catch (error) {
    if (error.code === 11000) {
      return fail(
        "Email or Employee ID already exists. Use unique details."
      );
    }

    throw error;
  }
};

module.exports = Object.freeze({
  createSecurityGuard,
});
