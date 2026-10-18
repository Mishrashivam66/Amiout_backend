"use strict";

// ============================================================
// IMPORTS
// ============================================================

const { runAutomaticMapping } = require("./autoMapping.service");

const Mentor = require("../../auth/models/Mentor");

const MentorMaster = require("../models/MentorMaster");

const mentorRepository = require("../repositories/mentorMaster.repository");

// ============================================================
// ROLE CONFIGURATION
// ============================================================

const VALID_ROLES = new Set(["MENTOR", "COORDINATOR", "HOD", "HOI"]);

const ROLE_SCOPES = Object.freeze({
  MENTOR: "GROUP",
  COORDINATOR: "SECTION",
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
});

// ============================================================
// NORMALIZATION HELPERS
// ============================================================

const clean = (value) => String(value ?? "").trim();

const upper = (value) => clean(value).toUpperCase();

const lower = (value) => clean(value).toLowerCase();

const unique = (values) => [...new Set(values.filter(Boolean))];

const parseList = (value) => {
  const values = Array.isArray(value) ? value : clean(value).split(/[,;+]/);

  return unique(
    values.flatMap((item) => clean(item).split(/[,;+]/).map(upper)),
  );
};

const sameId = (a, b) => String(a ?? "") === String(b ?? "");

const hasRole = (roles, role) => roles.includes(role);

const hasGroupLevelRole = (roles) =>
  hasRole(roles, "MENTOR") || hasRole(roles, "COORDINATOR");

// ============================================================
// SEMESTER NORMALIZATION
// ============================================================

const normalizeSemester = (value) => {
  const raw = clean(value);

  if (!raw) {
    return null;
  }

  const semester = Number(raw);

  if (!Number.isInteger(semester) || semester < 1 || semester > 12) {
    return null;
  }

  return semester;
};

// ============================================================
// CREATE ROLE SCOPE ID
// ============================================================

const makeScopeId = (record, role) => {
  const institute = upper(record.institute);
  const department = upper(record.department);
  const program = upper(record.program);

  const semester = normalizeSemester(record.semester);

  const section = upper(record.section);
  const group = upper(record.group);

  // ==========================================================
  // MENTOR
  // ==========================================================

  if (role === "MENTOR") {
    if (!institute || !program || !semester || !section || !group) {
      return null;
    }

    return [institute, program, semester, section, group].join("/");
  }

  // ==========================================================
  // COORDINATOR
  // ==========================================================

  if (role === "COORDINATOR") {
    if (!institute || !program || !semester || !section) {
      return null;
    }

    return [institute, program, semester, section].join("/");
  }

  // ==========================================================
  // HOD
  // ==========================================================

  if (role === "HOD") {
    if (!institute || !department) {
      return null;
    }

    return `${institute}/${department}`;
  }

  // ==========================================================
  // HOI
  // ==========================================================

  if (role === "HOI") {
    return institute || null;
  }

  return null;
};

// ============================================================
// BUILD FACULTY ROLE ASSIGNMENTS
// ============================================================

const buildAssignments = (record) => {
  const roles = parseList(record.roles);

  const coordinatorGroups = parseList(record.coordinatorGroups);

  const assignments = [];
  const seen = new Set();

  for (const role of roles) {
    if (!VALID_ROLES.has(role)) {
      throw new Error(`Invalid faculty role: ${role}`);
    }

    if (role === "COORDINATOR" && coordinatorGroups.length === 0) {
      throw new Error("Coordinator Groups are required.");
    }

    const scopeId = makeScopeId(record, role);

    if (!scopeId) {
      throw new Error(`${role} academic scope is incomplete.`);
    }

    const scopeType = ROLE_SCOPES[role];

    const key = [role, scopeType, scopeId].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    assignments.push({
      role,
      scopeType,
      scopeId,
      isActive: true,
    });
  }

  return assignments;
};

// ============================================================
// MERGE EXISTING AND NEW ASSIGNMENTS
// ============================================================

// Preserve existing assignments and availability.
//
// Important:
// An existing inactive assignment must NOT
// silently become active during re-import.

const mergeAssignments = (existing = [], incoming = []) => {
  const result = Array.isArray(existing) ? [...existing] : [];

  const keys = new Set(
    result.map((item) =>
      [upper(item.role), upper(item.scopeType), upper(item.scopeId)].join("|"),
    ),
  );

  for (const assignment of incoming) {
    const key = [
      upper(assignment.role),
      upper(assignment.scopeType),
      upper(assignment.scopeId),
    ].join("|");

    if (keys.has(key)) {
      continue;
    }

    result.push(assignment);
    keys.add(key);
  }

  return result;
};

// ============================================================
// VALIDATE FACULTY RECORD
// ============================================================

const validateRecord = (record) => {
  const facultyId = upper(record.facultyId);

  const mentorName = clean(record.mentorName);

  const mentorEmail = lower(record.mentorEmail);

  const designation = clean(record.designation);

  const roles = parseList(record.roles);

  const institute = upper(record.institute);

  const department = upper(record.department);

  const program = upper(record.program);

  const course = upper(record.course);

  const semester = normalizeSemester(record.semester);

  const section = upper(record.section);

  const group = upper(record.group);

  const coordinatorGroups = parseList(record.coordinatorGroups);

  // ==========================================================
  // FACULTY IDENTITY VALIDATION
  // ==========================================================

  if (!facultyId || !mentorName || !mentorEmail) {
    throw new Error("Faculty ID, Faculty Name and Faculty Email are required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mentorEmail)) {
    throw new Error("Invalid Faculty Email.");
  }

  // ==========================================================
  // ROLE VALIDATION
  // ==========================================================

  if (!roles.length) {
    throw new Error("At least one faculty role is required.");
  }

  for (const role of roles) {
    if (!VALID_ROLES.has(role)) {
      throw new Error(`Invalid role: ${role}`);
    }
  }

  // ==========================================================
  // COMMON INSTITUTE VALIDATION
  // ==========================================================

  if (!institute) {
    throw new Error("Institute is required for every faculty.");
  }

  // ==========================================================
  // MENTOR / COORDINATOR VALIDATION
  // ==========================================================

  if (hasGroupLevelRole(roles)) {
    if (!program || !semester || !section) {
      throw new Error(
        "Mentor/Coordinator requires Program, Semester and Section.",
      );
    }
  }

  // ==========================================================
  // MENTOR VALIDATION
  // ==========================================================

  if (hasRole(roles, "MENTOR")) {
    if (!course || !group) {
      throw new Error("Mentor requires Course and Group.");
    }
  }

  // ==========================================================
  // COORDINATOR VALIDATION
  // ==========================================================

  if (hasRole(roles, "COORDINATOR")) {
    if (coordinatorGroups.length === 0) {
      throw new Error("Coordinator Groups are required for COORDINATOR.");
    }
  }

  // ==========================================================
  // HOD VALIDATION
  // ==========================================================

  if (hasRole(roles, "HOD")) {
    if (!department) {
      throw new Error("Department is required for HOD.");
    }
  }

  // ==========================================================
  // HOI VALIDATION
  // ==========================================================

  // HOI only requires Institute.
  // No Semester, Section or Group required.

  // ==========================================================
  // NORMALIZED RECORD
  // ==========================================================

  const normalized = {
    facultyId,
    mentorName,
    mentorEmail,
    designation,

    roles,

    institute,
    department,
    program,
    course,
    semester,
    section,
    group,

    coordinatorGroups,

    coordinator: clean(record.coordinator),

    totalStudents: Number.isFinite(Number(record.totalStudents))
      ? Math.max(0, Math.floor(Number(record.totalStudents)))
      : 0,
  };

  // Validate generated scopes.

  buildAssignments(normalized);

  return normalized;
};

// ============================================================
// IMPORT FACULTY EXCEL RECORDS
// ============================================================

const importMentors = async (records = []) => {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Mentor data is required.");
  }

  const importedMentors = [];
  const updatedMentors = [];
  const duplicateMentors = [];
  const failedMentors = [];

  const emailByFacultyId = new Map();
  const facultyIdByEmail = new Map();

  let needsAutomaticMapping = false;

  // ==========================================================
  // PROCESS EACH FACULTY RECORD
  // ==========================================================

  for (const record of records) {
    try {
      const data = validateRecord(record);

      const {
        facultyId,
        mentorName,
        mentorEmail,
        designation,
        roles,

        institute,
        department,
        program,
        course,
        semester,
        section,
        group,

        coordinatorGroups,
        coordinator,
        totalStudents,
      } = data;

      // ======================================================
      // CHECK CONFLICTS WITHIN EXCEL
      // ======================================================

      const knownEmail = emailByFacultyId.get(facultyId);

      const knownFacultyId = facultyIdByEmail.get(mentorEmail);

      if (
        (knownEmail && knownEmail !== mentorEmail) ||
        (knownFacultyId && knownFacultyId !== facultyId)
      ) {
        throw new Error("Conflicting Faculty ID and Email mapping in Excel.");
      }

      emailByFacultyId.set(facultyId, mentorEmail);

      facultyIdByEmail.set(mentorEmail, facultyId);

      // ======================================================
      // CHECK EXISTING MASTER IDENTITY
      // ======================================================

      const existingByFacultyId = await MentorMaster.findOne({
        facultyId,
        isDeleted: false,
        mentorEmail: {
          $ne: mentorEmail,
        },
      });

      if (existingByFacultyId) {
        throw new Error(
          "Faculty ID is already associated with a different email.",
        );
      }

      const existingByEmail = await MentorMaster.findOne({
        mentorEmail,
        isDeleted: false,
        facultyId: {
          $ne: facultyId,
        },
      });

      if (existingByEmail) {
        throw new Error(
          "Faculty Email is already associated with a different Faculty ID.",
        );
      }

      // ======================================================
      // CHECK EXISTING FACULTY LOGIN ACCOUNT
      // ======================================================

      const byEmployeeId = await Mentor.findOne({
        employeeId: facultyId,
      });

      const byEmail = await Mentor.findOne({
        email: mentorEmail,
      });

      if (byEmployeeId && byEmail && !sameId(byEmployeeId._id, byEmail._id)) {
        throw new Error(
          "Faculty ID and Email belong to different login accounts.",
        );
      }

      // ======================================================
      // VERIFY EXISTING FACULTY LOGIN IDENTITY
      // ======================================================

      const faculty = byEmployeeId || byEmail;

      if (faculty) {
        const existingEmployeeId = upper(faculty.employeeId);

        const existingEmail = lower(faculty.email);

        const employeeIdMatches = existingEmployeeId === facultyId;

        const emailMatches = existingEmail === mentorEmail;

        if (!employeeIdMatches || !emailMatches) {
          let mismatchReason = "";

          if (!employeeIdMatches && !emailMatches) {
            mismatchReason = "Both Employee ID and Email do not match.";
          } else if (!employeeIdMatches) {
            mismatchReason = existingEmployeeId
              ? "Employee ID does not match."
              : "Existing login account has no Employee ID.";
          } else {
            mismatchReason = "Faculty Email does not match.";
          }

          throw new Error(
            `Existing Faculty login identity does not match Excel. ${mismatchReason}`,
          );
        }
      }

      // ======================================================
      // CHECK EXACT ACADEMIC ASSIGNMENT
      // ======================================================

      const assignmentFilter = {
        facultyId,
        mentorEmail,

        institute,
        department,
        program,
        semester,
        section,
        group,

        isDeleted: false,
      };

      const existingMaster = await MentorMaster.findOne(assignmentFilter);

      const masterPayload = {
        facultyId,
        name: mentorName,
        mentorEmail,
        designation,
        roles,

        institute,
        department,
        program,
        course,
        semester,
        section,
        group,

        coordinatorGroups,
        coordinator,
        totalStudents,

        isActive: true,
        isDeleted: false,
      };

      // Validate the faculty account link
      // before updating academic records.

      if (
        existingMaster &&
        faculty &&
        existingMaster.mentorUser &&
        !sameId(existingMaster.mentorUser, faculty._id)
      ) {
        throw new Error(
          "Academic record linked to a different Faculty account.",
        );
      }

      // ======================================================
      // NEW OR EXISTING MASTER RECORD
      // ======================================================

      let mentorMasterId;
      let recordAction;

      if (existingMaster) {
        const previous = {
          name: existingMaster.name,
          designation: existingMaster.designation,

          roles: [...(existingMaster.roles || [])],

          course: existingMaster.course,

          coordinatorGroups: [...(existingMaster.coordinatorGroups || [])],

          coordinator: existingMaster.coordinator,

          totalStudents: existingMaster.totalStudents,
        };

        const next = {
          name: mentorName,
          designation,
          roles,
          course,
          coordinatorGroups,
          coordinator,
          totalStudents,
        };

        const hasChanges = JSON.stringify(previous) !== JSON.stringify(next);

        const needsAccountLink = faculty && !existingMaster.mentorUser;

        if (hasChanges || needsAccountLink) {
          Object.assign(existingMaster, masterPayload);

          if (faculty) {
            existingMaster.mentorUser = faculty._id;
          }

          await existingMaster.save();

          recordAction = "UPDATED";
        } else {
          recordAction = "DUPLICATE";
        }

        mentorMasterId = existingMaster._id;
      } else {
        const newMaster = await MentorMaster.create({
          ...masterPayload,

          mentorUser: faculty ? faculty._id : null,
        });

        mentorMasterId = newMaster._id;

        recordAction = "IMPORTED";
      }

      // ======================================================
      // SYNC EXISTING FACULTY LOGIN ROLES
      // ======================================================

      // Important:
      // Even an unchanged academic record may need
      // its missing login roles synchronized.

      if (faculty) {
        const assignments = buildAssignments(data);

        faculty.name = mentorName;

        faculty.designation = designation;

        if (department) {
          faculty.department = department;
        }

        faculty.roles = unique(
          [...(faculty.roles || []), faculty.role, ...roles].map(upper),
        );

        faculty.roleAssignments = mergeAssignments(
          faculty.roleAssignments || [],
          assignments,
        );

        await faculty.save();
      }

      // ======================================================
      // TRACK IMPORT RESULT
      // ======================================================

      const resultEntry = {
        rowNumber: record.rowNumber,
        facultyId,
        mentorMasterId,
      };

      if (recordAction === "IMPORTED") {
        importedMentors.push(resultEntry);
      } else if (recordAction === "UPDATED") {
        updatedMentors.push(resultEntry);
      } else {
        duplicateMentors.push(resultEntry);
      }

      // Only group/section academic changes
      // require automatic student-mentor mapping.

      if (recordAction !== "DUPLICATE" && hasGroupLevelRole(roles)) {
        needsAutomaticMapping = true;
      }
    } catch (error) {
      failedMentors.push({
        rowNumber: record.rowNumber,
        facultyId: record.facultyId,
        reason: error.message,
      });
    }
  }

  // ==========================================================
  // AUTOMATIC MAPPING
  // ==========================================================

  let mentorMapping = {
    triggered: false,
    success: null,
    mapped: 0,
    failed: 0,
    errors: [],
    message: "No new or updated group/section academic assignments.",
  };

  if (needsAutomaticMapping) {
    try {
      mentorMapping = await runAutomaticMapping("FACULTY_IMPORT");
    } catch (error) {
      mentorMapping = {
        triggered: true,
        success: false,
        mapped: 0,
        failed: 0,
        errors: [error.message],
        message:
          "Faculty records were processed, but automatic mapping failed.",
      };
    }
  }

  // ==========================================================
  // FINAL RESULT
  // ==========================================================

  const mappingSuccessful = mentorMapping.success !== false;

  return {
    success: failedMentors.length === 0 && mappingSuccessful,

    message:
      failedMentors.length === 0 && mappingSuccessful
        ? "Faculty import processing completed."
        : "Faculty import completed with errors.",

    summary: {
      totalRecords: records.length,

      importedRecords: importedMentors.length,

      updatedRecords: updatedMentors.length,

      duplicateRecords: duplicateMentors.length,

      failedRecords: failedMentors.length,
    },

    importedMentors,
    updatedMentors,
    duplicateMentors,
    failedMentors,

    mentorMapping,
  };
};

// ============================================================
// EXISTING CRUD FUNCTIONS
// ============================================================

const getAllMentors = async () => {
  return mentorRepository.getAllMentors();
};

const getMentorByEmployeeId = async (employeeId) => {
  const mentor = await mentorRepository.getMentorByEmployeeId(employeeId);

  if (!mentor) {
    throw new Error("Mentor not found.");
  }

  return mentor;
};

const updateMentor = async (id, payload) => {
  const mentor = await mentorRepository.getMentorById(id);

  if (!mentor) {
    throw new Error("Mentor not found.");
  }

  return mentorRepository.updateMentor(id, payload);
};

const deleteMentor = async (id) => {
  const mentor = await mentorRepository.getMentorById(id);

  if (!mentor) {
    throw new Error("Mentor not found.");
  }

  return mentorRepository.deleteMentor(id);
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  importMentors,
  getAllMentors,
  getMentorByEmployeeId,
  updateMentor,
  deleteMentor,
});
