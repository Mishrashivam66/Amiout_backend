
const APPLICATION_WINDOW = Object.freeze({
  START_HOUR: 10,
  START_MINUTE: 0,

  END_HOUR: 14,
  END_MINUTE: 0,
});

// ============================================================================
// Allowed Out Time Slots
// ============================================================================
const OUT_TIME_SLOTS = Object.freeze([
  {
    label: "10:00 AM",
    value: "10:00 AM",
    hour: 10,
  },
  {
    label: "11:00 AM",
    value: "11:00 AM",
    hour: 11,
  },
  {
    label: "12:00 PM",
    value: "12:00 PM",
    hour: 12,
  },
  {
    label: "01:00 PM",
    value: "01:00 PM",
    hour: 13,
  },
  {
    label: "02:00 PM",
    value: "02:00 PM",
    hour: 14,
  },
]);

// ============================================================================
// Expected Return Options
// ============================================================================
const EXPECTED_RETURN_OPTIONS = Object.freeze([
  {
    label: "10:00 AM",
    value: "10:00 AM",
  },
  {
    label: "11:00 AM",
    value: "11:00 AM",
  },
  {
    label: "12:00 PM",
    value: "12:00 PM",
  },
  {
    label: "01:00 PM",
    value: "01:00 PM",
  },
  {
    label: "02:00 PM",
    value: "02:00 PM",
  },
  {
    label: "Home (Will Not Return Today)",
    value: "HOME",
  },
]);

// ============================================================================
// Non Working Days
// ============================================================================
const NON_WORKING_DAYS = Object.freeze(["SUNDAY"]);


const WORKING_DAYS = Object.freeze([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
]);

module.exports = Object.freeze({
  APPLICATION_WINDOW,
  OUT_TIME_SLOTS,
  EXPECTED_RETURN_OPTIONS,
  NON_WORKING_DAYS,
  WORKING_DAYS,
});
