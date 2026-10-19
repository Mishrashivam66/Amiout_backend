"use strict";

require("dotenv").config();

const mongoose = require("mongoose");

const Mentor = require("../src/modules/auth/models/Mentor");

const StudentMaster = require("../src/modules/academic/models/StudentMaster");

const Institute = require("../src/modules/academic/models/Institute");

const Program = require("../src/modules/academic/models/Program");

const {
  resolveOutpassAuthority,
} = require("../src/modules/outpass/services/outpassEscalationService");

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const enrollment = String(process.argv[2] || "")
  .trim()
  .toUpperCase();

async function main() {
  if (!enrollment) {
    throw new Error("Provide student enrollment number.");
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing.");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.DB_NAME || undefined,
  });

  console.log("\nCONNECTED DATABASE:");
  console.log(mongoose.connection.name);

  const student = await StudentMaster.findOne({
    enrollmentNumber: enrollment,
    isActive: true,
    isDeleted: false,
  });

  if (!student) {
    throw new Error("Active StudentMaster not found.");
  }

  const [institute, program] = await Promise.all([
    Institute.findById(student.institute),
    Program.findById(student.program),
  ]);

  if (!institute || !program) {
    throw new Error("Institute or Program not found.");
  }

  const expectedHOD = normalize(`${institute.code}/${program.department}`);

  const expectedHOI = normalize(institute.code);

  console.log("\nACADEMIC ROUTING SCOPE:");

  console.log({
    institute: institute.code,
    program: program.code,
    department: program.department,
    expectedHOD,
    expectedHOI,
  });

  const faculty = await Mentor.find({
    roles: { $in: ["HOD", "HOI"] },
  });

  console.log("\nTOTAL HOD / HOI ACCOUNTS:", faculty.length);

  const now = new Date();

  for (const person of faculty) {
    console.log("\n-----------------------------");
    console.log("FACULTY:", person.name);

    console.log({
      roles: person.roles,
      isActive: person.isActive,
      isVerified: person.isVerified,
      availabilityStatus: person.availabilityStatus,
    });

    for (const assignment of person.roleAssignments || []) {
      const role = String(assignment.role || "").toUpperCase();

      if (role !== "HOD" && role !== "HOI") {
        continue;
      }

      const expected = role === "HOD" ? expectedHOD : expectedHOI;

      const normalizedSaved = normalize(assignment.scopeId);

      const startsValid =
        !assignment.startsAt || new Date(assignment.startsAt) <= now;

      const expiresValid =
        !assignment.expiresAt || new Date(assignment.expiresAt) > now;

      const scopeMatches = normalizedSaved === expected;

      const accountAvailable =
        person.isActive === true &&
        person.isVerified === true &&
        person.availabilityStatus === "AVAILABLE";

      console.log({
        role,
        scopeType: assignment.scopeType,
        savedScope: assignment.scopeId,
        normalizedSaved,
        expected,
        scopeMatches,
        assignmentActive: assignment.isActive,
        startsValid,
        expiresValid,
        accountAvailable,
        eligible:
          accountAvailable &&
          assignment.isActive === true &&
          startsValid &&
          expiresValid &&
          scopeMatches,
      });
    }
  }

  console.log("\nACTUAL RESOLVER RESULT:");

  const result = await resolveOutpassAuthority({
    studentMaster: student,
    now: new Date(),
  });

  console.log({
    success: result.success,
    assignedRole: result.assignedRole,
    reason: result.reason,
    message: result.message,
    facultyName: result.faculty?.name || null,
  });
}

main()
  .catch((error) => {
    console.error("\nDIAGNOSTIC ERROR:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
