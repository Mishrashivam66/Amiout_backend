"use strict";

const mongoose = require("mongoose");

const StudentMaster = require("../models/StudentMaster");
const MentorMaster = require("../models/MentorMaster");
const Group = require("../models/Group");
const Institute = require("../models/Institute");
const Program = require("../models/Program");

// =====================================================
// HELPERS
// =====================================================

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const strId = (value) => String(value?._id ?? value ?? "");

const own = (value) => value !== null && value !== undefined;

const errorWithCode = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

const groupKeyFor = (student) => ({
  institute: student.institute,
  program: student.program,
  batch: String(student.batch ?? "").trim(),
  semester: Number(student.semester),
  section: normalize(student.section),
  groupName: normalize(student.group),
});

const assertGroupKey = (key) => {
  if (
    !mongoose.isValidObjectId(key.institute) ||
    !mongoose.isValidObjectId(key.program) ||
    !key.batch ||
    !Number.isInteger(key.semester) ||
    key.semester < 1 ||
    !key.section ||
    !key.groupName
  ) {
    throw errorWithCode("Student academic group details are incomplete.", 422);
  }
};

// =====================================================
// ACADEMIC CONTEXT
// =====================================================

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
    throw errorWithCode("Active Institute or Program not found.", 422);
  }

  if (strId(program.institute) !== strId(institute._id)) {
    throw errorWithCode("Program does not belong to the Institute.", 422);
  }

  if (!normalize(institute.code) || !normalize(program.code)) {
    throw errorWithCode("Institute or Program code missing.", 422);
  }

  return { institute, program };
};

// =====================================================
// MENTOR ELIGIBILITY
// =====================================================

const isEligibleMentor = (mentor, group, context) =>
  Boolean(mentor) &&
  mentor.isActive === true &&
  mentor.isDeleted === false &&
  Array.isArray(mentor.roles) &&
  mentor.roles.includes("MENTOR") &&
  normalize(mentor.institute) === normalize(context.institute.code) &&
  normalize(mentor.program) === normalize(context.program.code) &&
  Number(mentor.semester) === Number(group.semester) &&
  normalize(mentor.section) === normalize(group.section) &&
  normalize(mentor.group) === normalize(group.groupName);

// =====================================================
// FIND ELIGIBLE FACULTY
// =====================================================

const getEligibleCandidates = async (group, context) => {
  const records = await MentorMaster.find({
    institute: normalize(context.institute.code),
    program: normalize(context.program.code),
    semester: Number(group.semester),
    section: normalize(group.section),
    group: normalize(group.groupName),
    roles: "MENTOR",
    isActive: true,
    isDeleted: false,
  })
    .sort({ _id: 1 })
    .lean();

  return records.filter((record) => isEligibleMentor(record, group, context));
};

// One faculty may have multiple MentorMaster records.
const candidateIdentity = (mentor) => {
  const facultyId = normalize(mentor.facultyId);

  const email = String(mentor.mentorEmail ?? "")
    .trim()
    .toLowerCase();

  if (facultyId) return `ID:${facultyId}`;

  if (email) return `EMAIL:${email}`;

  return `RECORD:${strId(mentor._id)}`;
};

// =====================================================
// SELECT PRIMARY MENTOR
// =====================================================

const pickUnambiguousPrimary = (candidates) => {
  const byFaculty = new Map();

  for (const mentor of candidates) {
    const key = candidateIdentity(mentor);

    if (!byFaculty.has(key)) {
      byFaculty.set(key, mentor);
    }
  }

  if (byFaculty.size === 0) {
    throw errorWithCode("No eligible primary mentor found.", 422);
  }

  if (byFaculty.size > 1) {
    throw errorWithCode(
      "Multiple eligible faculties found; assign primary mentor manually.",
      409,
    );
  }

  return [...byFaculty.values()][0];
};

// =====================================================
// GET OR CREATE GROUP
// =====================================================

const getOrCreateActiveGroup = async (key) => {
  // Do not silently reactivate deleted groups.
  let group = await Group.findOne(key).lean();

  if (!group) {
    try {
      group = await Group.create({
        ...key,
        isActive: true,
        isDeleted: false,
      });
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }

      group = await Group.findOne(key).lean();
    }
  }

  if (!group || !group.isActive || group.isDeleted) {
    throw errorWithCode("Group is inactive, deleted, or unavailable.", 409);
  }

  return group;
};

// =====================================================
// RESOLVE PRIMARY + BACKUP MENTOR
// =====================================================

const resolveGroupMentors = async (group, context) => {
  const candidates = await getEligibleCandidates(group, context);

  let primaryId;

  if (own(group.primaryMentor)) {
    const existing = await MentorMaster.findById(group.primaryMentor).lean();

    if (!isEligibleMentor(existing, group, context)) {
      throw errorWithCode(
        "Existing primary mentor is invalid or inactive.",
        409,
      );
    }

    primaryId = existing._id;
  } else {
    const selected = pickUnambiguousPrimary(candidates);

    // Never overwrite concurrent manual assignment.
    await Group.updateOne(
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

    const latest = await Group.findById(group._id).lean();

    if (!latest || !latest.isActive || latest.isDeleted) {
      throw errorWithCode("Group changed during mapping.", 409);
    }

    const chosen = await MentorMaster.findById(latest.primaryMentor).lean();

    if (!isEligibleMentor(chosen, group, context)) {
      throw errorWithCode(
        "Group primary mentor changed to an ineligible faculty.",
        409,
      );
    }

    primaryId = chosen._id;
  }

  const latest = await Group.findById(group._id).lean();

  if (!latest || !latest.isActive || latest.isDeleted) {
    throw errorWithCode("Group unavailable during mapping.", 409);
  }

  if (strId(latest.primaryMentor) !== strId(primaryId)) {
    throw errorWithCode("Primary mentor changed during mapping; retry.", 409);
  }

  let backupId = null;

  if (own(latest.backupMentor)) {
    const backup = await MentorMaster.findById(latest.backupMentor).lean();

    if (!isEligibleMentor(backup, group, context)) {
      throw errorWithCode(
        "Configured backup mentor is invalid or inactive.",
        409,
      );
    }

    const primary = await MentorMaster.findById(primaryId).lean();

    if (candidateIdentity(backup) === candidateIdentity(primary)) {
      throw errorWithCode(
        "Primary and backup cannot be the same faculty.",
        409,
      );
    }

    backupId = backup._id;
  }

  return {
    primaryId,
    backupId,
  };
};

// =====================================================
// GENERATE AUTOMATIC STUDENT MAPPING
// =====================================================

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
  let mapped = 0;

  const cache = new Map();

  for (const student of students) {
    try {
      const key = groupKeyFor(student);

      assertGroupKey(key);

      const cacheKey = [
        strId(key.institute),
        strId(key.program),
        key.batch,
        key.semester,
        key.section,
        key.groupName,
      ].join("|");

      let resolved = cache.get(cacheKey);

      if (!resolved) {
        const group = await getOrCreateActiveGroup(key);

        const context = await getAcademicContext(group);

        const mentors = await resolveGroupMentors(group, context);

        resolved = {
          groupId: group._id,
          ...mentors,
        };

        cache.set(cacheKey, resolved);
      }

      const result = await StudentMaster.updateOne(
        {
          _id: student._id,
          isActive: true,
          isDeleted: false,
          institute: key.institute,
          program: key.program,
          batch: key.batch,
          semester: key.semester,
          section: key.section,
          group: key.groupName,
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
        throw errorWithCode(
          "Student record changed during mapping; retry.",
          409,
        );
      }

      mapped++;
    } catch (error) {
      errors.push({
        enrollmentNumber: student.enrollmentNumber,
        studentName: student.name,
        reason: error.message,
      });
    }
  }

  return {
    success: errors.length === 0,
    totalStudents: students.length,
    mapped,
    failed: errors.length,
    errors,
  };
};

// =====================================================
// MANUAL PRIMARY / BACKUP ASSIGNMENT
// =====================================================

const assignMentor = async (groupId, mentorId, field) => {
  if (
    !mongoose.isValidObjectId(groupId) ||
    !mongoose.isValidObjectId(mentorId)
  ) {
    throw errorWithCode("Valid groupId and mentorId required.");
  }

  const group = await Group.findOne({
    _id: groupId,
    isActive: true,
    isDeleted: false,
  }).lean();

  if (!group) {
    throw errorWithCode("Active group not found.", 404);
  }

  const context = await getAcademicContext(group);

  const mentor = await MentorMaster.findById(mentorId).lean();

  if (!isEligibleMentor(mentor, group, context)) {
    throw errorWithCode(
      "Mentor is not authorized for this academic group.",
      422,
    );
  }

  const otherField =
    field === "primaryMentor" ? "backupMentor" : "primaryMentor";

  if (own(group[otherField])) {
    const otherMentor = await MentorMaster.findById(group[otherField]).lean();

    if (
      otherMentor &&
      candidateIdentity(otherMentor) === candidateIdentity(mentor)
    ) {
      throw errorWithCode(
        "Primary and backup must be different faculties.",
        409,
      );
    }
  }

  const updated = await Group.findOneAndUpdate(
    {
      _id: groupId,
      isActive: true,
      isDeleted: false,
      [field]: group[field] ?? null,
      [otherField]: group[otherField] ?? null,
    },
    {
      $set: {
        [field]: mentor._id,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) {
    throw errorWithCode("Group assignment changed; retry.", 409);
  }

  // Synchronize students using full academic identity.
  const key = {
    institute: updated.institute,
    program: updated.program,
    batch: updated.batch,
    semester: updated.semester,
    section: updated.section,
    group: updated.groupName,
    isActive: true,
    isDeleted: false,
  };

  await StudentMaster.updateMany(key, {
    $set: {
      mentorGroup: updated._id,
      [field]: mentor._id,
    },
  });

  return updated;
};

// =====================================================
// ASSIGN PRIMARY MENTOR
// =====================================================

const assignPrimaryMentor = (groupId, mentorId) =>
  assignMentor(groupId, mentorId, "primaryMentor");

// =====================================================
// ASSIGN BACKUP MENTOR
// =====================================================

const assignBackupMentor = (groupId, mentorId) =>
  assignMentor(groupId, mentorId, "backupMentor");

// =====================================================
// GET GROUP MAPPING
// =====================================================

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
    batch: String(batch ?? "").trim(),
    semester: Number(semester),
    section: normalize(section),
    groupName: normalize(groupName),
  };

  assertGroupKey(key);

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
    throw errorWithCode("Group not found.", 404);
  }

  return group;
};

// =====================================================
// EXPORT
// =====================================================

module.exports = Object.freeze({
  generateMapping,
  assignPrimaryMentor,
  assignBackupMentor,
  getGroupMapping,
});
