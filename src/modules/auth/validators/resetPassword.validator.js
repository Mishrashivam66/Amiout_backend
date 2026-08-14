const Joi = require("joi");

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),

  password: Joi.string()
    .min(8)
    .max(20)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/)
    .required(),

  confirmPassword: Joi.any().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords do not match",
  }),
});

module.exports = resetPasswordSchema;
