"use strict";

const mongoose = require("mongoose");
const MentorMaster = require("../models/MentorMaster");

// ==========================================
// HELPERS
// ==========================================

const upper = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const lower = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const clean = (value) => String(value ?? "").trim();

// ==========================================
// CREATE MENTOR MASTER
// ==========================================

const createMentor = (payload) => {
  return MentorMaster.create(payload);
};

// ==========================================
// BULK INSERT MENTORS
// ==========================================

const insertManyMentors = (payload) => {
  return MentorMaster.insertMany(payload, {
    ordered: false,
  });
};

// ==========================================
// GET ALL MENTORS
// ==========================================

const getAllMentors = () => {
  return MentorMaster.find({
    isDeleted: false,
  }).sort({
    name: 1,
  });
};

// ==========================================
// GET MENTOR BY ID
// ==========================================

const getMentorById = (id) => {
  if (!mongoose.isValidObjectId(id)) {
    return null;
  }

  return MentorMaster.findOne({
    _id: id,
    isDeleted: false,
  });
};

// ==========================================
// GET MENTOR BY EMPLOYEE ID
// ==========================================

// Requires facultyId field in updated MentorMaster.
// Legacy records may not contain facultyId.
const getMentorByEmployeeId = (employeeId) => {
  const facultyId = upper(employeeId);

  if (!facultyId) return null;

  return MentorMaster.findOne({
    facultyId,
    isDeleted: false,
  });
};

// ==========================================
// GET MENTORS BY COURSE
// ==========================================

const getMentorsByCourse = (course) => {
  return MentorMaster.find({
    course: upper(course),
    isDeleted: false,
  }).sort({
    name: 1,
  });
};

// ==========================================
// GET MENTORS BY SEMESTER & SECTION
// ==========================================

const getMentorsBySemester = (semester, section) => {
  return MentorMaster.find({
    semester: Number(semester),
    section: upper(section),
    isDeleted: false,
  }).sort({
    name: 1,
  });
};

// ==========================================
// GET MENTOR BY GROUP
// ==========================================

// Course is optional for backward compatibility.
// New mapping should always supply course.
const getMentorByGroup = (semester, section, group, course = null) => {
  const query = {
    semester: Number(semester),
    section: upper(section),
    group: upper(group),
    isDeleted: false,
  };

  if (course) {
    query.course = upper(course);
  }

  return MentorMaster.findOne(query);
};

// ==========================================
// GET MENTOR BY DETAILS
// ==========================================

const getMentorByDetails = ({
  mentorName,
  mentorEmail,
  semester,
  section,
  group,
  course,
}) => {
  const query = {
    semester: Number(semester),
    group: upper(group),
    isDeleted: false,
  };

  if (mentorName) {
    query.name = clean(mentorName);
  }

  if (mentorEmail) {
    query.mentorEmail = lower(mentorEmail);
  }

  if (section) {
    query.section = upper(section);
  }

  if (course) {
    query.course = upper(course);
  }

  return MentorMaster.findOne(query);
};

// ==========================================
// FIND EXISTING ACADEMIC ASSIGNMENT
// ==========================================

const findAcademicAssignment = ({ course, semester, section, group }) => {
  return MentorMaster.find({
    course: upper(course),
    semester: Number(semester),
    section: upper(section),
    group: upper(group),
    isDeleted: false,
  });
};

// ==========================================
// FIND MENTOR MASTERS BY FACULTY ACCOUNT
// ==========================================

const getMentorMastersByUser = (mentorUserId) => {
  if (!mongoose.isValidObjectId(mentorUserId)) {
    return [];
  }

  return MentorMaster.find({
    mentorUser: mentorUserId,
    isDeleted: false,
  });
};

// ==========================================
// LINK FACULTY LOGIN TO MENTOR MASTER
// ==========================================

const linkMentorUser = (mentorMasterId, mentorUserId) => {
  if (
    !mongoose.isValidObjectId(mentorMasterId) ||
    !mongoose.isValidObjectId(mentorUserId)
  ) {
    throw new Error("Invalid mentor or faculty account ID.");
  }

  return MentorMaster.findOneAndUpdate(
    {
      _id: mentorMasterId,
      isDeleted: false,
    },
    {
      $set: {
        mentorUser: mentorUserId,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );
};

// ==========================================
// UPDATE MENTOR
// ==========================================

const updateMentor = (id, payload) => {
  if (!mongoose.isValidObjectId(id)) {
    return null;
  }

  return MentorMaster.findOneAndUpdate(
    {
      _id: id,
      isDeleted: false,
    },
    {
      $set: payload,
    },
    {
      new: true,
      runValidators: true,
    },
  );
};

// ==========================================
// SOFT DELETE MENTOR
// ==========================================

const deleteMentor = (id) => {
  if (!mongoose.isValidObjectId(id)) {
    return null;
  }

  return MentorMaster.findOneAndUpdate(
    {
      _id: id,
      isDeleted: false,
    },
    {
      $set: {
        isDeleted: true,
        isActive: false,
      },
    },
    {
      new: true,
    },
  );
};

// ==========================================
// EXPORT
// ==========================================

module.exports = Object.freeze({
  createMentor,
  insertManyMentors,
  getAllMentors,
  getMentorById,
  getMentorByEmployeeId,
  getMentorsByCourse,
  getMentorsBySemester,
  getMentorByGroup,
  getMentorByDetails,
  findAcademicAssignment,
  getMentorMastersByUser,
  linkMentorUser,
  updateMentor,
  deleteMentor,
});
