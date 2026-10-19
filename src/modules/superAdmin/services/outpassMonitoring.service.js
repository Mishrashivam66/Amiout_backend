"use strict";

const mongoose = require("mongoose");

const Outpass = require("../../outpass/models/Outpass");
const Admin = require("../../auth/models/Admin");
const User = require("../../auth/models/User");
const Mentor = require("../../auth/models/Mentor");
const Security = require("../../auth/models/SecurityTemp");

const error = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const clean = (value) => (typeof value === "string" ? value.trim() : "");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getId = (value) =>
  value?._id ? String(value._id) : value ? String(value) : null;

const parentStatuses = ["PENDING", "APPROVED", "REJECTED"];
const authorityRoles = ["MENTOR", "BACKUP_MENTOR", "COORDINATOR", "HOD", "HOI"];

const supportedStatuses = Outpass.schema.path("status").enumValues;

async function requireSuperAdmin(actorId) {
  if (!mongoose.isValidObjectId(actorId)) {
    throw error("Authentication required.", 401);
  }

  const actor = await Admin.findOne({
    _id: actorId,
    role: "SUPER_ADMIN",
    isVerified: true,
    isActive: true,
  }).select("_id mustChangePassword");

  if (!actor) {
    throw error("Super Admin access required.", 403);
  }

  if (actor.mustChangePassword) {
    throw error("Change your temporary password first.", 403);
  }
}

function istDate(value, endExclusive = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw error("Date must use YYYY-MM-DD.");
  }

  const parsed = new Date(`${value}T00:00:00+05:30`);

  if (
    !Number.isFinite(parsed.getTime()) ||
    new Date(parsed.getTime() + 330 * 60000).toISOString().slice(0, 10) !==
      value
  ) {
    throw error("Invalid report date.");
  }

  return endExclusive ? new Date(parsed.getTime() + 86400000) : parsed;
}

function buildFilter(query = {}) {
  const filter = { isDeleted: false };
  const search = clean(query.search);

  if (search) {
    if (search.length > 80) {
      throw error("Search is too long.");
    }

    const pattern = new RegExp(escapeRegex(search), "i");

    filter.$or = [
      { outpassId: pattern },
      { studentName: pattern },
      { enrollmentNumber: pattern },
      { destination: pattern },
    ];
  }

  const status = clean(query.status).toUpperCase();
  if (status) {
    if (!supportedStatuses.includes(status)) {
      throw error("Invalid outpass status.");
    }
    filter.status = status;
  }

  const parentStatus = clean(query.parentStatus).toUpperCase();

  if (parentStatus) {
    if (!parentStatuses.includes(parentStatus)) {
      throw error("Invalid parent status.");
    }
    filter["parentDecision.status"] = parentStatus;
  }

  const approvalRole = clean(query.approvalRole).toUpperCase();

  if (approvalRole) {
    if (!authorityRoles.includes(approvalRole)) {
      throw error("Invalid faculty authority role.");
    }
    filter.approvedAuthorityRole = approvalRole;
  }

  const bypass = clean(query.bypass).toUpperCase();

  if (bypass) {
    if (!["YES", "NO"].includes(bypass)) {
      throw error("Invalid bypass filter.");
    }
    filter["approvalBypass.used"] = bypass === "YES";
  }

  const pendingBypass = clean(query.pendingBypass).toUpperCase();

  if (pendingBypass) {
    if (pendingBypass !== "YES") {
      throw error("Invalid parent-pending bypass filter.");
    }

    filter["parentDecision.status"] = "PENDING";
    filter["approvalBypass.used"] = true;
    filter["parentConsentAcknowledgement.parentStatusAtApproval"] = "PENDING";
  }

  for (const field of ["academicInstitute", "academicProgram"]) {
    const value = clean(query[field]);
    if (!value) continue;

    if (!mongoose.isValidObjectId(value)) {
      throw error(`Invalid ${field}.`);
    }

    filter[field] = new mongoose.Types.ObjectId(value);
  }

  const guardId = clean(query.guardId);

  if (guardId) {
    if (!mongoose.isValidObjectId(guardId)) {
      throw error("Invalid Security Guard ID.");
    }

    const id = new mongoose.Types.ObjectId(guardId);
    filter.$and = [
      ...(filter.$and || []),
      {
        $or: [{ exitVerifiedBy: id }, { entryVerifiedBy: id }],
      },
    ];
  }

  const from = clean(query.from);
  const to = clean(query.to);

  if (from || to) {
    filter.outDate = {};

    if (from) {
      filter.outDate.$gte = istDate(from);
    }

    if (to) {
      filter.outDate.$lt = istDate(to, true);
    }

    if (from && to && filter.outDate.$gte >= filter.outDate.$lt) {
      throw error("End date must not precede start date.");
    }
  }

  return filter;
}

// ============================================================
// RESOLVE PERSON IDENTITIES
//
// Security guard references in Outpass may point to
// SecurityTemp accounts despite their legacy ref: "User".
// Query each model explicitly, not via incorrect populate.
// ============================================================

async function resolvePeople(records) {
  const ids = new Set();

  const collect = (value) => {
    const id = getId(value);
    if (id && mongoose.isValidObjectId(id)) ids.add(id);
  };

  for (const o of records) {
    [
      o.student,
      o.mentor,
      o.assignedFaculty,
      o.approvedByFaculty,
      o.rejectedByFaculty,
      o.exitVerifiedBy,
      o.entryVerifiedBy,
      o.approvalBypass?.performedBy,
      o.parentConsentAcknowledgement?.acknowledgedBy,
      o.parentDecision?.verifiedByFaculty,
    ].forEach(collect);

    for (const h of o.assignmentHistory || []) {
      [h.fromFaculty, h.toFaculty, h.transferredBy].forEach(collect);
    }

    for (const t of o.timeline || []) {
      collect(t.performedBy);
    }
  }

  const objectIds = [...ids].map((id) => new mongoose.Types.ObjectId(id));

  if (!objectIds.length) return new Map();

  const [users, faculty, guards] = await Promise.all([
    User.find({ _id: { $in: objectIds } })
      .select("name email enrollmentNo")
      .lean(),

    Mentor.find({ _id: { $in: objectIds } })
      .select("name email employeeId mentorEmail")
      .lean(),

    Security.find({ _id: { $in: objectIds } })
      .select("name email employeeId assignedGate")
      .lean(),
  ]);

  const people = new Map();

  for (const [type, rows] of [
    ["STUDENT", users],
    ["FACULTY", faculty],
    ["SECURITY", guards],
  ]) {
    for (const person of rows) {
      people.set(String(person._id), {
        id: String(person._id),
        name: person.name || null,
        email: person.email || person.mentorEmail || null,
        type,
        employeeId: person.employeeId || null,
      });
    }
  }

  return people;
}

function identity(id, people) {
  const value = getId(id);
  if (!value) return null;

  return (
    people.get(value) || {
      id: value,
      name: null,
      email: null,
      type: "UNRESOLVED",
    }
  );
}

function label(record) {
  if (!record) return null;

  return {
    id: getId(record),
    name:
      record.name ||
      record.instituteName ||
      record.programName ||
      record.shortName ||
      record.code ||
      null,
  };
}

function maskMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 4 ? `XXXXXX${digits.slice(-4)}` : null;
}

function serialize(o, people) {
  const parent = o.parentDecision || {};
  const acknowledgement = o.parentConsentAcknowledgement || {};
  const bypass = o.approvalBypass || {};

  const pendingBypass =
    parent.status === "PENDING" &&
    bypass.used === true &&
    acknowledgement.parentStatusAtApproval === "PENDING";

  const anomalies = [];

  if (o.exitVerified && !o.exitVerifiedAt) {
    anomalies.push("EXIT_TIMESTAMP_MISSING");
  }

  if (o.entryVerified && !o.entryVerifiedAt) {
    anomalies.push("ENTRY_TIMESTAMP_MISSING");
  }

  if (o.entryVerified && !o.exitVerified) {
    anomalies.push("ENTRY_WITHOUT_EXIT");
  }

  if (o.status === "RETURNED" && !o.entryVerified) {
    anomalies.push("RETURNED_WITHOUT_ENTRY_CONFIRMATION");
  }

  return {
    id: String(o._id),
    outpassId: o.outpassId,
    status: o.status,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,

    student: {
      name: o.studentName,
      enrollmentNumber: o.enrollmentNumber,
      course: o.course,
      branch: o.branch,
      semester: o.semester,
      section: o.section,
      group: o.group,
    },

    academic: {
      institute: label(o.academicInstitute),
      program: label(o.academicProgram),
      department: o.academicDepartment || null,
      batch: o.academicBatch || null,
    },

    request: {
      reason: o.reason,
      destination: o.destination,
      outDate: o.outDate,
      outTime: o.outTime,
      inTime: o.inTime,
      dayIST: o.outpassDayIST,
      dailyTripNumber: o.dailyTripNumber,
      cancelledAt: o.cancelledAt,
      cancelledReason: o.cancelledReason,
    },

    parent: {
      name: o.parentName,
      mobileMasked: maskMobile(o.parentMobileNumber),
      status: parent.status || "PENDING",
      method: parent.method || null,
      decidedAt: parent.decidedAt || null,
      smsStatus: o.parentSMSStatus,
      smsSentAt: o.parentSMSSentAt,
      callOutcome: parent.callOutcome || null,
      callRemarks: parent.callRemarks || null,
      callVerifiedAt: parent.callVerifiedAt || null,
      verifiedBy: identity(parent.verifiedByFaculty, people),
    },

    faculty: {
      assignedRole: o.assignedRole || null,
      assignedTo: identity(o.assignedFaculty, people),
      approvedRole: o.approvedAuthorityRole || null,
      approvedBy: identity(o.approvedByFaculty, people),
      approvedAt: o.approvedAt || null,
      approvalRemark: o.approvalRemark || null,
      rejectedRole: o.rejectedAuthorityRole || null,
      rejectedBy: identity(o.rejectedByFaculty, people),
      rejectedAt: o.rejectedAt || null,
      rejectionRemark: o.rejectionRemark || null,
    },

    bypass: {
      used: bypass.used === true,
      parentPendingBypass: pendingBypass,
      authorityRole: bypass.authorityRole || null,
      performedBy: identity(bypass.performedBy, people),
      bypassedRoles: bypass.bypassedRoles || [],
      reason: bypass.reason || null,
      performedAt: bypass.performedAt || null,
      parentStatusAtApproval: acknowledgement.parentStatusAtApproval || null,
      acknowledgedBy: identity(acknowledgement.acknowledgedBy, people),
      acknowledgedRole: acknowledgement.acknowledgedRole || null,
      acknowledgementRemark: acknowledgement.remark || null,
      acknowledgedAt: acknowledgement.acknowledgedAt || null,
    },

    qr: {
      generated: o.qrGenerated === true,
      generatedAt: o.qrGeneratedAt || null,
      validFrom: o.qrValidFrom || null,
      expiresAt: o.qrExpiresAt || null,
      revokedAt: o.qrRevokedAt || null,
    },

    security: {
      exitVerified: o.exitVerified === true,
      exitVerifiedAt: o.exitVerifiedAt || null,
      exitGuard: identity(o.exitVerifiedBy, people),
      entryVerified: o.entryVerified === true,
      entryVerifiedAt: o.entryVerifiedAt || null,
      entryGuard: identity(o.entryVerifiedBy, people),
      // Gate at time of scan is not present
      // in this Outpass schema.
      gateAtExit: null,
      gateAtEntry: null,
    },

    assignmentHistory: (o.assignmentHistory || []).map((item) => ({
      fromRole: item.fromRole,
      toRole: item.toRole,
      fromFaculty: identity(item.fromFaculty, people),
      toFaculty: identity(item.toFaculty, people),
      reason: item.reason,
      remarks: item.remarks,
      transferredAt: item.transferredAt,
      transferredBy: identity(item.transferredBy, people),
    })),

    timeline: (o.timeline || []).map((item) => ({
      event: item.event,
      title: item.title,
      description: item.description,
      performedAt: item.performedAt,
      performedBy: identity(item.performedBy, people),
    })),

    anomalies,
  };
}

const population = [
  {
    path: "academicInstitute",
    select: "name instituteName shortName code",
  },
  {
    path: "academicProgram",
    select: "name programName shortName code",
  },
];

async function getSummary(filter) {
  const result = await Outpass.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: {
          $sum: {
            $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0],
          },
        },
        approved: {
          $sum: {
            $cond: [{ $eq: ["$status", "APPROVED"] }, 1, 0],
          },
        },
        outside: {
          $sum: {
            $cond: [{ $eq: ["$status", "EXITED"] }, 1, 0],
          },
        },
        returned: {
          $sum: {
            $cond: [{ $eq: ["$status", "RETURNED"] }, 1, 0],
          },
        },
        rejected: {
          $sum: {
            $cond: [{ $eq: ["$status", "REJECTED"] }, 1, 0],
          },
        },
        parentPending: {
          $sum: {
            $cond: [{ $eq: ["$parentDecision.status", "PENDING"] }, 1, 0],
          },
        },
        bypassUsed: {
          $sum: {
            $cond: [{ $eq: ["$approvalBypass.used", true] }, 1, 0],
          },
        },
        pendingBypass: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$parentDecision.status", "PENDING"] },
                  { $eq: ["$approvalBypass.used", true] },
                  {
                    $eq: [
                      "$parentConsentAcknowledgement.parentStatusAtApproval",
                      "PENDING",
                    ],
                  },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  return (
    result[0] || {
      total: 0,
      pending: 0,
      approved: 0,
      outside: 0,
      returned: 0,
      rejected: 0,
      parentPending: 0,
      bypassUsed: 0,
      pendingBypass: 0,
    }
  );
}

async function listOutpasses(actorId, query = {}) {
  await requireSuperAdmin(actorId);

  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(query.page, 10) || 1),
  );

  const limit = Math.max(
    1,
    Math.min(50, Number.parseInt(query.limit, 10) || 10),
  );

  const filter = buildFilter(query);

  const [summary, records] = await Promise.all([
    getSummary(filter),
    Outpass.find(filter)
      .populate(population)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const people = await resolvePeople(records);

  return {
    outpasses: records.map((o) => serialize(o, people)),
    summary,
    pagination: {
      page,
      limit,
      total: summary.total,
      totalPages: Math.ceil(summary.total / limit),
      hasPreviousPage: page > 1,
      hasNextPage: page * limit < summary.total,
    },
  };
}

async function getOutpass(actorId, id) {
  await requireSuperAdmin(actorId);

  if (!mongoose.isValidObjectId(id)) {
    throw error("Invalid Outpass ID.");
  }

  const record = await Outpass.findOne({
    _id: id,
    isDeleted: false,
  })
    .populate(population)
    .lean();

  if (!record) throw error("Outpass not found.", 404);

  const people = await resolvePeople([record]);
  return serialize(record, people);
}

// ============================================================
// REPORT DATA
//
// Uses exactly the same filters as the monitoring screen.
// Exports are bounded to avoid massive memory usage.
// ============================================================

async function getReportRecords(actorId, query = {}, maxRecords = 2500) {
  await requireSuperAdmin(actorId);

  const filter = buildFilter(query);

  const count = await Outpass.countDocuments(filter);

  if (count > maxRecords) {
    throw error(
      `This report contains ${count} records. Narrow the filters to at most ${maxRecords} records.`,
      413,
    );
  }

  const records = await Outpass.find(filter)
    .populate(population)
    .sort({ createdAt: -1, _id: -1 })
    .limit(maxRecords)
    .lean();

  const people = await resolvePeople(records);

  return {
    records: records.map((o) => serialize(o, people)),
    summary: await getSummary(filter),
  };
}

async function getFilterOptions(actorId) {
  await requireSuperAdmin(actorId);

  const base = { isDeleted: false };

  const [instituteIds, programIds] = await Promise.all([
    Outpass.distinct("academicInstitute", base),
    Outpass.distinct("academicProgram", base),
  ]);

  const db = mongoose.connection.db;

  const [institutes, programs] = await Promise.all([
    db
      .collection("institutes")
      .find({ _id: { $in: instituteIds.filter(Boolean) } })
      .project({ name: 1, instituteName: 1, shortName: 1, code: 1 })
      .toArray(),

    db
      .collection("programs")
      .find({ _id: { $in: programIds.filter(Boolean) } })
      .project({ name: 1, programName: 1, shortName: 1, code: 1 })
      .toArray(),
  ]);

  const options = (records) =>
    records
      .map((item) => ({
        value: String(item._id),
        label:
          item.name ||
          item.instituteName ||
          item.programName ||
          item.shortName ||
          item.code ||
          String(item._id),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

  return {
    statuses: supportedStatuses,
    authorityRoles,
    institutes: options(institutes),
    programs: options(programs),
  };
}

module.exports = Object.freeze({
  listOutpasses,
  getOutpass,
  getReportRecords,
  getFilterOptions,
});
