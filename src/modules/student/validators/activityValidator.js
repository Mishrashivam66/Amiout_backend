
const validateActivity = (data = {}) => {
  const errors = [];

  if (!data.title || typeof data.title !== "string") {
    errors.push("Activity title is required.");
  } else if (data.title.trim().length < 3) {
    errors.push("Activity title must be at least 3 characters.");
  }

  if (!data.description || typeof data.description !== "string") {
    errors.push("Activity description is required.");
  } else if (data.description.trim().length < 5) {
    errors.push("Activity description must be at least 5 characters.");
  }

  if (!data.type || typeof data.type !== "string") {
    errors.push("Activity type is required.");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateActivity,
};
