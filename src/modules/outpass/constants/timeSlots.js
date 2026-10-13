"use strict";

// ============================================================
// AMIOUT - OUTPASS TIME CONFIGURATION
// All timings follow Indian Standard Time (IST).
// ============================================================

// University outpass operating window.
const APPLICATION_WINDOW = Object.freeze({
  START_HOUR: 9,
  START_MINUTE: 15,

  END_HOUR: 17,
  END_MINUTE: 15,
});

// Time between consecutive outpass slots.
const SLOT_INTERVAL_MINUTES = 10;

// ============================================================
// FORMAT TIME (24-HOUR MINUTES TO 12-HOUR STRING)
// ============================================================

const formatTime = (totalMinutes) => {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return (
    `${String(hour12).padStart(2, "0")}:` +
    `${String(minute).padStart(2, "0")} ${period}`
  );
};

// ============================================================
// GENERATE OUT TIME SLOTS
// From 09:15 AM every 10 minutes.
// Last usable slot is 05:05 PM.
// Gate QR expires at 05:15 PM.
// ============================================================

const startMinutes =
  APPLICATION_WINDOW.START_HOUR * 60 + APPLICATION_WINDOW.START_MINUTE;

const endMinutes =
  APPLICATION_WINDOW.END_HOUR * 60 + APPLICATION_WINDOW.END_MINUTE;

const generatedSlots = [];

for (
  let minutes = startMinutes;
  minutes < endMinutes;
  minutes += SLOT_INTERVAL_MINUTES
) {
  generatedSlots.push(
    Object.freeze({
      label: formatTime(minutes),
      value: formatTime(minutes),

      // Preserve hour for existing consumers.
      hour: Math.floor(minutes / 60),

      // Additional precision for 10-min slots.
      minute: minutes % 60,
      totalMinutes: minutes,
    }),
  );
}

const OUT_TIME_SLOTS = Object.freeze(generatedSlots);

// ============================================================
// EXPECTED RETURN OPTIONS
// Kept only for backward compatibility.
// Day scholar return is not mandatory.
// ============================================================

const EXPECTED_RETURN_OPTIONS = Object.freeze([
  ...OUT_TIME_SLOTS.map((slot) =>
    Object.freeze({
      label: slot.label,
      value: slot.value,
    }),
  ),

  Object.freeze({
    label: "Home (Return Not Required)",
    value: "HOME",
  }),
]);

// ============================================================
// NON-WORKING DAYS
// ============================================================

const NON_WORKING_DAYS = Object.freeze(["SUNDAY"]);

// Existing project working-day configuration.
const WORKING_DAYS = Object.freeze([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
]);

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  APPLICATION_WINDOW,
  SLOT_INTERVAL_MINUTES,
  OUT_TIME_SLOTS,
  EXPECTED_RETURN_OPTIONS,
  NON_WORKING_DAYS,
  WORKING_DAYS,
});
