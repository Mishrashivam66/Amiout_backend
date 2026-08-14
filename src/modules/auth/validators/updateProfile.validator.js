const Joi = require("joi");

const updateProfileSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100),

  mobileNumber: Joi.string().pattern(/^[6-9]\d{9}$/),

  gender: Joi.string().valid("MALE", "FEMALE", "OTHER"),

  dateOfBirth: Joi.date(),

  course: Joi.string(),

  branch: Joi.string(),

  semester: Joi.number().min(1).max(8),

  section: Joi.string(),

  profilePhoto: Joi.string(),
});

module.exports = updateProfileSchema;
