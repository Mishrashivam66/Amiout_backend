"use strict";

const StudentMaster = require("../../academic/models/StudentMaster");

const MentorMaster = require("../../academic/models/MentorMaster");

const User = require("../../auth/models/User");
const Mentor = require("../../auth/models/Mentor");

const CredentialDispatch = require("../models/CredentialDispatch");

const VALID_TYPES = ["STUDENT", "FACULTY"];

const VALID_STATUSES = [
  "ALL",
  "NOT_SENT",
  "SENT",
  "FAILED",
  "SENDING",
  "EXISTING_ACCOUNT",
  "INCOMPLETE",
];

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const upper = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizedField = (field) => ({
  $toLower: {
    $trim: {
      input: {
        $ifNull: [`$${field}`, ""],
      },
    },
  },
});

// ============================================================
// STUDENT BASE PIPELINE
// ============================================================

const getStudentPipeline = () => [
  {
    $match: {
      isActive: true,
      isDeleted: false,
    },
  },
  {
    $project: {
      _id: 1,
      name: 1,

      email: normalizedField("email"),

      enrollmentNumber: {
        $ifNull: ["$enrollmentNumber", ""],
      },

      mobileNumber: {
        $ifNull: ["$mobileNumber", ""],
      },

      facultyId: {
        $literal: "",
      },

      roles: {
        $literal: ["STUDENT"],
      },
    },
  },
];

// ============================================================
// FACULTY BASE PIPELINE
// ============================================================

const getFacultyPipeline = () => [
  {
    $match: {
      isActive: true,
      isDeleted: false,
    },
  },
  {
    $project: {
      _id: 1,
      name: 1,

      email: normalizedField("mentorEmail"),

      facultyId: {
        $ifNull: ["$facultyId", ""],
      },

      enrollmentNumber: {
        $literal: "",
      },

      mobileNumber: {
        $literal: "",
      },

      roles: {
        $ifNull: ["$roles", []],
      },
    },
  },
  {
    $sort: {
      _id: 1,
    },
  },
  {
    $group: {
      // Multiple records for the same faculty email
      // are grouped into one credential candidate.
      // Blank emails stay as separate records.

      _id: {
        $cond: [{ $ne: ["$email", ""] }, "$email", { $toString: "$_id" }],
      },

      masterId: { $first: "$_id" },
      name: { $first: "$name" },
      email: { $first: "$email" },

      facultyId: { $first: "$facultyId" },

      enrollmentNumber: {
        $first: "$enrollmentNumber",
      },

      mobileNumber: {
        $first: "$mobileNumber",
      },

      rolesArrays: {
        $push: "$roles",
      },
    },
  },
  {
    $project: {
      _id: "$masterId",
      name: 1,
      email: 1,
      facultyId: 1,
      enrollmentNumber: 1,
      mobileNumber: 1,

      roles: {
        $reduce: {
          input: "$rolesArrays",
          initialValue: [],
          in: {
            $setUnion: ["$$value", "$$this"],
          },
        },
      },
    },
  },
];

// ============================================================
// JOIN EXISTING DELIVERY RECORDS
// ============================================================

const getDispatchLookup = (accountType) => ({
  $lookup: {
    from: CredentialDispatch.collection.name,

    let: {
      candidateEmail: "$email",
    },

    pipeline: [
      {
        $match: {
          accountType,

          $expr: {
            $eq: ["$email", "$$candidateEmail"],
          },
        },
      },
      {
        $project: {
          _id: 1,
          accountId: 1,
          status: 1,
          sentAt: 1,
          lastError: 1,
          attempts: 1,
        },
      },
      {
        $limit: 1,
      },
    ],

    as: "dispatchRecords",
  },
});

// ============================================================
// CHECK EXISTING AUTH ACCOUNTS
// ============================================================

const getAccountLookup = (accountType) => {
  const collection =
    accountType === "STUDENT" ? User.collection.name : Mentor.collection.name;

  const identityField =
    accountType === "STUDENT" ? "enrollmentNo" : "employeeId";

  const candidateIdentity =
    accountType === "STUDENT" ? "$enrollmentNumber" : "$facultyId";

  return {
    $lookup: {
      from: collection,

      let: {
        candidateEmail: "$email",
        candidateIdentity,
      },

      pipeline: [
        {
          $match: {
            $expr: {
              $or: [
                {
                  $and: [
                    {
                      $ne: ["$$candidateEmail", ""],
                    },
                    {
                      $eq: ["$email", "$$candidateEmail"],
                    },
                  ],
                },
                {
                  $and: [
                    {
                      $ne: ["$$candidateIdentity", ""],
                    },
                    {
                      $eq: [`$${identityField}`, "$$candidateIdentity"],
                    },
                  ],
                },
              ],
            },
          },
        },
        {
          $project: {
            _id: 1,
            isActive: 1,
            mustChangePassword: 1,
            lastLogin: 1,
          },
        },
        {
          $limit: 2,
        },
      ],

      as: "accountRecords",
    },
  };
};

// ============================================================
// RESOLVE CREDENTIAL STATUS
// ============================================================

const getStatusPipeline = (accountType) => [
  getDispatchLookup(accountType),
  getAccountLookup(accountType),

  {
    $addFields: {
      dispatch: {
        $arrayElemAt: ["$dispatchRecords", 0],
      },

      existingAccount: {
        $arrayElemAt: ["$accountRecords", 0],
      },

      existingCount: {
        $size: "$accountRecords",
      },
    },
  },

  {
    $addFields: {
      incomplete: {
        $or: [
          { $eq: ["$email", ""] },

          ...(accountType === "STUDENT"
            ? [
                {
                  $eq: ["$enrollmentNumber", ""],
                },
                {
                  $eq: ["$mobileNumber", ""],
                },
              ]
            : [
                {
                  $eq: ["$facultyId", ""],
                },
                {
                  $eq: [
                    {
                      $size: "$roles",
                    },
                    0,
                  ],
                },
              ]),
        ],
      },

      retryableExistingAccount: {
        $and: [
          {
            $in: ["$dispatch.status", ["FAILED", "PENDING"]],
          },
          {
            $eq: ["$existingCount", 1],
          },
          {
            $eq: ["$dispatch.accountId", "$existingAccount._id"],
          },
          {
            $eq: ["$existingAccount.isActive", false],
          },
          {
            $eq: ["$existingAccount.mustChangePassword", true],
          },
          {
            $eq: [
              {
                $ifNull: ["$existingAccount.lastLogin", null],
              },
              null,
            ],
          },
        ],
      },
    },
  },

  {
    $addFields: {
      status: {
        $switch: {
          branches: [
            {
              case: {
                $eq: ["$dispatch.status", "SENT"],
              },
              then: "SENT",
            },
            {
              case: {
                $eq: ["$dispatch.status", "SENDING"],
              },
              then: "SENDING",
            },
            {
              case: {
                $gt: ["$existingCount", 1],
              },
              then: "EXISTING_ACCOUNT",
            },
            {
              case: {
                $and: [
                  {
                    $gt: ["$existingCount", 0],
                  },
                  {
                    $not: ["$retryableExistingAccount"],
                  },
                ],
              },
              then: "EXISTING_ACCOUNT",
            },
            {
              case: "$incomplete",
              then: "INCOMPLETE",
            },
            {
              case: {
                $eq: ["$dispatch.status", "FAILED"],
              },
              then: "FAILED",
            },
          ],

          default: "NOT_SENT",
        },
      },
    },
  },

  {
    $addFields: {
      canSend: {
        $in: ["$status", ["NOT_SENT", "FAILED"]],
      },
    },
  },

  {
    $project: {
      _id: 1,
      name: 1,
      email: 1,
      enrollmentNumber: 1,
      facultyId: 1,
      roles: 1,
      status: 1,
      canSend: 1,

      attempts: {
        $ifNull: ["$dispatch.attempts", 0],
      },

      sentAt: {
        $ifNull: ["$dispatch.sentAt", null],
      },

      lastError: {
        $ifNull: ["$dispatch.lastError", ""],
      },
    },
  },
];

// ============================================================
// LIST CREDENTIAL CANDIDATES
// ============================================================

const getCredentialCandidates = async (options = {}) => {
  const accountType = upper(options.type || "STUDENT");

  const status = upper(options.status || "NOT_SENT");

  if (!VALID_TYPES.includes(accountType)) {
    fail("Invalid account type.");
  }

  if (!VALID_STATUSES.includes(status)) {
    fail("Invalid credential status filter.");
  }

  const page = Math.min(100000, Math.max(1, Number(options.page) || 1));

  const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));

  const search = String(options.search || "")
    .trim()
    .slice(0, 80);

  const Model = accountType === "STUDENT" ? StudentMaster : MentorMaster;

  const basePipeline =
    accountType === "STUDENT" ? getStudentPipeline() : getFacultyPipeline();

  const searchMatch = search
    ? {
        $or: [
          {
            name: {
              $regex: escapeRegex(search),
              $options: "i",
            },
          },
          {
            email: {
              $regex: escapeRegex(search),
              $options: "i",
            },
          },
          {
            enrollmentNumber: {
              $regex: escapeRegex(search),
              $options: "i",
            },
          },
          {
            facultyId: {
              $regex: escapeRegex(search),
              $options: "i",
            },
          },
          {
            roles: {
              $regex: escapeRegex(search),
              $options: "i",
            },
          },
        ],
      }
    : {};

  const filterMatch = {
    ...(search ? searchMatch : {}),

    ...(status !== "ALL" ? { status } : {}),
  };

  const pipeline = [
    ...basePipeline,
    ...getStatusPipeline(accountType),

    {
      $facet: {
        // Global counts for the selected
        // account type, independent of search.

        summary: [
          {
            $group: {
              _id: "$status",
              count: {
                $sum: 1,
              },
            },
          },
        ],

        filteredTotal: [
          {
            $match: filterMatch,
          },
          {
            $count: "value",
          },
        ],

        items: [
          {
            $match: filterMatch,
          },
          {
            $sort: {
              name: 1,
              _id: 1,
            },
          },
          {
            $skip: (page - 1) * limit,
          },
          {
            $limit: limit,
          },
        ],
      },
    },
  ];

  const [result = {}] = await Model.aggregate(pipeline).allowDiskUse(true);

  const summary = {
    total: 0,
    sent: 0,
    notSent: 0,
    failed: 0,
    sending: 0,
    existingAccount: 0,
    incomplete: 0,
  };

  for (const item of result.summary || []) {
    const count = Number(item.count) || 0;

    summary.total += count;

    switch (item._id) {
      case "SENT":
        summary.sent = count;
        break;

      case "NOT_SENT":
        summary.notSent = count;
        break;

      case "FAILED":
        summary.failed = count;
        break;

      case "SENDING":
        summary.sending = count;
        break;

      case "EXISTING_ACCOUNT":
        summary.existingAccount = count;
        break;

      case "INCOMPLETE":
        summary.incomplete = count;
        break;

      default:
        break;
    }
  }

  const total = Number(result.filteredTotal?.[0]?.value || 0);

  return {
    accountType,
    filter: status,
    search,
    summary,

    items: result.items || [],

    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    },
  };
};

module.exports = Object.freeze({
  getCredentialCandidates,
});
