const Joi = require("joi");

const resendOtpSchema = Joi.object({
  email: Joi.string().email().required(),
});

module.exports = resendOtpSchema;
