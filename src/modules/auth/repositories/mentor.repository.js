"use strict";
const Mentor = require("../models/Mentor");

class MentorRepository {
  // ==========================================
  // FIND BY EMAIL
  // ==========================================

  async findByEmail(email) {
    const mentor = await Mentor.findOne({
      email: email.toLowerCase(),
    }).select("+password +refreshToken");

    return mentor;
  }

  // ==========================================
  // FIND BY EMPLOYEE ID
  // ==========================================

  async findByEmployeeId(employeeId) {
    return Mentor.findOne({
      employeeId: employeeId.toUpperCase(),
    });
  }

  // ==========================================
  // FIND BY ID
  // ==========================================

  async findById(id) {
    return Mentor.findById(id).select(
      "+password +refreshToken +resetPasswordToken",
    );
  }

  // ==========================================
  // CREATE MENTOR
  // ==========================================

  async create(data) {
    return Mentor.create(data);
  }

  // ==========================================
  // UPDATE MENTOR
  // ==========================================

  async update(id, payload) {
    return Mentor.findByIdAndUpdate(id, payload, {
      returnDocument: "after",
      runValidators: true,
    });
  }

  // ==========================================
  // DELETE MENTOR
  // ==========================================

  async delete(id) {
    return Mentor.findByIdAndDelete(id);
  }
}

const mentorRepository = new MentorRepository();

module.exports = Object.freeze({
  findMentorByEmail: (email) => mentorRepository.findByEmail(email),

  findMentorByEmployeeId: (employeeId) =>
    mentorRepository.findByEmployeeId(employeeId),

  findMentorById: (id) => mentorRepository.findById(id),

  createMentor: (data) => mentorRepository.create(data),

  updateMentor: (id, payload) => mentorRepository.update(id, payload),

  deleteMentor: (id) => mentorRepository.delete(id),
});
