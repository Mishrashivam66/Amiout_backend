const mentorRepository = require("../repositories/mentorMaster.repository");

const importMentors = async (records = []) => {
  // ============================================================================
  // Validate
  // ============================================================================

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Mentor data is required.");
  }

  // ============================================================================
  // Collections
  // ============================================================================

  const mentorsToInsert = [];
  const duplicateMentors = [];
  const failedMentors = [];

  // ============================================================================
  // Process Every Row
  // ============================================================================

  for (const mentor of records) {
    // ============================================================================
    // Required Fields
    // ============================================================================
    if (
      !mentor.mentorName ||
      !mentor.course ||
      !mentor.semester ||
      !mentor.group
    ) {
      failedMentors.push({
        mentor,
        reason: "Required fields are missing.",
      });

      continue;
    }

    // ============================================================================
    // Duplicate Check
    // ============================================================================

    const existingMentor = await mentorRepository.getMentorByDetails({
      mentorName: mentor.mentorName,
      mentorEmail: mentor.mentorEmail ? mentor.mentorEmail.toLowerCase() : null,
      semester: Number(mentor.semester),
      group: mentor.group.toUpperCase(),
    });

    if (existingMentor) {
      duplicateMentors.push({
        mentor: mentor.mentorName,
        reason: "Mentor already imported.",
      });

      continue;
    }

    // ============================================================================
    // Ready For Insert
    // ============================================================================

    mentorsToInsert.push({
      name: mentor.mentorName,

      course: mentor.course.toUpperCase(),

      semester: Number(mentor.semester),

      mentorEmail: mentor.mentorEmail.toLowerCase(),

      group: mentor.group.toUpperCase(),

      coordinator: mentor.coordinator || "",

      totalStudents: Number(mentor.totalStudents) || 0,

      isActive: true,
    });
  }
  // ============================================================================
  // Bulk Insert
  // ============================================================================
  console.log("Mentors To Insert:");
  console.dir(mentorsToInsert, { depth: null });
  let importedCount = 0;
  if (mentorsToInsert.length > 0) {
    try {
      await mentorRepository.insertManyMentors(mentorsToInsert);

      importedCount = mentorsToInsert.length;
    } catch (error) {
      console.error("Mongo Error:", error.message);
      throw error;
    }
  }

  // ============================================================================
  // Summary
  // ============================================================================

  const summary = {
    totalRecords: records.length,

    validRecords: mentorsToInsert.length,

    importedRecords: importedCount,

    duplicateRecords: duplicateMentors.length,

    failedRecords: failedMentors.length,
  };

  // ============================================================================
  // Response
  // ============================================================================

  return {
    success: true,

    message: "Mentor import completed successfully.",

    summary,

    imported: importedCount,

    duplicates: duplicateMentors.length,

    failed: failedMentors.length,

    duplicateMentors,

    failedMentors,

    importedMentors: mentorsToInsert,
  };
};

// ============================================================================
// Get All Mentors
// ============================================================================

const getAllMentors = async () => {
  return mentorRepository.getAllMentors();
};

// ============================================================================
// Get Mentor By ID
// ============================================================================

const getMentorByEmployeeId = async (employeeId) => {
  const mentor = await mentorRepository.getMentorByEmployeeId(employeeId);

  if (!mentor) {
    throw new Error("Mentor not found.");
  }

  return mentor;
};

// ============================================================================
// Update Mentor
// ============================================================================

const updateMentor = async (id, payload) => {
  const mentor = await mentorRepository.getMentorById(id);

  if (!mentor) {
    throw new Error("Mentor not found.");
  }

  return mentorRepository.updateMentor(id, payload);
};

// ============================================================================
// Delete Mentor
// ============================================================================

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
