"use strict";

const extractStudents = (text = "") => {
  const students = [];
  const startIndex = text.indexOf("SNo.Student Name");

  if (startIndex === -1) {
    return students;
  }

  let studentText = text.substring(startIndex);
  studentText = studentText
    .replace(/Submit[\s\S]*/i, "")
    .replace(/https?:\/\/[^\s]+/gi, "")
    .replace(/\d+\/\d+\/\d+.*$/gim, "")
    .replace(/groupinformation/gi, "");
  const lines = studentText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/No Group/i.test(line)) {
      continue;
    }
    const enrollmentMatch = line.match(/A\d{11}$/);

    if (!enrollmentMatch) {
      continue;
    }

    const enrollmentNumber = enrollmentMatch[0];

    let remaining = line.replace(enrollmentNumber, "");

    const rollMatch = remaining.match(/A\d{11}$/);

    if (!rollMatch) {
      continue;
    }

    const rollNumber = rollMatch[0];

    remaining = remaining.replace(rollNumber, "");
    const serialMatch = remaining.match(/^\d+/);

    if (!serialMatch) {
      continue;
    }

    const serialNo = Number(serialMatch[0]);

    remaining = remaining.replace(serialMatch[0], "");

    const section = remaining.slice(-1);

    const name = remaining.slice(0, -1).trim();

    students.push({
      serialNo,

      name,

      section,

      rollNumber,

      enrollmentNumber,
    });
  }

  return students;
};

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  extractStudents,
});
