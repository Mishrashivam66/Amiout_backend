const validator = require("validator");

const validateProfile = (data = {}) => {
  const errors = [];

  // ============================================================================
  // Parent Name
  // ============================================================================
  if (!data.parentName || typeof data.parentName !== "string") {
    errors.push("Parent name is required.");
  } else {
    const parentName = data.parentName.trim();

    if (parentName.length < 3) {
      errors.push("Parent name must be at least 3 characters.");
    }

    if (parentName.length > 100) {
      errors.push("Parent name cannot exceed 100 characters.");
    }
  }

  // ============================================================================
  // Parent Email
  // ============================================================================
  if (!data.parentEmail) {
    errors.push("Parent email is required.");
  } else {
    const parentEmail = data.parentEmail.trim().toLowerCase();

    if (!validator.isEmail(parentEmail)) {
      errors.push("Invalid parent email address.");
    }
  }

  // ============================================================================
  // Parent Mobile Number
  // ============================================================================
  if (!data.parentMobileNumber) {
    errors.push("Parent mobile number is required.");
  } else {
    const mobile = data.parentMobileNumber.toString().trim();

    if (!validator.isMobilePhone(mobile, "en-IN")) {
      errors.push("Invalid Indian mobile number.");
    }
  }

  // ============================================================================
  // Validation Result
  // ============================================================================
  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateProfile,
};
