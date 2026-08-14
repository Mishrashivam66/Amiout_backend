"use strict";

const semesterMap = {
  "I Semester": 1,
  "II Semester": 2,
  "III Semester": 3,
  "IV Semester": 4,
  "V Semester": 5,
  "VI Semester": 6,
  "VII Semester": 7,
  "VIII Semester": 8,
};

const mapMentorRows = (rows = []) => {
  const mapped = rows.map((row) => ({
    mentorName: row["name of mentor"]?.trim() || "",

    course: row["course name"]?.trim() || "",

    semester:
      semesterMap[row["semester"]?.trim()] ?? Number(row["semester"]) ?? null,

    group: row["group (as per amizone)"]?.trim().toUpperCase() || "",

    coordinator: row["name of class coordinator"]?.trim() || "",

    totalStudents:
      Number(row["total no. of students"] || row["no.of students"]) || 0,
  }));

  console.table(mapped);

  return mapped;
};

module.exports = Object.freeze({
  mapMentorRows,
});
