"use strict";

const Mentor = require("../../auth/models/Mentor");
const MentorMaster = require("../../academic/models/MentorMaster");
const StudentMaster = require("../../academic/models/StudentMaster");
const Group = require("../../academic/models/Group");
const Institute = require("../../academic/models/Institute");
const Program = require("../../academic/models/Program");

const ROLE_SCOPE_TYPES = Object.freeze({
  MENTOR: "GROUP",
  COORDINATOR: "SECTION",
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
});

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

const isAvailable = (faculty) =>
  Boolean(
    faculty &&
    faculty.isActive === true &&
    faculty.isVerified === true &&
    faculty.availabilityStatus === "AVAILABLE",
  );

const getActiveAssignments = (faculty, now) => {
  if (!faculty || !isAvailable(faculty)) {
    return [];
  }

  return faculty.getActiveRoleAssignments(now);
};

const hasExactScope = (faculty, role, expectedScope, now) => {
  if (!faculty || !faculty.hasRole(role) || !expectedScope) {
    return false;
  }

  return getActiveAssignments(faculty, now).some(
    (assignment) =>
      normalize(assignment.role) === role &&
      normalize(assignment.scopeType) === ROLE_SCOPE_TYPES[role] &&
      normalizeScope(assignment.scopeId) === normalizeScope(expectedScope),
  );
};

// ============================================================
// OFFICIAL ACADEMIC SCOPE FORMAT
//
// MENTOR:      ASET/B.TECH-CSE/7/C/C1
// COORDINATOR: ASET/B.TECH-CSE/7/C
// HOD:         ASET/DEPARTMENT_CODE
// HOI:         ASET
//
// Scope IDs in the database must use the same
// convention. Never authorize using partial matching.
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
    !departmentCode ||
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

    hod: `${instituteCode}/${departmentCode}`,

    hoi: instituteCode,
  };
};

// ============================================================
// VERIFY FACULTY MENTOR MASTER
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
  });

  if (!master || !master.mentorUser) {
    return null;
  }

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

  const faculty = await Mentor.findById(master.mentorUser);

  if (!faculty) {
    return null;
  }

  // Return mapping even when unavailable so callers
  // can distinguish mapped faculty from availability.
  const scope = [
    normalizeScope(master.institute),
    normalizeScope(master.program),
    String(Number(master.semester)),
    normalizeScope(master.section),
    normalizeScope(master.group),
  ].join("/");

  const available =
    master.availabilityStatus === "AVAILABLE" &&
    isAvailable(faculty) &&
    hasExactScope(faculty, "MENTOR", scope, now);

  return {
    faculty,
    master,
    available,
  };
};

// ============================================================
// FIND AUTHORIZED AVAILABLE SUPERIOR
// ============================================================

const findSuperior = async ({ role, scope, now }) => {
  if (!ROLE_SCOPE_TYPES[role] || !scope) {
    return {
      faculty: null,
      ambiguous: false,
    };
  }

  const candidates = await Mentor.find({
    roles: role,
    isActive: true,
    isVerified: true,
    availabilityStatus: "AVAILABLE",
  });

  const matches = candidates.filter((faculty) =>
    hasExactScope(faculty, role, scope, now),
  );

  // Multiple active authorities with the identical
  // scope need an explicit primary mapping.
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
// RESOLVE OFFICIAL STUDENT ACADEMIC RECORDS
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
    Institute.findById(studentMaster.institute),
    Program.findById(studentMaster.program),
    Group.findById(studentMaster.mentorGroup),
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

  if (
    !sameId(program.institute, institute._id) ||
    !sameId(group.institute, institute._id) ||
    !sameId(group.program, program._id) ||
    !sameId(group.primaryMentor, studentMaster.primaryMentor) ||
    Number(group.semester) !== Number(studentMaster.semester) ||
    normalize(group.section) !== normalize(studentMaster.section) ||
    normalize(group.groupName) !== normalize(studentMaster.group) ||
    normalize(group.batch) !== normalize(studentMaster.batch)
  ) {
    return null;
  }

  if (
    !group.backupMentor ||
    !studentMaster.backupMentor ||
    !sameId(group.backupMentor, studentMaster.backupMentor)
  ) {
    return null;
  }

  console.log("AMIOUT ACADEMIC MAPPING CHECK:", {
    instituteMatches:
      sameId(program.institute, institute._id) &&
      sameId(group.institute, institute._id),

    programMatches: sameId(group.program, program._id),

    primaryMentorMatches: sameId(
      group.primaryMentor,
      studentMaster.primaryMentor,
    ),

    backupMentorMatches: sameId(group.backupMentor, studentMaster.backupMentor),

    semesterMatches: Number(group.semester) === Number(studentMaster.semester),

    sectionMatches:
      normalize(group.section) === normalize(studentMaster.section),

    groupMatches: normalize(group.groupName) === normalize(studentMaster.group),

    batchMatches: normalize(group.batch) === normalize(studentMaster.batch),

    groupActive: group.isActive === true,
    groupNotDeleted: group.isDeleted !== true,

    scopeInputsPresent: Boolean(
      institute.code &&
      program.code &&
      program.department &&
      studentMaster.semester &&
      studentMaster.section &&
      studentMaster.group,
    ),
  });
  console.log("AMIOUT SCOPE FIELDS:", {
    hasInstituteCode: Boolean(institute?.code),
    hasProgramCode: Boolean(program?.code),
    hasDepartment: Boolean(program?.department),
    hasSemester: Boolean(studentMaster?.semester),
    hasSection: Boolean(studentMaster?.section),
    hasGroup: Boolean(studentMaster?.group),
  });

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

      mentor: `${instituteCode}/${programCode}/${semester}/${section}/${group}`,

      coordinator: `${instituteCode}/${programCode}/${semester}/${section}`,

      hod: departmentCode ? `${instituteCode}/${departmentCode}` : null,

      hoi: instituteCode,
    };
  };
  // Generate authorized academic scopes
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
// MAIN ESCALATION RESOLVER
// ============================================================

const resolveOutpassAuthority = async ({ studentMaster, now = new Date() }) => {
  const context = await getAcademicContext(studentMaster);

  if (!context) {
    return fail("Student academic mapping is missing or inconsistent.");
  }

  const { institute, program, scopes } = context;

  // ----------------------------------------------------------
  // 1. PRIMARY MENTOR
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
    return fail("Primary Mentor academic mapping is invalid.");
  }

  if (primary.available) {
    return success(primary.faculty, "MENTOR", "PRIMARY_MENTOR_AVAILABLE");
  }

  // ----------------------------------------------------------
  // 2. BACKUP MENTOR
  // ----------------------------------------------------------

  const backup = await getMappedMentor({
    mentorMasterId: studentMaster.backupMentor,
    institute,
    program,
    studentMaster,
    now,
    isBackup: true,
  });

  if (!backup) {
    return fail("Backup Mentor academic mapping is invalid.");
  }

  if (sameId(primary.faculty._id, backup.faculty._id)) {
    return fail(
      "Primary and Backup Mentor must be different faculty accounts.",
    );
  }

  if (backup.available) {
    return success(
      backup.faculty,
      "BACKUP_MENTOR",
      "PRIMARY_MENTOR_UNAVAILABLE",
    );
  }

  // ----------------------------------------------------------
  // 3. COORDINATOR
  // ----------------------------------------------------------

  const coordinator = await findSuperior({
    role: "COORDINATOR",
    scope: scopes.coordinator,
    now,
  });

  if (coordinator.ambiguous) {
    return fail(
      "Multiple available Coordinators match this section. Resolve the academic assignment.",
    );
  }

  if (coordinator.faculty) {
    return success(
      coordinator.faculty,
      "COORDINATOR",
      "BOTH_MENTORS_UNAVAILABLE",
    );
  }

  // ----------------------------------------------------------
  // 4. HOD
  // ----------------------------------------------------------

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
  // 5. HOI
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
    "No authorized authority is currently available. Request requires administrative attention.",
  );
};

// ============================================================
// RESOLVE BY STUDENT MASTER ID
// ============================================================

const resolveByStudentMasterId = async (studentMasterId) => {
  const studentMaster = await StudentMaster.findById(studentMasterId);

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

module.exports = Object.freeze({
  buildScopes,
  getAcademicContext,
  resolveOutpassAuthority,
  resolveByStudentMasterId,
});
