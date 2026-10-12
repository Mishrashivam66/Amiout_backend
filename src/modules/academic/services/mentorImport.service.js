"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");

const Mentor = require("../../auth/models/Mentor"); // Adjust actual path
const MentorMaster = require("../models/MentorMaster");
const StudentMaster = require("../models/StudentMaster"); // Adjust path

const mentorRepository = require("../repositories/mentorMaster.repository");

const VALID_ROLES = new Set(["MENTOR", "COORDINATOR", "HOD", "HOI"]);

const ROLE_SCOPES = {
  MENTOR: "GROUP",
  COORDINATOR: "SECTION",
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
};

const upper = (v) =>
  String(v ?? "")
    .trim()
    .toUpperCase();
const lower = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase();
const clean = (v) => String(v ?? "").trim();

const unique = (items) => [...new Set(items.filter(Boolean))];

const parseList = (value) => {
  if (Array.isArray(value)) {
    return unique(value.map(upper));
  }

  return unique(clean(value).split(/[,;]+/).map(upper));
};

const makeScopeId = ({
  role,
  institute,
  department,
  program,
  semester,
  section,
  group,
}) => {
  const i = upper(institute);
  const d = upper(department);
  const p = upper(program);
  const s = Number(semester);
  const sec = upper(section);
  const g = upper(group);

  if (role === "MENTOR") {
    if (!i || !p || !s || !sec || !g) return null;
    return `${i}/${p}/${s}/${sec}/${g}`;
  }

  if (role === "COORDINATOR") {
    if (!i || !p || !s || !sec) return null;
    return `${i}/${p}/${s}/${sec}`;
  }

  if (role === "HOD") {
    if (!i || !d) return null;
    return `${i}/${d}`;
  }

  if (role === "HOI") {
    return i || null;
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

    if (role === "MENTOR") {
      const scopeId = makeScopeId({
        ...record,
        role,
        group: record.group,
      });

      if (!scopeId) {
        throw new Error("Mentor academic scope is incomplete.");
      }

      assignments.push({
        role,
        scopeType: ROLE_SCOPES[role],
        scopeId,
      });
    }

    if (role === "COORDINATOR") {
      const groups = parseList(record.coordinatorGroups);

      if (groups.length === 0) {
        throw new Error("Coordinator Groups are required.");
      }

      // SECTION scope covers the entire section.
      // Restricting to selected groups requires GROUP-level
      // coordinator assignments or a separate mapping model.
      const scopeId = makeScopeId({ ...record, role });

      if (!scopeId) {
        throw new Error("Coordinator academic scope is incomplete.");
      }

      assignments.push({
        role,
        scopeType: ROLE_SCOPES[role],
        scopeId,
      });
    }

    if (role === "HOD" || role === "HOI") {
      const scopeId = makeScopeId({ ...record, role });

      if (!scopeId) {
        throw new Error(`${role} scope is incomplete.`);
      }

      assignments.push({
        role,
        scopeType: ROLE_SCOPES[role],
        scopeId,
      });
    }
  }

  return assignments;
};

const mergeAssignments = (existing = [], incoming = []) => {
  const result = [...existing];

  for (const assignment of incoming) {
    const exists = result.some(
      (item) =>
        item.role === assignment.role &&
        item.scopeType === assignment.scopeType &&
        item.scopeId === assignment.scopeId,
    );

    if (!exists) {
      result.push(assignment);
    }
  }

  return result;
};

// ==========================================
// IMPORT FACULTY / MENTOR RECORDS
// ==========================================

const importMentors = async (records = []) => {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Mentor data is required.");
  }

  const importedMentors = [];
  const updatedMentors = [];
  const duplicateMentors = [];
  const failedMentors = [];

  for (const record of records) {
    try {
      const facultyId = upper(record.facultyId);
      const email = lower(record.mentorEmail);
      const name = clean(record.mentorName);
      const roles = parseList(record.roles);

      if (!facultyId || !email || !name) {
        throw new Error(
          "Faculty ID, Faculty Name and Faculty Email are required.",
        );
      }

      if (roles.length === 0) {
        throw new Error("At least one faculty role is required.");
      }

      const assignments = buildAssignments(record);

      // ======================================
      // FIND EXISTING FACULTY ACCOUNT
      // ======================================

      const byEmployeeId = await Mentor.findOne({
        employeeId: facultyId,
      });

      const byEmail = await Mentor.findOne({ email });

      if (
        byEmployeeId &&
        byEmail &&
        String(byEmployeeId._id) !== String(byEmail._id)
      ) {
        throw new Error("Faculty ID and email belong to different accounts.");
      }

      let faculty = byEmployeeId || byEmail;

      if (!faculty) {
        // Do not create an inaccessible account with a
        // password nobody can securely receive.
        //
        // Implement invitation / password setup first.
        failedMentors.push({
          rowNumber: record.rowNumber,
          facultyId,
          reason:
            "Faculty login account does not exist. Secure invitation setup is required.",
        });

        continue;
      }

      if (faculty.employeeId !== facultyId) {
        throw new Error("Existing account Faculty ID does not match Excel.");
      }

      faculty.name = name;
      faculty.email = email;
      faculty.designation = clean(record.designation);
      faculty.department = upper(record.department);

      faculty.roles = unique([...(faculty.roles || []), ...roles]);

      faculty.roleAssignments = mergeAssignments(
        faculty.roleAssignments || [],
        assignments,
      );

      await faculty.save();

      // ======================================
      // MENTOR MASTER GROUP MAPPING
      // ======================================

      if (roles.includes("MENTOR")) {
        const course = upper(record.course);
        const semester = Number(record.semester);
        const section = upper(record.section);
        const group = upper(record.group);

        if (!course || !semester || !group) {
          throw new Error("Mentor course, semester and group are required.");
        }

        const master = await MentorMaster.findOne({
          course,
          semester,
          group,
          $or: [{ mentorEmail: email }, { mentorUser: faculty._id }],
          isDeleted: false,
        });

        if (master) {
          master.name = name;
          master.mentorEmail = email;
          master.section = section;
          master.mentorUser = faculty._id;

          await master.save();

          updatedMentors.push({
            facultyId,
            mentorMasterId: master._id,
          });
        } else {
          const newMaster = await MentorMaster.create({
            name,
            course,
            semester,
            section,
            group,
            mentorEmail: email,
            mentorUser: faculty._id,
            coordinator: clean(record.coordinator),
            totalStudents: 0,
          });

          importedMentors.push({
            facultyId,
            mentorMasterId: newMaster._id,
          });
        }
      } else {
        updatedMentors.push({
          facultyId,
          message: "Faculty role assignments updated.",
        });
      }
    } catch (error) {
      failedMentors.push({
        rowNumber: record.rowNumber,
        facultyId: record.facultyId,
        reason: error.message,
      });
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
