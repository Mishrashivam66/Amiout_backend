"use strict";
const mappingService = require("./mapping.service");
const Mentor = require("../../auth/models/Mentor");
const MentorMaster = require("../models/MentorMaster");

const mentorRepository = require("../repositories/mentorMaster.repository");

const VALID_ROLES = new Set(["MENTOR", "COORDINATOR", "HOD", "HOI"]);

const ROLE_SCOPES = {
  MENTOR: "GROUP",
  COORDINATOR: "SECTION",
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
};

const clean = (value) => String(value ?? "").trim();

const upper = (value) => clean(value).toUpperCase();

const lower = (value) => clean(value).toLowerCase();

const unique = (items) => [...new Set(items.filter(Boolean))];

const parseList = (value) => {
  const values = Array.isArray(value) ? value : clean(value).split(/[,;+]/);

  return unique(
    values.flatMap((item) => clean(item).split(/[,;+]/).map(upper)),
  );
};

const sameId = (a, b) => String(a ?? "") === String(b ?? "");

const makeScopeId = (record, role) => {
  const institute = upper(record.institute);
  const department = upper(record.department);
  const program = upper(record.program);
  const semester = Number(record.semester);
  const section = upper(record.section);
  const group = upper(record.group);

  if (role === "MENTOR") {
    if (!institute || !program || !semester || !section || !group) {
      return null;
    }

    return `${institute}/${program}/${semester}/${section}/${group}`;
  }

  if (role === "COORDINATOR") {
    if (!institute || !program || !semester || !section) {
      return null;
    }

    return `${institute}/${program}/${semester}/${section}`;
  }

  if (role === "HOD") {
    return institute && department ? `${institute}/${department}` : null;
  }

  if (role === "HOI") {
    return institute || null;
  }

  return null;
};

const buildAssignments = (record) => {
  const roles = parseList(record.roles);
  const assignments = [];

  for (const role of roles) {
    if (!VALID_ROLES.has(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    if (
      role === "COORDINATOR" &&
      parseList(record.coordinatorGroups).length === 0
    ) {
      throw new Error("Coordinator Groups are required.");
    }

    const scopeId = makeScopeId(record, role);

    if (!scopeId) {
      throw new Error(`${role} academic scope is incomplete.`);
    }

    assignments.push({
      role,
      scopeType: ROLE_SCOPES[role],
      scopeId,
      isActive: true,
    });
  }

  return assignments;
};

const mergeAssignments = (existing = [], incoming = []) => {
  const result = [...existing];

  for (const assignment of incoming) {
    const found = result.some(
      (item) =>
        item.role === assignment.role &&
        item.scopeType === assignment.scopeType &&
        item.scopeId === assignment.scopeId,
    );

    if (!found) {
      result.push(assignment);
    }
  }

  return result;
};

const validateRecord = (record) => {
  const facultyId = upper(record.facultyId);
  const mentorName = clean(record.mentorName);
  const mentorEmail = lower(record.mentorEmail);

  const roles = parseList(record.roles);

  const institute = upper(record.institute);
  const department = upper(record.department);
  const program = upper(record.program);
  const course = upper(record.course);
  const semester = Number(record.semester);
  const section = upper(record.section);
  const group = upper(record.group);

  const coordinatorGroups = parseList(record.coordinatorGroups);

  if (!facultyId || !mentorName || !mentorEmail) {
    throw new Error("Faculty ID, Faculty Name and Faculty Email are required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mentorEmail)) {
    throw new Error("Invalid Faculty Email.");
  }

  if (!roles.length) {
    throw new Error("At least one faculty role is required.");
  }

  for (const role of roles) {
    if (!VALID_ROLES.has(role)) {
      throw new Error(`Invalid role: ${role}`);
    }
  }

  // These fields are required by MentorMaster.js.
  if (
    !institute ||
    !department ||
    !program ||
    !course ||
    !section ||
    !group ||
    !Number.isInteger(semester) ||
    semester < 1 ||
    semester > 12
  ) {
    throw new Error(
      "Institute, Department, Program, Course, Semester, Section and Group are required.",
    );
  }

  if (roles.includes("COORDINATOR") && coordinatorGroups.length === 0) {
    throw new Error("Coordinator Groups are required for COORDINATOR.");
  }

  const normalized = {
    facultyId,
    mentorName,
    mentorEmail,
    designation: clean(record.designation),
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

  buildAssignments(normalized);

  return normalized;
};

// ==========================================
// IMPORT FACULTY EXCEL RECORDS
// ==========================================

const importMentors = async (records = []) => {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Mentor data is required.");
  }

  const importedMentors = [];
  const updatedMentors = [];
  const duplicateMentors = [];
  const failedMentors = [];

  // Protect against inconsistent Faculty ID/email
  // pairs inside the same uploaded file.
  const emailByFacultyId = new Map();
  const facultyIdByEmail = new Map();

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

      const knownEmail = emailByFacultyId.get(facultyId);

      const knownFacultyId = facultyIdByEmail.get(mentorEmail);

      if (
        (knownEmail && knownEmail !== mentorEmail) ||
        (knownFacultyId && knownFacultyId !== facultyId)
      ) {
        throw new Error("Conflicting Faculty ID and email mapping in Excel.");
      }

      emailByFacultyId.set(facultyId, mentorEmail);

      facultyIdByEmail.set(mentorEmail, facultyId);

      // ======================================
      // CHECK EXISTING MASTER IDENTITY
      // ======================================

      const existingByFacultyId = await MentorMaster.findOne({
        facultyId,
        isDeleted: false,
        mentorEmail: {
          $nin: [mentorEmail],
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
          $nin: [facultyId],
        },
      });

      if (existingByEmail) {
        throw new Error(
          "Faculty email is already associated with a different Faculty ID.",
        );
      }

      // ======================================
      // OPTIONAL EXISTING LOGIN LINK
      // ======================================

      const byEmployeeId = await Mentor.findOne({
        employeeId: facultyId,
      });

      const byEmail = await Mentor.findOne({
        email: mentorEmail,
      });

      if (byEmployeeId && byEmail && !sameId(byEmployeeId._id, byEmail._id)) {
        throw new Error(
          "Faculty ID and email belong to different login accounts.",
        );
      }

      const faculty = byEmployeeId || byEmail;

      if (faculty) {
        if (
          upper(faculty.employeeId) !== facultyId ||
          lower(faculty.email) !== mentorEmail
        ) {
          throw new Error(
            "Existing Faculty login identity does not match Excel.",
          );
        }
      }

      // ======================================
      // CHECK EXACT ACADEMIC ASSIGNMENT
      // ======================================

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

      // ======================================
      // EXISTING ASSIGNMENT
      // ======================================

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

        if (JSON.stringify(previous) === JSON.stringify(next)) {
          duplicateMentors.push({
            rowNumber: record.rowNumber,
            facultyId,
            mentorMasterId: existingMaster._id,
          });

          continue;
        }

        Object.assign(existingMaster, masterPayload);

        if (faculty) {
          if (
            existingMaster.mentorUser &&
            !sameId(existingMaster.mentorUser, faculty._id)
          ) {
            throw new Error(
              "Academic record linked to a different faculty account.",
            );
          }

          existingMaster.mentorUser = faculty._id;
        }

        await existingMaster.save();

        updatedMentors.push({
          rowNumber: record.rowNumber,
          facultyId,
          mentorMasterId: existingMaster._id,
        });
      } else {
        // ======================================
        // NEW ACADEMIC ASSIGNMENT
        // ======================================

        const newMaster = await MentorMaster.create({
          ...masterPayload,
          mentorUser: faculty ? faculty._id : null,
        });

        importedMentors.push({
          rowNumber: record.rowNumber,
          facultyId,
          mentorMasterId: newMaster._id,
        });
      }

      // ======================================
      // SYNC EXISTING FACULTY ROLES
      // ======================================

      // Newly imported faculty have no login yet.
      // OTP activation creates it later.
      //
      // Existing verified faculty retain their
      // login/password and gain new approved scopes.

      if (faculty) {
        const assignments = buildAssignments(data);

        faculty.name = mentorName;
        faculty.designation = designation;
        faculty.department = department;

        faculty.roles = unique([...(faculty.roles || []), ...roles]);

        faculty.roleAssignments = mergeAssignments(
          faculty.roleAssignments || [],
          assignments,
        );

        await faculty.save();
      }
    } catch (error) {
      failedMentors.push({
        rowNumber: record.rowNumber,
        facultyId: record.facultyId,
        reason: error.message,
      });
    }
  }

  // ============================================================
  // AUTOMATIC MAPPING AFTER FACULTY IMPORT / UPDATE
  // ============================================================

  let mentorMapping = {
    triggered: false,
    success: null,
    mapped: 0,
    failed: 0,
    errors: [],
  };

  if (importedMentors.length > 0 || updatedMentors.length > 0) {
    try {
      const result = await mappingService.generateMapping();

      mentorMapping = {
        triggered: true,
        success: result.success,
        mapped: result.mapped,
        failed: result.failed,
        errors: result.errors,
      };

      console.log(
        `Faculty import mapping: ${result.mapped} mapped, ${result.failed} failed.`,
      );
    } catch (error) {
      console.error("Automatic faculty mapping failed:", error);

      mentorMapping = {
        triggered: true,
        success: false,
        mapped: 0,
        failed: 0,
        errors: [
          {
            reason: error.message,
          },
        ],
      };
    }
  }

  return {
    success: failedMentors.length === 0,
    message: "Faculty import processing completed.",
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

// ==========================================
// EXISTING CRUD FUNCTIONS
// ==========================================

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

module.exports = Object.freeze({
  importMentors,
  getAllMentors,
  getMentorByEmployeeId,
  updateMentor,
  deleteMentor,
});
