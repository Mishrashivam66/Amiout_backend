"use strict";

const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

// ============================================================
// AMIOUT ENTERPRISE - SUPER ADMIN BOOTSTRAP
//
// Correct model: Admin
// Correct collection: admins
// Correct database: process.env.DB_NAME
//
// SAFETY:
// - No public registration
// - No OTP activation
// - No existing user promotion
// - No automatic deletion
// - Prevents duplicate account conflicts
// - Uses existing Admin password hashing hook
// ============================================================

const backendRoot = path.resolve(__dirname, "..");

const envPath = path.join(backendRoot, ".env");

const superAdminEnvPath = path.join(backendRoot, ".env.superadmin");

// ============================================================
// LOAD BACKEND ENVIRONMENT
// ============================================================

if (!fs.existsSync(envPath)) {
  throw new Error("backend/.env file not found.");
}

if (!fs.existsSync(superAdminEnvPath)) {
  throw new Error("backend/.env.superadmin file not found.");
}

dotenv.config({
  path: envPath,
  quiet: true,
});

// Load only provisioning fields.
// Do not override database configuration.
const provisioningValues = dotenv.parse(fs.readFileSync(superAdminEnvPath));

const allowedKeys = [
  "SUPER_ADMIN_NAME",
  "SUPER_ADMIN_EMAIL",
  "SUPER_ADMIN_PASSWORD",
  "SUPER_ADMIN_MOBILE",
];

for (const key of allowedKeys) {
  if (Object.prototype.hasOwnProperty.call(provisioningValues, key)) {
    process.env[key] = provisioningValues[key];
  }
}

// ============================================================
// IMPORT ACTUAL AUTHENTICATION MODELS
// ============================================================

const Admin = require("../src/modules/auth/models/Admin");

const User = require("../src/modules/auth/models/User");

const Mentor = require("../src/modules/auth/models/Mentor");

const Security = require("../src/modules/auth/models/SecurityTemp");

const ROLES = require("../src/modules/auth/constants/roles");

// ============================================================
// VALIDATION HELPERS
// ============================================================

const required = (key) => {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
};

const validatePassword = (password) => {
  const valid =
    password.length >= 14 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);

  if (!valid) {
    throw new Error(
      "Password must contain at least 14 characters, " +
        "an uppercase letter, a lowercase letter, " +
        "a number and a special character.",
    );
  }
};

// ============================================================
// MAIN FUNCTION
// ============================================================

const createSuperAdmin = async () => {
  try {
    console.log("\n==================================");
    console.log(" AMIOUT SUPER ADMIN PROVISIONING");
    console.log("==================================\n");

    // --------------------------------------------------------
    // DATABASE CONFIGURATION
    // --------------------------------------------------------

    const mongoUri = required("MONGODB_URI");
    const dbName = required("DB_NAME");

    if (dbName.toLowerCase() === "test") {
      throw new Error("Refusing to provision into the default test database.");
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(dbName)) {
      throw new Error("Invalid DB_NAME configuration.");
    }

    // --------------------------------------------------------
    // SUPER ADMIN DETAILS
    // --------------------------------------------------------

    const name = required("SUPER_ADMIN_NAME");

    const email = required("SUPER_ADMIN_EMAIL").toLowerCase();

    const password = required("SUPER_ADMIN_PASSWORD");

    const phone = required("SUPER_ADMIN_MOBILE");

    if (name.length < 3 || name.length > 100) {
      throw new Error("Name must contain 3 to 100 characters.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email address.");
    }

    if (!/^[0-9]{10}$/.test(phone)) {
      throw new Error("Mobile number must contain exactly 10 digits.");
    }

    validatePassword(password);

    if (ROLES.SUPER_ADMIN !== "SUPER_ADMIN") {
      throw new Error("SUPER_ADMIN role is missing.");
    }

    // --------------------------------------------------------
    // CONNECT TO ACTUAL AMIOUT DATABASE
    // --------------------------------------------------------

    console.log(`Target Database: ${dbName}`);

    await mongoose.connect(mongoUri, {
      dbName,
      serverSelectionTimeoutMS: 10000,
    });

    console.log(`Connected Database: ${mongoose.connection.name}`);

    if (mongoose.connection.name !== dbName) {
      throw new Error("Connected database does not match DB_NAME.");
    }

    console.log(`Admin Collection: ${Admin.collection.name}`);

    if (Admin.collection.name !== "admins") {
      throw new Error(
        "Admin model is not using the expected admins collection.",
      );
    }

    // --------------------------------------------------------
    // CHECK EXISTING SUPER ADMIN
    // --------------------------------------------------------

    const existingSuperAdmin = await Admin.findOne({
      role: ROLES.SUPER_ADMIN,
    }).select("_id email");

    if (existingSuperAdmin) {
      throw new Error(
        "A Super Admin already exists in the admins collection. " +
          "Bootstrap script will not create another one.",
      );
    }

    // --------------------------------------------------------
    // PREVENT ACCOUNT LOOKUP CONFLICTS
    //
    // Login currently checks multiple collections.
    // The same email must not exist in any other model.
    // --------------------------------------------------------

    const [
      existingAdminEmail,
      existingUser,
      existingFaculty,
      existingSecurity,
    ] = await Promise.all([
      Admin.exists({ email }),

      User.findOne({ email }).select("_id email role enrollmentNo"),

      Mentor.exists({ email }),

      Security.exists({ email }),
    ]);

    if (existingAdminEmail) {
      throw new Error("An Admin account already uses this email.");
    }

    if (existingUser) {
      const misplaced =
        existingUser.role === ROLES.SUPER_ADMIN &&
        existingUser.enrollmentNo === "SUPERADMIN001";

      if (misplaced) {
        throw new Error(
          "MISPLACED_SUPER_ADMIN: This email already has " +
            "the previously created SUPER_ADMIN account " +
            "in the users collection. " +
            "Verify and safely remove only that mistaken " +
            "record before running this script again.",
        );
      }

      throw new Error(
        "Email is already assigned to a Student/User account. " +
          "No existing account will be promoted or overwritten.",
      );
    }

    if (existingFaculty || existingSecurity) {
      throw new Error(
        "Email is already used by a Faculty or Security account.",
      );
    }

    // --------------------------------------------------------
    // CREATE INTO ADMINS COLLECTION
    //
    // IMPORTANT:
    // Admin.create() automatically invokes the bcrypt
    // hashing hook in Admin.js.
    //
    // Do not hash password manually.
    // --------------------------------------------------------

    const superAdmin = await Admin.create({
      name,
      email,
      phone,
      password,

      role: ROLES.SUPER_ADMIN,

      isVerified: true,
      isActive: true,

      mustChangePassword: true,

      profilePhoto: "",
      lastLogin: null,
    });

    // --------------------------------------------------------
    // VERIFY SAVED RECORD
    // --------------------------------------------------------

    const savedAccount = await Admin.findById(superAdmin._id).select(
      "name email phone role roles " + "isVerified isActive mustChangePassword",
    );

    if (!savedAccount) {
      throw new Error("Created Admin account could not be verified.");
    }

    if (
      savedAccount.role !== ROLES.SUPER_ADMIN ||
      !savedAccount.isActive ||
      !savedAccount.isVerified
    ) {
      throw new Error("Saved account verification failed.");
    }

    // --------------------------------------------------------
    // SUCCESS OUTPUT
    // --------------------------------------------------------

    console.log("\n==================================");
    console.log(" SUPER ADMIN CREATED SUCCESSFULLY");
    console.log("==================================");

    console.log(`Database: ${dbName}`);
    console.log(`Collection: ${Admin.collection.name}`);
    console.log(`Name: ${savedAccount.name}`);
    console.log(`Email: ${savedAccount.email}`);
    console.log(`Role: ${savedAccount.role}`);

    console.log(`Roles: ${savedAccount.roles?.join(", ")}`);

    console.log(`Verified: ${savedAccount.isVerified}`);

    console.log(`Active: ${savedAccount.isActive}`);

    console.log(`Must Change Password: ${savedAccount.mustChangePassword}`);

    console.log("Password: Hashed and not displayed");

    console.log("==================================");
    console.log("\nNext: Test email/password authentication.");
  } catch (error) {
    console.error("\nSuper Admin provisioning failed:", error.message);

    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
};

createSuperAdmin();
