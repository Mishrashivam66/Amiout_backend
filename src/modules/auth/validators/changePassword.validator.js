const Joi = require("joi");

const changePasswordSchema = Joi.object({
  oldPassword: Joi.string().required(),

  newPassword: Joi.string()
    .min(8)
    .max(20)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/)
    .required(),

  confirmPassword: Joi.any().valid(Joi.ref("newPassword")).required().messages({
    "any.only": "Passwords do not match",
  }),
});

module.exports = changePasswordSchema;
