const studentRepository = require("../repositories/studentMaster.repository");
const mentorRepository = require("../repositories/mentorMaster.repository");
const groupRepository = require("../repositories/group.repository");

// ============================================================================
// Generate Student Mapping
// ============================================================================
// ============================================================================
// Generate Student Mapping
// ============================================================================
const generateMapping = async () => {
  const students = await studentRepository.getAllStudents();

  let mapped = 0;
  let failed = 0;

  const errors = [];

  for (const student of students) {
    try {
      const group = await groupRepository.getGroup(
        student.institute._id,
        student.program._id,
        student.batch,
        student.semester,
        student.section,
        student.group,
      );

      if (!group) {
        failed++;

        errors.push({
          enrollmentNumber: student.enrollmentNumber,
          studentName: student.name,
          reason: "Group not found.",
        });

        continue;
      }

      await studentRepository.updateStudent(student._id, {
        mentorGroup: group._id,
        primaryMentor: group.primaryMentor,
        backupMentor: group.backupMentor,
      });

      mapped++;
    } catch (error) {
      failed++;

      errors.push({
        enrollmentNumber: student.enrollmentNumber,
        studentName: student.name,
        reason: error.message,
      });
    }
  }

  return {
    success: true,
    totalStudents: students.length,
    mapped,
    failed,
    errors,
  };
};

// ============================================================================
// Assign Primary Mentor
// ============================================================================
// ============================================================================
// Assign Primary Mentor
// ============================================================================
const assignPrimaryMentor = async (groupId, mentorId) => {
  /**
   * Validate Group
   */
  const group = await groupRepository.getGroupById(groupId);

  if (!group) {
    throw new Error("Group not found.");
  }

  /**
   * Validate Mentor
   */
  const mentor = await mentorRepository.getMentorById(mentorId);

  if (!mentor) {
    throw new Error("Mentor not found.");
  }

  /**
   * Mentor must be active
   */
  if (!mentor.isActive) {
    throw new Error("Mentor is inactive.");
  }

  /**
   * Mentor and Group should belong to same Institute
   */
  if (mentor.institute.toString() !== group.institute._id.toString()) {
    throw new Error("Mentor belongs to a different institute.");
  }

  /**
   * Mentor and Group should belong to same Program
   */
  if (mentor.program.toString() !== group.program._id.toString()) {
    throw new Error("Mentor belongs to a different program.");
  }

  /**
   * Assign Primary Mentor
   */
  return groupRepository.updateGroup(groupId, {
    primaryMentor: mentorId,
  });
};

// ============================================================================
// Assign Backup Mentor
// ============================================================================
// ============================================================================
// Assign Backup Mentor
// ============================================================================
const assignBackupMentor = async (groupId, mentorId) => {
  /**
   * Validate Group
   */
  const group = await groupRepository.getGroupById(groupId);

  if (!group) {
    throw new Error("Group not found.");
  }

  /**
   * Validate Mentor
   */
  const mentor = await mentorRepository.getMentorById(mentorId);

  if (!mentor) {
    throw new Error("Mentor not found.");
  }

  /**
   * Mentor must be active
   */
  if (!mentor.isActive) {
    throw new Error("Mentor is inactive.");
  }

  /**
   * Mentor and Group should belong to same Institute
   */
  if (mentor.institute.toString() !== group.institute._id.toString()) {
    throw new Error("Mentor belongs to a different institute.");
  }

  /**
   * Mentor and Group should belong to same Program
   */
  if (mentor.program.toString() !== group.program._id.toString()) {
    throw new Error("Mentor belongs to a different program.");
  }

  /**
   * Backup mentor should not be same as Primary mentor
   */
  if (
    group.primaryMentor &&
    group.primaryMentor._id.toString() === mentorId.toString()
  ) {
    throw new Error("Primary and Backup mentor cannot be the same.");
  }

  /**
   * Assign Backup Mentor
   */
  return groupRepository.updateGroup(groupId, {
    backupMentor: mentorId,
  });
};
// ============================================================================
// Get Group Mapping
// ============================================================================
const getGroupMapping = async (
  instituteId,
  programId,
  batch,
  semester,
  section,
  groupName,
) => {
  const group = await groupRepository.getGroup(
    instituteId,
    programId,
    batch,
    semester,
    section,
    groupName,
  );

  if (!group) {
    throw new Error("Group not found.");
  }

  return group;
};

module.exports = Object.freeze({
  generateMapping,
  assignPrimaryMentor,
  assignBackupMentor,
  getGroupMapping,
});
