const { REASON, DESTINATION } = require("../constants/outpassConstants");

const {
  OUT_TIME_SLOTS,
  EXPECTED_RETURN_OPTIONS,
} = require("../constants/timeSlots");

// ============================================================================
// Validate Outpass Request
// ============================================================================
const validateOutpass = (data = {}) => {
  const errors = [];

  // ============================================================================
  // Reason Validation
  // ============================================================================

  if (!data.reason || typeof data.reason !== "string") {
    errors.push("Reason is required.");
  } else {
    const reason = data.reason.trim();

    if (reason.length < REASON.MIN_LENGTH) {
      errors.push(`Reason must be at least ${REASON.MIN_LENGTH} characters.`);
    }

    if (reason.length > REASON.MAX_LENGTH) {
      errors.push(`Reason cannot exceed ${REASON.MAX_LENGTH} characters.`);
    }
  }

  // ============================================================================
  // Destination Validation
  // ============================================================================

  if (!data.destination || typeof data.destination !== "string") {
    errors.push("Destination is required.");
  } else {
    const destination = data.destination.trim();

    if (destination.length < DESTINATION.MIN_LENGTH) {
      errors.push(
        `Destination must be at least ${DESTINATION.MIN_LENGTH} characters.`,
      );
    }

    if (destination.length > DESTINATION.MAX_LENGTH) {
      errors.push(
        `Destination cannot exceed ${DESTINATION.MAX_LENGTH} characters.`,
      );
    }
  }

  // ============================================================================
  // Out Date Validation
  // ============================================================================

  if (!data.outDate) {
    errors.push("Out date is required.");
  } else {
    const selectedDate = new Date(data.outDate);

    if (Number.isNaN(selectedDate.getTime())) {
      errors.push("Invalid out date.");
    }
  }

  // ============================================================================
  // Out Time Validation
  // ============================================================================

  const validOutTimes = OUT_TIME_SLOTS.map((slot) => slot.value);

  if (!validOutTimes.includes(data.outTime)) {
    errors.push("Invalid out time selected.");
  }

  // ============================================================================
  // Expected Return Validation
  // ============================================================================

  const validReturnOptions = EXPECTED_RETURN_OPTIONS.map(
    (option) => option.value,
  );

  if (!validReturnOptions.includes(data.expectedReturn)) {
    errors.push("Invalid expected return option.");
  }

  if (data.expectedReturn !== "HOME") {
    const outIndex = validOutTimes.indexOf(data.outTime);

    const returnIndex = validOutTimes.indexOf(data.expectedReturn);

    if (outIndex !== -1 && returnIndex !== -1 && returnIndex < outIndex) {
      errors.push("Expected return time cannot be earlier than out time.");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateOutpass,
};
