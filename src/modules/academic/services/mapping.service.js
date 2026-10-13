"use strict";

const mongoose = require("mongoose");

const StudentMaster = require("../models/StudentMaster");
const MentorMaster = require("../models/MentorMaster");
const Group = require("../models/Group");
const Institute = require("../models/Institute");
const Program = require("../models/Program");

// ============================================================
// HELPERS
// ============================================================

const upper = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const clean = (value) => String(value ?? "").trim();

const getId = (value) => String(value?._id ?? value ?? "");

const sameId = (a, b) => getId(a) === getId(b);

const createError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

const facultyIdentity = (faculty) => {
  if (!faculty) return "";

  if (upper(faculty.facultyId)) {
    return `ID:${upper(faculty.facultyId)}`;
  }

  if (clean(faculty.mentorEmail)) {
    return `EMAIL:${clean(faculty.mentorEmail).toLowerCase()}`;
  }

  return `RECORD:${getId(faculty._id)}`;
};

const hasRole = (faculty, role) =>
  Array.isArray(faculty?.roles) && faculty.roles.includes(role);

const isActiveFaculty = (faculty) =>
  Boolean(faculty) && faculty.isActive === true && faculty.isDeleted === false;

const studentGroupKey = (student) => ({
  institute: student.institute,
  program: student.program,
  batch: clean(student.batch),
  semester: Number(student.semester),
  section: upper(student.section),
  groupName: upper(student.group),
});

const validateGroupKey = (key) => {
  if (
    !mongoose.isValidObjectId(key.institute) ||
    !mongoose.isValidObjectId(key.program) ||
    !key.batch ||
    !Number.isInteger(key.semester) ||
    key.semester < 1 ||
    !key.section ||
    !key.groupName
  ) {
    throw createError("Incomplete student academic details.", 422);
  }
};

// ============================================================
// ACADEMIC CONTEXT
// ============================================================

const getAcademicContext = async (group) => {
  const [institute, program] = await Promise.all([
    Institute.findOne({
      _id: group.institute,
      isActive: true,
      isDeleted: false,
    }).lean(),

    Program.findOne({
      _id: group.program,
      isActive: true,
      isDeleted: false,
    }).lean(),
  ]);

  if (!institute || !program) {
    throw createError("Active Institute or Program not found.", 422);
  }

  if (!sameId(program.institute, institute._id)) {
    throw createError("Program belongs to another Institute.", 422);
  }

  if (!upper(institute.code) || !upper(program.code)) {
    throw createError("Academic Institute/Program code missing.", 422);
  }

  return { institute, program };
};

// ============================================================
// PRIMARY MENTOR VALIDATION
// ============================================================

const isPrimaryEligible = (faculty, group, context) =>
  isActiveFaculty(faculty) &&
  hasRole(faculty, "MENTOR") &&
  upper(faculty.institute) === upper(context.institute.code) &&
  upper(faculty.program) === upper(context.program.code) &&
  Number(faculty.semester) === Number(group.semester) &&
  upper(faculty.section) === upper(group.section) &&
  upper(faculty.group) === upper(group.groupName);

// ============================================================
// FIND PRIMARY MENTOR
// ============================================================

const findPrimaryCandidates = async (group, context) => {
  const records = await MentorMaster.find({
    institute: upper(context.institute.code),
    program: upper(context.program.code),
    semester: Number(group.semester),
    section: upper(group.section),
    group: upper(group.groupName),
    roles: "MENTOR",
    isActive: true,
    isDeleted: false,
  })
    .sort({ _id: 1 })
    .lean();

  return records.filter((faculty) =>
    isPrimaryEligible(faculty, group, context),
  );
};

const selectSingleFaculty = (records, authorityName) => {
  const unique = new Map();

  for (const record of records) {
    const identity = facultyIdentity(record);

    if (!unique.has(identity)) {
      unique.set(identity, record);
    }
  }

  if (unique.size === 0) {
    throw createError(`No eligible ${authorityName} found.`, 422);
  }

  if (unique.size > 1) {
    throw createError(
      `Multiple ${authorityName} faculties found. Manual configuration required.`,
      409,
    );
  }

  return [...unique.values()][0];
};

// ============================================================
// FIND OR CREATE GROUP
// ============================================================

const getOrCreateGroup = async (key) => {
  validateGroupKey(key);

  let group = await Group.findOne(key).lean();

  if (!group) {
    try {
      group = await Group.create({
        ...key,
        primaryMentor: null,
        backupMentor: null,
        isActive: true,
        isDeleted: false,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;

      group = await Group.findOne(key).lean();
    }
  }

  if (!group || group.isActive !== true || group.isDeleted === true) {
    throw createError("Academic Group is inactive or unavailable.", 409);
  }

  return group;
};

// ============================================================
// RESOLVE PRIMARY MENTOR
// ============================================================

const resolvePrimaryMentor = async (group, context) => {
  if (group.primaryMentor) {
    const existing = await MentorMaster.findById(group.primaryMentor).lean();

    if (!isPrimaryEligible(existing, group, context)) {
      throw createError("Existing primary mentor is invalid or inactive.", 409);
    }

    return existing;
  }

  const candidates = await findPrimaryCandidates(group, context);

  const selected = selectSingleFaculty(candidates, "Primary Mentor");

  const result = await Group.updateOne(
    {
      _id: group._id,
      primaryMentor: null,
      isActive: true,
      isDeleted: false,
    },
    {
      $set: {
        primaryMentor: selected._id,
      },
    },
  );

  if (result.matchedCount !== 1) {
    const latest = await Group.findById(group._id).lean();
    const current = latest?.primaryMentor
      ? await MentorMaster.findById(latest.primaryMentor).lean()
      : null;

    if (!isPrimaryEligible(current, latest, context)) {
      throw createError("Primary mentor changed during mapping.", 409);
    }

    return current;
  }

  return selected;
};

// ============================================================
// VALIDATE CROSS-GROUP BACKUP
// ============================================================

const getValidBackup = async (group, context, primary) => {
  if (!group.backupMentor) return null;

  const backup = await MentorMaster.findById(group.backupMentor).lean();

  if (!isActiveFaculty(backup) || !hasRole(backup, "MENTOR")) {
    throw createError("Backup Mentor is invalid or inactive.", 409);
  }

  if (facultyIdentity(primary) === facultyIdentity(backup)) {
    throw createError("Primary and Backup must be different faculties.", 409);
  }

  const pairedGroup = await Group.findOne({
    institute: group.institute,
    program: group.program,
    batch: group.batch,
    semester: group.semester,
    section: group.section,
    groupName: upper(backup.group),
    primaryMentor: backup._id,
    _id: { $ne: group._id },
    isActive: true,
    isDeleted: false,
  }).lean();

  if (!pairedGroup || !isPrimaryEligible(backup, pairedGroup, context)) {
    throw createError("Backup is not an authorized paired-group Mentor.", 409);
  }

  return backup;
};

// ============================================================
// CROSS-GROUP BACKUP MAPPING
// ============================================================

const assignCrossGroupBackups = async (
  instituteId,
  programId,
  batch,
  semester,
  section,
) => {
  const groups = await Group.find({
    institute: instituteId,
    program: programId,
    batch,
    semester,
    section: upper(section),
    isActive: true,
    isDeleted: false,
  })
    .sort({ groupName: 1 })
    .lean();

  if (groups.length !== 2) {
    return {
      assigned: false,
      reason: "Exactly two active groups required for automatic mutual backup.",
    };
  }

  const [groupA, groupB] = groups;

  if (!groupA.primaryMentor || !groupB.primaryMentor) {
    return {
      assigned: false,
      reason: "Both Primary Mentors are required.",
    };
  }

  const context = await getAcademicContext(groupA);

  const [mentorA, mentorB] = await Promise.all([
    MentorMaster.findById(groupA.primaryMentor).lean(),

    MentorMaster.findById(groupB.primaryMentor).lean(),
  ]);

  if (
    !isPrimaryEligible(mentorA, groupA, context) ||
    !isPrimaryEligible(mentorB, groupB, context)
  ) {
    throw createError("Invalid Primary Mentor in paired groups.", 409);
  }

  if (facultyIdentity(mentorA) === facultyIdentity(mentorB)) {
    throw createError("Both groups cannot share the same backup faculty.", 409);
  }

  const pairs = [
    { group: groupA, backup: mentorB },
    { group: groupB, backup: mentorA },
  ];

  // Validate all existing assignments before updates.
  for (const { group, backup } of pairs) {
    if (group.backupMentor && !sameId(group.backupMentor, backup._id)) {
      throw createError(
        `Conflicting Backup Mentor for ${group.groupName}.`,
        409,
      );
    }
  }

  // Idempotent; partially completed mapping can retry.
  for (const { group, backup } of pairs) {
    const result = await Group.updateOne(
      {
        _id: group._id,
        primaryMentor: group.primaryMentor,
        backupMentor: group.backupMentor ?? null,
        isActive: true,
        isDeleted: false,
      },
      {
        $set: {
          backupMentor: backup._id,
        },
      },
    );

    if (result.matchedCount !== 1) {
      throw createError(
        `Group ${group.groupName} changed. Retry mapping.`,
        409,
      );
    }
  }

  for (const { group, backup } of pairs) {
    await StudentMaster.updateMany(
      {
        institute: group.institute,
        program: group.program,
        batch: group.batch,
        semester: group.semester,
        section: group.section,
        group: group.groupName,
        mentorGroup: group._id,
        primaryMentor: group.primaryMentor,
        isActive: true,
        isDeleted: false,
      },
      {
        $set: {
          backupMentor: backup._id,
        },
      },
    );
  }

  return {
    assigned: true,
    groups: [
      {
        group: groupA.groupName,
        primaryMentor: mentorA.name,
        backupMentor: mentorB.name,
      },
      {
        group: groupB.groupName,
        primaryMentor: mentorB.name,
        backupMentor: mentorA.name,
      },
    ],
  };
};

// ============================================================
// AUTHORITY RESOLUTION
// Coordinator -> HOD -> HOI
// Does not approve or transfer requests.
// ============================================================

const resolveHigherAuthorities = async (group, departmentCode = null) => {
  const context = await getAcademicContext(group);

  const base = {
    institute: upper(context.institute.code),
    isActive: true,
    isDeleted: false,
  };

  // --------------------------------------------------------
  // COORDINATOR
  // --------------------------------------------------------

  const coordinatorRecords = await MentorMaster.find({
    ...base,
    program: upper(context.program.code),
    semester: Number(group.semester),
    section: upper(group.section),
    roles: "COORDINATOR",
    coordinatorGroups: upper(group.groupName),
  }).lean();

  const coordinatorCandidates = coordinatorRecords.filter(
    (faculty) =>
      isActiveFaculty(faculty) &&
      hasRole(faculty, "COORDINATOR") &&
      Array.isArray(faculty.coordinatorGroups) &&
      faculty.coordinatorGroups.map(upper).includes(upper(group.groupName)),
  );

  // --------------------------------------------------------
  // HOD
  // Department must come from trusted academic configuration.
  // --------------------------------------------------------

  const department = upper(departmentCode);

  const hodRecords = department
    ? await MentorMaster.find({
        ...base,
        department,
        roles: "HOD",
      }).lean()
    : [];

  // --------------------------------------------------------
  // HOI
  // --------------------------------------------------------

  const hoiRecords = await MentorMaster.find({
    ...base,
    roles: "HOI",
  }).lean();

  const uniqueFaculties = (records) => {
    const result = new Map();

    for (const faculty of records) {
      if (!isActiveFaculty(faculty)) continue;

      result.set(facultyIdentity(faculty), faculty);
    }

    return [...result.values()];
  };

  const format = (records, role) =>
    uniqueFaculties(records).map((faculty) => ({
      mentorMasterId: faculty._id,
      mentorUser: faculty.mentorUser ?? null,
      facultyId: faculty.facultyId,
      name: faculty.name,
      role,
    }));

  return {
    coordinator: format(coordinatorCandidates, "COORDINATOR"),

    hod: format(hodRecords, "HOD"),

    hoi: format(hoiRecords, "HOI"),

    departmentResolved: Boolean(department),
  };
};

// ============================================================
// GENERATE STUDENT MAPPING
// PHASE 1: PRIMARY
// PHASE 2: CROSS-GROUP BACKUP
// PHASE 3: AUTHORITY VALIDATION REPORT
// ============================================================

const generateMapping = async () => {
  const students = await StudentMaster.find({
    isActive: true,
    isDeleted: false,
  })
    .select(
      "_id name enrollmentNumber institute program batch semester section group",
    )
    .lean();

  const errors = [];
  const resolvedGroups = new Map();
  const processedSections = new Map();

  let mapped = 0;

  // --------------------------------------------------------
  // PHASE 1: PRIMARY MENTOR
  // --------------------------------------------------------

  for (const student of students) {
    try {
      const key = studentGroupKey(student);
      validateGroupKey(key);

      const cacheKey = [
        getId(key.institute),
        getId(key.program),
        key.batch,
        key.semester,
        key.section,
        key.groupName,
      ].join("|");

      let resolved = resolvedGroups.get(cacheKey);

      if (!resolved) {
        const group = await getOrCreateGroup(key);
        const context = await getAcademicContext(group);

        const primary = await resolvePrimaryMentor(group, context);

        const latest = await Group.findById(group._id).lean();

        if (!latest || !sameId(latest.primaryMentor, primary._id)) {
          throw createError("Primary assignment changed. Retry.", 409);
        }

        const backup = await getValidBackup(latest, context, primary);

        resolved = {
          groupId: latest._id,
          primaryId: primary._id,
          backupId: backup?._id ?? null,
        };

        resolvedGroups.set(cacheKey, resolved);
      }

      const result = await StudentMaster.updateOne(
        {
          _id: student._id,
          institute: key.institute,
          program: key.program,
          batch: key.batch,
          semester: key.semester,
          section: key.section,
          group: key.groupName,
          isActive: true,
          isDeleted: false,
        },
        {
          $set: {
            mentorGroup: resolved.groupId,
            primaryMentor: resolved.primaryId,
            backupMentor: resolved.backupId,
          },
        },
      );

      if (result.matchedCount !== 1) {
        throw createError("Student academic record changed.", 409);
      }

      mapped++;

      const sectionKey = [
        getId(key.institute),
        getId(key.program),
        key.batch,
        key.semester,
        key.section,
      ].join("|");

      if (!processedSections.has(sectionKey)) {
        processedSections.set(sectionKey, key);
      }
    } catch (error) {
      errors.push({
        enrollmentNumber: student.enrollmentNumber,
        studentName: student.name,
        reason: error.message,
      });
    }
  }

  // --------------------------------------------------------
  // PHASE 2: MUTUAL BACKUP
  // --------------------------------------------------------

  const backupResults = [];

  for (const key of processedSections.values()) {
    try {
      const result = await assignCrossGroupBackups(
        key.institute,
        key.program,
        key.batch,
        key.semester,
        key.section,
      );

      backupResults.push({
        batch: key.batch,
        semester: key.semester,
        section: key.section,
        ...result,
      });
    } catch (error) {
      backupResults.push({
        batch: key.batch,
        semester: key.semester,
        section: key.section,
        assigned: false,
        reason: error.message,
      });
    }
  }

  // --------------------------------------------------------
  // PHASE 3: HIGHER AUTHORITY STATUS
  // --------------------------------------------------------

  const authorityResults = [];

  for (const key of processedSections.values()) {
    try {
      const group = await Group.findOne({
        ...key,
        isActive: true,
        isDeleted: false,
      }).lean();

      if (!group) continue;

      // Department mapping is not available in current
      // Program schema. HOD resolution stays unresolved.
      const authorities = await resolveHigherAuthorities(group);

      authorityResults.push({
        batch: key.batch,
        section: key.section,
        group: key.groupName,
        coordinatorCount: authorities.coordinator.length,
        hodCount: authorities.hod.length,
        hoiCount: authorities.hoi.length,
        departmentResolved: authorities.departmentResolved,
      });
    } catch (error) {
      authorityResults.push({
        section: key.section,
        group: key.groupName,
        reason: error.message,
      });
    }
  }

  const failedBackups = backupResults.filter((item) => !item.assigned);

  return {
    success: errors.length === 0 && failedBackups.length === 0,

    totalStudents: students.length,
    mapped,
    failed: errors.length,
    errors,

    backupResults,
    failedBackupSections: failedBackups.length,

    authorityResults,
  };
};

// ============================================================
// MANUAL MENTOR ASSIGNMENT
// ============================================================

const assignMentor = async (groupId, mentorId, field) => {
  if (
    !mongoose.isValidObjectId(groupId) ||
    !mongoose.isValidObjectId(mentorId)
  ) {
    throw createError("Valid Group and Mentor IDs required.", 400);
  }

  const group = await Group.findOne({
    _id: groupId,
    isActive: true,
    isDeleted: false,
  }).lean();

  if (!group) {
    throw createError("Group not found.", 404);
  }

  const context = await getAcademicContext(group);

  const faculty = await MentorMaster.findById(mentorId).lean();

  if (!isActiveFaculty(faculty) || !hasRole(faculty, "MENTOR")) {
    throw createError("Faculty is not an active Mentor.", 422);
  }

  if (field === "primaryMentor") {
    if (!isPrimaryEligible(faculty, group, context)) {
      throw createError("Primary Mentor academic scope mismatch.", 422);
    }
  } else {
    // Backup must be primary of another group
    // within the same institute/program/batch/section.
    const paired = await Group.findOne({
      institute: group.institute,
      program: group.program,
      batch: group.batch,
      semester: group.semester,
      section: group.section,
      groupName: upper(faculty.group),
      primaryMentor: faculty._id,
      _id: { $ne: group._id },
      isActive: true,
      isDeleted: false,
    }).lean();

    if (!paired || !isPrimaryEligible(faculty, paired, context)) {
      throw createError(
        "Backup Mentor must be a paired-group Primary Mentor.",
        422,
      );
    }
  }

  const otherField =
    field === "primaryMentor" ? "backupMentor" : "primaryMentor";

  if (group[otherField]) {
    const other = await MentorMaster.findById(group[otherField]).lean();

    if (other && facultyIdentity(other) === facultyIdentity(faculty)) {
      throw createError("Primary and Backup must be different faculties.", 409);
    }
  }

  const updated = await Group.findOneAndUpdate(
    {
      _id: group._id,
      isActive: true,
      isDeleted: false,
      [field]: group[field] ?? null,
      [otherField]: group[otherField] ?? null,
    },
    {
      $set: {
        [field]: faculty._id,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) {
    throw createError("Group mapping changed. Retry assignment.", 409);
  }

  await StudentMaster.updateMany(
    {
      institute: updated.institute,
      program: updated.program,
      batch: updated.batch,
      semester: updated.semester,
      section: updated.section,
      group: updated.groupName,
      isActive: true,
      isDeleted: false,
    },
    {
      $set: {
        mentorGroup: updated._id,
        [field]: faculty._id,
      },
    },
  );

  return updated;
};

// ============================================================
// ASSIGN PRIMARY MENTOR
// ============================================================

const assignPrimaryMentor = (groupId, mentorId) =>
  assignMentor(groupId, mentorId, "primaryMentor");

// ============================================================
// ASSIGN BACKUP MENTOR
// ============================================================

const assignBackupMentor = (groupId, mentorId) =>
  assignMentor(groupId, mentorId, "backupMentor");

// ============================================================
// GET GROUP MAPPING
// ============================================================

const getGroupMapping = async (
  instituteId,
  programId,
  batch,
  semester,
  section,
  groupName,
) => {
  const key = {
    institute: instituteId,
    program: programId,
    batch: clean(batch),
    semester: Number(semester),
    section: upper(section),
    groupName: upper(groupName),
  };

  validateGroupKey(key);

  const group = await Group.findOne({
    ...key,
    isActive: true,
    isDeleted: false,
  })
    .populate(
      "primaryMentor",
      "name facultyId mentorEmail roles isActive isDeleted",
    )
    .populate(
      "backupMentor",
      "name facultyId mentorEmail roles isActive isDeleted",
    );

  if (!group) {
    throw createError("Group not found.", 404);
  }

  return group;
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  generateMapping,
  assignPrimaryMentor,
  assignBackupMentor,
  assignCrossGroupBackups,
  resolveHigherAuthorities,
  getGroupMapping,
});
