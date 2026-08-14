const Joi = require("joi");

const registerSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100).required(),

  email: Joi.string().email().lowercase().required(),

  enrollmentNo: Joi.string().trim().uppercase().required(),

  mobileNumber: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .required(),

  // Academic Details

  course: Joi.string().trim().required(),

  branch: Joi.string().trim().required(),

  semester: Joi.number().integer().min(1).max(8).required(),

  password: Joi.string()
    .min(8)
    .max(20)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%\*?&]).+$/)
    .required(),
});

module.exports = registerSchema;
