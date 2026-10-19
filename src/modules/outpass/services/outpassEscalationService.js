"use strict";

const Mentor = require("../../auth/models/Mentor");
const MentorMaster = require("../../academic/models/MentorMaster");
const StudentMaster = require("../../academic/models/StudentMaster");

const Group = require("../../academic/models/Group");
const Institute = require("../../academic/models/Institute");
const Program = require("../../academic/models/Program");

// ============================================================
// CONFIGURATION
// ============================================================

const QUERY_TIMEOUT_MS = 10000;

const ROLE_SCOPE_TYPES = Object.freeze({
  MENTOR: "GROUP",
  COORDINATOR: "SECTION",
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
});

// ============================================================
// GENERAL HELPERS
// ============================================================

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const normalizeScope = (value) => normalize(value).replace(/\s+/g, "");

const getId = (value) => String(value?._id || value || "");

const sameId = (a, b) => Boolean(getId(a)) && getId(a) === getId(b);

const fail = (message) => ({
  success: false,
  message,
});

const success = (faculty, assignedRole, reason) => ({
  success: true,
  faculty,
  assignedRole,
  reason,
});

// ============================================================
// CHECK ACCOUNT AVAILABILITY
// Applies to ALL roles on that faculty account.
// ============================================================

const isAvailable = (faculty) =>
  Boolean(
    faculty &&
    faculty.isActive === true &&
    faculty.isVerified === true &&
    faculty.availabilityStatus === "AVAILABLE",
  );

// ============================================================
// ACTIVE FACULTY ROLE ASSIGNMENTS
// ============================================================

const getActiveAssignments = (faculty, now) => {
  if (!isAvailable(faculty)) {
    return [];
  }

  if (typeof faculty.getActiveRoleAssignments !== "function") {
    return [];
  }

  return faculty.getActiveRoleAssignments(now);
};

// ============================================================
// STRICT ROLE + SCOPE AUTHORIZATION
// ============================================================

const hasExactScope = (faculty, role, expectedScope, now = new Date()) => {
  const normalizedRole = normalize(role);

  if (
    !faculty ||
    !isAvailable(faculty) ||
    !ROLE_SCOPE_TYPES[normalizedRole] ||
    !expectedScope
  ) {
    return false;
  }

  if (
    typeof faculty.hasRole !== "function" ||
    !faculty.hasRole(normalizedRole)
  ) {
    return false;
  }

  const expected = normalizeScope(expectedScope);

  return getActiveAssignments(faculty, now).some((assignment) => {
    return (
      normalize(assignment.role) === normalizedRole &&
      normalize(assignment.scopeType) === ROLE_SCOPE_TYPES[normalizedRole] &&
      normalizeScope(assignment.scopeId) === expected
    );
  });
};

// ============================================================
// OFFICIAL ACADEMIC SCOPES
//
// MENTOR:      ASET/B.TECH-CSE/7/C/C1
// COORDINATOR: ASET/B.TECH-CSE/7/C
// HOD:         ASET/DEPARTMENT_CODE
// HOI:         ASET
// ============================================================

const buildScopes = ({ institute, program, studentMaster }) => {
  const instituteCode = normalizeScope(institute?.code);

  const programCode = normalizeScope(program?.code);

  const departmentCode = normalizeScope(program?.department);

  const semester = Number(studentMaster?.semester);

  const section = normalizeScope(studentMaster?.section);

  const group = normalizeScope(studentMaster?.group);

  if (
    !instituteCode ||
    !programCode ||
    !Number.isInteger(semester) ||
    semester <= 0 ||
    !section ||
    !group
  ) {
    return null;
  }

  return {
    instituteCode,
    programCode,
    departmentCode,
    semester,
    section,
    group,

    mentor:
      `${instituteCode}/${programCode}/` + `${semester}/${section}/${group}`,

    coordinator: `${instituteCode}/${programCode}/` + `${semester}/${section}`,

    // No HOD matching without official department
    hod: departmentCode ? `${instituteCode}/${departmentCode}` : null,

    hoi: instituteCode,
  };
};

// ============================================================
// VALIDATE OFFICIAL STUDENT ACADEMIC MAPPING
// ============================================================

const getAcademicContext = async (studentMaster) => {
  if (
    !studentMaster ||
    !studentMaster.institute ||
    !studentMaster.program ||
    !studentMaster.mentorGroup ||
    !studentMaster.primaryMentor
  ) {
    return null;
  }

  const [institute, program, group] = await Promise.all([
    Institute.findById(studentMaster.institute).maxTimeMS(QUERY_TIMEOUT_MS),

    Program.findById(studentMaster.program).maxTimeMS(QUERY_TIMEOUT_MS),

    Group.findById(studentMaster.mentorGroup).maxTimeMS(QUERY_TIMEOUT_MS),
  ]);

  if (
    !institute ||
    !program ||
    !group ||
    institute.isActive === false ||
    institute.isDeleted === true ||
    program.isActive === false ||
    program.isDeleted === true ||
    group.isActive !== true ||
    group.isDeleted === true
  ) {
    return null;
  }

  // ----------------------------------------------------------
  // VERIFY STUDENTMASTER AGAINST GROUP MASTER
  // ----------------------------------------------------------

  const mappingValid =
    sameId(program.institute, institute._id) &&
    sameId(group.institute, institute._id) &&
    sameId(group.program, program._id) &&
    sameId(group.primaryMentor, studentMaster.primaryMentor) &&
    ((!group.backupMentor && !studentMaster.backupMentor) ||
      (group.backupMentor &&
        studentMaster.backupMentor &&
        sameId(group.backupMentor, studentMaster.backupMentor))) &&
    Number(group.semester) === Number(studentMaster.semester) &&
    normalize(group.section) === normalize(studentMaster.section) &&
    normalize(group.groupName) === normalize(studentMaster.group) &&
    normalize(group.batch) === normalize(studentMaster.batch);

  if (!mappingValid) {
    console.warn("[AUTHORITY RESOLVER] Academic mapping mismatch.");

    return null;
  }

  // ----------------------------------------------------------
  // SINGLE CENTRALIZED SCOPE GENERATOR
  // ----------------------------------------------------------

  const scopes = buildScopes({
    institute,
    program,
    studentMaster,
  });

  if (!scopes) {
    return null;
  }

  return {
    institute,
    program,
    group,
    scopes,
  };
};

// ============================================================
// PRIMARY / BACKUP MENTOR LOOKUP
// ============================================================

const getMappedMentor = async ({
  mentorMasterId,
  institute,
  program,
  studentMaster,
  now,
  isBackup = false,
}) => {
  if (!mentorMasterId) {
    return null;
  }

  const master = await MentorMaster.findOne({
    _id: mentorMasterId,
    isActive: true,
    isDeleted: false,
    roles: "MENTOR",
  }).maxTimeMS(QUERY_TIMEOUT_MS);

  if (!master || !master.mentorUser) {
    return null;
  }

  // ----------------------------------------------------------
  // EXACT ACADEMIC MAPPING
  // ----------------------------------------------------------

  const sameAcademicDetails =
    normalizeScope(master.institute) === normalizeScope(institute.code) &&
    normalizeScope(master.program) === normalizeScope(program.code) &&
    Number(master.semester) === Number(studentMaster.semester) &&
    normalize(master.section) === normalize(studentMaster.section);

  if (!sameAcademicDetails) {
    return null;
  }

  const studentGroup = normalize(studentMaster.group);

  const mentorGroup = normalize(master.group);

  if (!isBackup && mentorGroup !== studentGroup) {
    return null;
  }

  if (isBackup && mentorGroup === studentGroup) {
    return null;
  }

  // ----------------------------------------------------------
  // LINKED FACULTY LOGIN ACCOUNT
  // ----------------------------------------------------------

  const faculty = await Mentor.findById(master.mentorUser).maxTimeMS(
    QUERY_TIMEOUT_MS,
  );

  if (!faculty) {
    return null;
  }

  // Account must correspond to official master email.
  // Do not link another faculty merely by ObjectId.

  const emailMatches =
    Boolean(master.mentorEmail) &&
    String(master.mentorEmail).trim().toLowerCase() ===
      String(faculty.email || "")
        .trim()
        .toLowerCase();

  if (!emailMatches) {
    return null;
  }

  // ----------------------------------------------------------
  // EXPECTED GROUP SCOPE
  // Backup uses its authorized mentor group.
  // ----------------------------------------------------------

  const expectedScope = [
    normalizeScope(master.institute),
    normalizeScope(master.program),
    String(Number(master.semester)),
    normalizeScope(master.section),
    normalizeScope(master.group),
  ].join("/");

  const available =
    master.availabilityStatus === "AVAILABLE" &&
    isAvailable(faculty) &&
    hasExactScope(faculty, "MENTOR", expectedScope, now);

  return {
    faculty,
    master,
    available,
  };
};

// ============================================================
// SUPERIOR AUTHORITY LOOKUP
//
// Only fetch faculty with active matching role assignment.
// Do not fetch entire faculty collection.
// ============================================================

const findSuperior = async ({ role, scope, now = new Date() }) => {
  const normalizedRole = normalize(role);
  const expectedScope = normalizeScope(scope);

  if (!ROLE_SCOPE_TYPES[normalizedRole] || !expectedScope) {
    return {
      faculty: null,
      ambiguous: false,
    };
  }

  // Scope IDs must use canonical format.
  // $elemMatch ensures role, scope and active flag
  // belong to the same assignment.

  const candidates = await Mentor.find({
    roles: normalizedRole,

    isActive: true,
    isVerified: true,
    availabilityStatus: "AVAILABLE",

    roleAssignments: {
      $elemMatch: {
        role: normalizedRole,
        scopeType: ROLE_SCOPE_TYPES[normalizedRole],
        scopeId: expectedScope,
        isActive: true,
      },
    },
  })
    .limit(20)
    .maxTimeMS(QUERY_TIMEOUT_MS);

  // Recheck startsAt / expiresAt and exact scope

  const matches = candidates.filter((faculty) =>
    hasExactScope(faculty, normalizedRole, expectedScope, now),
  );

  if (matches.length > 1) {
    return {
      faculty: null,
      ambiguous: true,
    };
  }

  return {
    faculty: matches[0] || null,
    ambiguous: false,
  };
};

// ============================================================
// MAIN APPROVAL AUTHORITY RESOLVER
//
// Strict precedence:
// PRIMARY -> BACKUP -> COORDINATOR -> HOD -> HOI
// ============================================================

const resolveOutpassAuthority = async ({ studentMaster, now = new Date() }) => {
  // ----------------------------------------------------------
  // 1. VERIFY ACADEMIC CONTEXT
  // ----------------------------------------------------------

  const context = await getAcademicContext(studentMaster);

  if (!context) {
    return fail("Student academic mapping is missing or inconsistent.");
  }

  const { institute, program, scopes } = context;

  // ----------------------------------------------------------
  // 2. PRIMARY MENTOR
  // ----------------------------------------------------------

  const primary = await getMappedMentor({
    mentorMasterId: studentMaster.primaryMentor,

    institute,
    program,
    studentMaster,
    now,
    isBackup: false,
  });

  if (!primary) {
    return fail(
      "Primary Mentor academic mapping or account linking is invalid.",
    );
  }

  if (primary.available) {
    return success(primary.faculty, "MENTOR", "PRIMARY_MENTOR_AVAILABLE");
  }

  // ----------------------------------------------------------
  // 3. BACKUP MENTOR
  // ----------------------------------------------------------

  // ============================================================
  // 3. OPTIONAL BACKUP MENTOR
  // ============================================================

  // Primary Mentor unavailable hai toh Backup Mentor check hoga.
  // Backup Mentor optional hai.
  // Backup assigned nahi hai toh Coordinator check hoga.

  if (studentMaster.backupMentor) {
    const backup = await getMappedMentor({
      mentorMasterId: studentMaster.backupMentor,
      institute,
      program,
      studentMaster,
      now,
      isBackup: true,
    });

    if (!backup) {
      return fail(
        "Backup Mentor academic mapping or account linking is invalid.",
      );
    }

    // Primary and Backup cannot be the same faculty
    if (sameId(primary.faculty._id, backup.faculty._id)) {
      return fail(
        "Primary and Backup Mentor cannot be the same faculty account.",
      );
    }

    // If Backup Mentor is available, assign the request
    if (backup.available) {
      return success(
        backup.faculty,
        "BACKUP_MENTOR",
        "PRIMARY_MENTOR_UNAVAILABLE",
      );
    }
  }

  // ============================================================
  // 4. COORDINATOR FALLBACK
  // ============================================================

  // Primary and authorized Backup Mentor are unavailable,
  // or no Backup Mentor is assigned.
  // Coordinator becomes the initial assigned authority.
  // Higher authorities can still approve directly by scope.

  const coordinator = await findSuperior({
    role: "COORDINATOR",
    scope: scopes.coordinator,
    now,
  });

  if (coordinator.ambiguous) {
    return fail("Multiple available Coordinators match this section.");
  }

  if (coordinator.faculty) {
    return success(
      coordinator.faculty,
      "COORDINATOR",
      "BOTH_MENTORS_UNAVAILABLE",
    );
  }

  // If Coordinator is not available,
  // continue to the existing HOD fallback below.

  // ----------------------------------------------------------
  // 5. HOD
  // ----------------------------------------------------------

  if (!scopes.hod) {
    return fail(
      "HOD escalation cannot proceed because the academic department is not configured.",
    );
  }

  const hod = await findSuperior({
    role: "HOD",
    scope: scopes.hod,
    now,
  });

  if (hod.ambiguous) {
    return fail("Multiple available HOD accounts match this department.");
  }

  if (hod.faculty) {
    return success(hod.faculty, "HOD", "COORDINATOR_UNAVAILABLE");
  }

  // ----------------------------------------------------------
  // 6. HOI
  // ----------------------------------------------------------

  const hoi = await findSuperior({
    role: "HOI",
    scope: scopes.hoi,
    now,
  });

  if (hoi.ambiguous) {
    return fail("Multiple available HOI accounts match this institute.");
  }

  if (hoi.faculty) {
    return success(hoi.faculty, "HOI", "HOD_UNAVAILABLE");
  }

  return fail(
    "No authorized faculty is currently available. Administrative review is required.",
  );
};

// ============================================================
// RESOLVE USING STUDENTMASTER ID
// ============================================================

const resolveByStudentMasterId = async (studentMasterId) => {
  const studentMaster =
    await StudentMaster.findById(studentMasterId).maxTimeMS(QUERY_TIMEOUT_MS);

  if (!studentMaster) {
    return fail("StudentMaster not found.");
  }

  if (studentMaster.isActive !== true || studentMaster.isDeleted === true) {
    return fail("StudentMaster is inactive.");
  }

  return resolveOutpassAuthority({
    studentMaster,
  });
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  buildScopes,
  getAcademicContext,
  resolveOutpassAuthority,
  resolveByStudentMasterId,
});
