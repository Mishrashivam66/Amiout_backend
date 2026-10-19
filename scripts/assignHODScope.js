"use strict";

const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

const Mentor = require("../src/modules/auth/models/Mentor");
const Institute = require("../src/modules/academic/models/Institute");
const Program = require("../src/modules/academic/models/Program");

// ============================================================
// AMIOUT ENTERPRISE
// ONE-TIME HOD DEPARTMENT SCOPE ASSIGNMENT
//
// Usage:
// node scripts/assignHODScope.js \
//   --email=hod@gwa.amity.edu \
//   --institute=ASET \
//   --department=CSE
//
// Add --apply only after preview is correct.
//
// The script does NOT:
// - Create faculty accounts
// - Verify faculty accounts
// - Change passwords
// - Change Mentor/Coordinator assignments
// - Grant university-wide access
// ============================================================

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const normalizeScope = (value) => normalize(value).replace(/\s+/g, "");

function parseArguments(argv) {
  const result = {
    apply: false,
    email: "",
    institute: "",
    department: "",
  };

  for (const argument of argv) {
    if (argument === "--apply") {
      result.apply = true;
      continue;
    }

    const separator = argument.indexOf("=");

    if (!argument.startsWith("--") || separator < 3) {
      throw new Error(`Invalid argument: ${argument}`);
    }

    const key = argument.slice(2, separator).trim();

    const value = argument.slice(separator + 1).trim();

    if (!["email", "institute", "department"].includes(key)) {
      throw new Error(`Unsupported argument: ${key}`);
    }

    result[key] = value;
  }

  if (!result.email || !result.institute || !result.department) {
    throw new Error("Required: --email, --institute and --department");
  }

  return result;
}

async function resolveInstitute(code) {
  const institutes = await Institute.find({
    isActive: true,
    isDeleted: false,
  })
    .select("_id code name")
    .lean();

  const requested = normalizeScope(code);

  const institute = institutes.find(
    (item) =>
      normalizeScope(item.code) === requested || String(item._id) === code,
  );

  if (!institute) {
    console.log(
      "Available active institutes:",
      institutes.map((item) => item.code),
    );

    throw new Error(
      "Requested institute not found in active Institute master.",
    );
  }

  return institute;
}

async function resolveDepartment(institute, department) {
  const programs = await Program.find({
    institute: institute._id,
    isActive: true,
    isDeleted: false,
  })
    .select("_id code name department")
    .lean();

  const requested = normalizeScope(department);

  const matchingPrograms = programs.filter(
    (program) =>
      program.department && normalizeScope(program.department) === requested,
  );

  if (!matchingPrograms.length) {
    console.log(
      "\nExisting program departments:",
      programs.map((program) => ({
        programCode: program.code,
        department: program.department || "NOT SET",
      })),
    );

    throw new Error(
      "Department does not match an active Program.department. " +
        "Correct the official Program master before assigning HOD scope.",
    );
  }

  return matchingPrograms;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  const mongoUri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URL ||
    process.env.DB_URI;

  if (!mongoUri) {
    throw new Error("MongoDB connection URI not found in backend .env");
  }

  await mongoose.connect(mongoUri);

  try {
    // ========================================================
    // VERIFY EXISTING FACULTY
    // ========================================================

    const email = options.email.trim().toLowerCase();

    const faculty = await Mentor.findOne({
      email,
    });

    if (!faculty) {
      throw new Error(
        "Faculty account not found. Import or create the account through Admin first.",
      );
    }

    if (faculty.isActive !== true) {
      throw new Error("Faculty account is inactive.");
    }

    if (faculty.isVerified !== true) {
      throw new Error(
        "Faculty account is not verified. Complete account provisioning through Admin.",
      );
    }

    // ========================================================
    // VERIFY OFFICIAL INSTITUTE AND DEPARTMENT
    // ========================================================

    const institute = await resolveInstitute(options.institute);

    const matchingPrograms = await resolveDepartment(
      institute,
      options.department,
    );

    const departmentCode = normalizeScope(matchingPrograms[0].department);

    const instituteCode = normalizeScope(institute.code);

    const scopeId = `${instituteCode}/${departmentCode}`;

    // ========================================================
    // EXISTING HOD ASSIGNMENTS
    // ========================================================

    const previousHODAssignments = (faculty.roleAssignments || [])
      .filter((item) => normalize(item.role) === "HOD")
      .map((item) => ({
        scopeId: item.scopeId,
        isActive: item.isActive,
      }));

    // ========================================================
    // PREVIEW
    // ========================================================

    console.log("\n========================================");
    console.log("AMIOUT - HOD SCOPE ASSIGNMENT");
    console.log("========================================");

    console.log("Faculty:", faculty.name);
    console.log("Email:", faculty.email);
    console.log("Employee ID:", faculty.employeeId);
    console.log("Institute:", institute.code);
    console.log("Department:", departmentCode);
    console.log("New HOD scope:", scopeId);

    console.log(
      "Matching programs:",
      matchingPrograms.map((item) => item.code),
    );

    console.log("Existing HOD assignments:", previousHODAssignments);

    console.log("Other faculty role assignments will be preserved.");

    if (!options.apply) {
      console.log("\nPREVIEW ONLY.");
      console.log("No database changes have been made.");
      console.log("Run again with --apply after verifying the mapping.");
      return;
    }

    // ========================================================
    // UPDATE FACULTY ROLE
    // ========================================================

    const currentRoles = [
      ...new Set(
        [faculty.role, ...(faculty.roles || []), "HOD"]
          .map(normalize)
          .filter(Boolean),
      ),
    ];

    faculty.roles = currentRoles;

    // HOD should have only the newly selected active
    // department assignment after explicit --apply.
    // Other role types are not modified.
    const now = new Date();

    let matchedExisting = false;

    for (const assignment of faculty.roleAssignments) {
      if (normalize(assignment.role) !== "HOD") {
        continue;
      }

      if (normalizeScope(assignment.scopeId) === normalizeScope(scopeId)) {
        assignment.scopeId = scopeId;
        assignment.scopeType = "DEPARTMENT";
        assignment.isActive = true;
        assignment.startsAt = now;
        assignment.expiresAt = null;

        matchedExisting = true;
      } else {
        assignment.isActive = false;
      }
    }

    if (!matchedExisting) {
      faculty.roleAssignments.push({
        role: "HOD",
        scopeType: "DEPARTMENT",
        scopeId,
        isActive: true,
        startsAt: now,
        expiresAt: null,
      });
    }

    // Mongoose validates role and scope assignments.
    await faculty.save();

    console.log("\nHOD SCOPE ASSIGNED SUCCESSFULLY");
    console.log("Faculty:", faculty.email);
    console.log("Role: HOD");
    console.log("Scope Type: DEPARTMENT");
    console.log("Scope ID:", scopeId);
    console.log("Matching program count:", matchingPrograms.length);

    console.log("\nLog in again and test the HOD dashboard.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("\nHOD assignment failed:", error.message);

  process.exitCode = 1;
});
