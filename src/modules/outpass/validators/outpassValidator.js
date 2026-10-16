"use strict";

const { REASON, DESTINATION } = require("../constants/outpassConstants");

const { OUT_TIME_SLOTS, NON_WORKING_DAYS } = require("../constants/timeSlots");

// ============================================================
// IST HELPERS
// ============================================================

const getISTDayKey = (date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
};

const getISTCurrentMinutes = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return get("hour") * 60 + get("minute") + get("second") / 60;
};

const getISTWeekday = (date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
  })
    .format(date)
    .toUpperCase();

// ============================================================
// DATE PARSING
// ============================================================

const parseOutpassDate = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00+05:30`);

    if (Number.isNaN(date.getTime()) || getISTDayKey(date) !== value) {
      return null;
    }

    return {
      date,
      dayKey: value,
    };
  }

  if (typeof value !== "string" && !(value instanceof Date)) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    date,
    dayKey: getISTDayKey(date),
  };
};

// ============================================================
// TIME SLOT HELPER
// ============================================================

const getSlotMinutes = (slot) => {
  if (!slot) return null;

  if (Number.isFinite(slot.totalMinutes)) {
    return slot.totalMinutes;
  }

  if (Number.isFinite(slot.hour) && Number.isFinite(slot.minute)) {
    return slot.hour * 60 + slot.minute;
  }

  // Fallback for old slot objects.
  const match = String(slot.value || "").match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/);

  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 1 || hours > 12 || minutes > 59) {
    return null;
  }

  hours %= 12;

  if (match[3] === "PM") {
    hours += 12;
  }

  return hours * 60 + minutes;
};

// ============================================================
// VALIDATE OUTPASS REQUEST
// ============================================================

const validateOutpass = (data = {}) => {
  const errors = [];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      isValid: false,
      errors: ["Invalid outpass request."],
    };
  }

  // ==========================================================
  // 1. REASON
  // ==========================================================

  if (typeof data.reason !== "string" || !data.reason.trim()) {
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

  // ==========================================================
  // 2. DESTINATION
  // ==========================================================

  if (typeof data.destination !== "string" || !data.destination.trim()) {
    errors.push("Destination is required.");
  } else {
    const destination = data.destination.trim();

    if (destination.length < DESTINATION.MIN_LENGTH) {
      errors.push(
        `Destination must contain at least ${DESTINATION.MIN_LENGTH} characters.`,
      );
    }

    if (destination.length > DESTINATION.MAX_LENGTH) {
      errors.push(
        `Destination cannot exceed ${DESTINATION.MAX_LENGTH} characters.`,
      );
    }
  }

  // ==========================================================
  // 3. OUT DATE
  // ==========================================================

  let dateInfo = null;

  if (!data.outDate) {
    errors.push("Out date is required.");
  } else {
    dateInfo = parseOutpassDate(data.outDate);

    if (!dateInfo) {
      errors.push("Invalid out date.");
    }
  }

  const now = new Date();
  const todayIST = getISTDayKey(now);

  if (dateInfo) {
    if (dateInfo.dayKey < todayIST) {
      errors.push("Outpass cannot be requested for a past date.");
    }

    const weekday = getISTWeekday(dateInfo.date);

    if (NON_WORKING_DAYS.includes(weekday)) {
      errors.push(`Outpass is not allowed on ${weekday}.`);
    }
  }

  // ==========================================================
  // 4. OUT TIME
  // ==========================================================

  const selectedOutSlot = OUT_TIME_SLOTS.find(
    (slot) => slot.value === data.outTime,
  );

  if (!selectedOutSlot) {
    errors.push(
      "Invalid Out Time. Choose a slot between 09:15 AM and 05:05 PM.",
    );
  } else if (dateInfo && dateInfo.dayKey === todayIST) {
    const currentMinutes = getISTCurrentMinutes(now);

    const selectedMinutes = getSlotMinutes(selectedOutSlot);

    if (selectedMinutes === null || selectedMinutes <= currentMinutes) {
      errors.push(
        "The selected Out Time has already passed. Please choose a future slot.",
      );
    }
  }

  // ==========================================================
  // 5. EXPECTED IN TIME (OPTIONAL)
  // ==========================================================

  // ==========================================================
  // 5. EXPECTED IN TIME (OPTIONAL)
  // ==========================================================

  const rawInTime = data.inTime;

  if (rawInTime !== undefined && rawInTime !== null && rawInTime !== "") {
    if (typeof rawInTime !== "string") {
      errors.push("Invalid Expected In Time.");
    } else {
      const inTime = rawInTime.trim();

      const selectedInSlot = OUT_TIME_SLOTS.find(
        (slot) => slot.value === inTime,
      );

      if (!selectedInSlot) {
        errors.push("Invalid Expected In Time selected.");
      } else if (selectedOutSlot) {
        const outMinutes = getSlotMinutes(selectedOutSlot);
        const inMinutes = getSlotMinutes(selectedInSlot);

        if (outMinutes === null || inMinutes === null) {
          errors.push("Invalid time slot configuration.");
        } else if (inMinutes <= outMinutes) {
          errors.push("Expected In Time must be later than Out Time.");
        }
      }
    }
  }

  // ==========================================================
  // 6. EXPECTED RETURN (LEGACY)
  // ==========================================================

  // Expected Return is not mandatory.
  // Day scholars can leave campus without
  // returning on the same day.

  // Actual ENTRY is recorded by Security
  // through QR verification, separately.

  // ==========================================================
  // 7. TRUSTED INFORMATION
  // ==========================================================

  // Student identity, parent mobile number,
  // mentor mapping and academic information
  // come from StudentMaster, not the client.

  // No profile completion or lock is required.

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateOutpass,
};
