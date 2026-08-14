"use strict";
const extractRows = (text = "") => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = [];
  const studentRegex = /^\d+[A-Z]/;
  const groupRegex = /^[A-Z]\s*-\s*\d+/;

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];

    if (!studentRegex.test(current)) {
      continue;
    }

    let groupLine = "";

    if (i + 1 < lines.length && groupRegex.test(lines[i + 1])) {
      groupLine = lines[i + 1];

      i++;
    }

    rows.push({
      studentLine: current,

      groupLine,
    });
  }

  return rows;
};

// ============================================================================
// Parse Student Row
// ============================================================================

const parseRow = (row = {}) => {
  const line = row.studentLine;
  const enrollmentMatch = line.match(/A\d{11}$/);

  if (!enrollmentMatch) {
    return null;
  }

  const enrollmentNumber = enrollmentMatch[0];

  let remaining = line.replace(enrollmentNumber, "");
  const rollMatch = remaining.match(/A\d{11}$/);

  if (!rollMatch) {
    return null;
  }

  const rollNumber = rollMatch[0];

  remaining = remaining.replace(rollNumber, "");
  const serialMatch = remaining.match(/^\d+/);

  if (!serialMatch) {
    return null;
  }

  const serialNo = Number(serialMatch[0]);

  remaining = remaining.replace(serialMatch[0], "");
  const section = remaining.slice(-1);
  const name = remaining.slice(0, -1).trim();
  let primaryGroup = "";

  let secondaryGroup = "";

  let assignedGroup = "";

  if (row.groupLine) {
    const groups = row.groupLine.match(/[A-Z]\s*-\s*\d+/g);

    if (groups?.length >= 2) {
      primaryGroup = groups[0].replace(/\s+/g, "");

      secondaryGroup = groups[1].replace(/\s+/g, "");
    }

    if (/No Group/i.test(row.groupLine)) {
      assignedGroup = "No Group";
    } else if (groups?.length === 3) {
      assignedGroup = groups[2].replace(/\s+/g, "");
    }
  }

  return {
    serialNo,

    name,

    section,

    rollNumber,

    enrollmentNumber,

    primaryGroup,

    secondaryGroup,

    assignedGroup,
  };
};

// ============================================================================
// Extract Students
// ============================================================================

const extractStudents = (text = "") => {
  const rows = extractRows(text);

  const students = [];

  for (const row of rows) {
    const student = parseRow(row);

    if (student) {
      students.push(student);
    }
  }

  return students;
};

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  extractRows,

  parseRow,

  extractStudents,
});
