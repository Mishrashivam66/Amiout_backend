"use strict";

const mongoose = require("mongoose");

const Outpass = require("../models/Outpass");
const Mentor = require("../../auth/models/Mentor");
const StudentMaster = require("../../academic/models/StudentMaster");

const legacy = require("./legacyApproveOutpassService");

const { getAcademicContext } = require("./outpassEscalationService");

const { createQRToken, getISTDay, getValidityWindow } = require("./qrService");

const { approvedEvent } = require("../utils/timelineHelper");

const { OUTPASS_STATUS } = require("../constants/outpassStatus");

const {
  sendNotification,
} = require("../../notification/service/notificationService");

const {
  NOTIFICATION_TYPES,
} = require("../../../shared/types/notificationTypes");

const {
  NOTIFICATION_ROLES,
} = require("../../notification/constants/notificationConstants");

const failure = (message) => ({
  success: false,
  message,
});

const getId = (value) => String(value?._id || value || "");

const sameId = (a, b) => Boolean(getId(a)) && getId(a) === getId(b);

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const normalizeScope = (value) => normalize(value).replace(/\s+/g, "");

const ROLE_SCOPE_TYPES = Object.freeze({
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
});

const isCompletedTrip = (trip) => {
  if (
    trip.exitVerified !== true ||
    trip.entryVerified !== true ||
    !trip.exitVerifiedAt ||
    !trip.entryVerifiedAt
  ) {
    return false;
  }

  return (
    new Date(trip.entryVerifiedAt).getTime() >
    new Date(trip.exitVerifiedAt).getTime()
  );
};

const checkFacultyScope = (faculty, role, requiredScope, now) => {
  if (
    !faculty ||
    faculty.isActive !== true ||
    faculty.isVerified !== true ||
    faculty.availabilityStatus !== "AVAILABLE"
  ) {
    return false;
  }

  if (!faculty.hasRole(role) || !requiredScope) {
    return false;
  }

  return faculty.getActiveRoleAssignments(now).some((assignment) => {
    return (
      assignment.role === role &&
      assignment.scopeType === ROLE_SCOPE_TYPES[role] &&
      normalizeScope(assignment.scopeId) === normalizeScope(requiredScope)
    );
  });
};

const getPreviousTrips = async (outpass, dayKey, session) => {
  const dayStart = new Date(`${dayKey}T00:00:00+05:30`);

  const dayEnd = new Date(dayStart.getTime() + 86400000);

  return Outpass.find({
    student: outpass.student,
    _id: { $ne: outpass._id },
    isDeleted: false,

    $and: [
      {
        $or: [
          { outpassDayIST: dayKey },
          {
            outDate: {
              $gte: dayStart,
              $lt: dayEnd,
            },
            $or: [
              { outpassDayIST: "" },
              { outpassDayIST: null },
              {
                outpassDayIST: {
                  $exists: false,
                },
              },
            ],
          },
        ],
      },
      {
        $or: [
          { approvedAt: { $type: "date" } },
          { dailyTripNumber: { $in: [1, 2] } },
          { exitVerified: true },
        ],
      },
    ],
  })
    .sort({ approvedAt: 1 })
    .session(session);
};

const approveDirectly = async (facultyId, outpassId, remark, role) => {
  if (
    !mongoose.isValidObjectId(facultyId) ||
    !mongoose.isValidObjectId(outpassId)
  ) {
    return failure("Invalid faculty or outpass ID.");
  }

  const cleanRemark = typeof remark === "string" ? remark.trim() : "";

  if (cleanRemark.length > 500) {
    return failure("Remark cannot exceed 500 characters.");
  }

  const session = await mongoose.startSession();

  let approvedId = null;
  let failureMessage = null;

  try {
    await session.withTransaction(async () => {
      approvedId = null;
      failureMessage = null;

      const now = new Date();

      const outpass = await Outpass.findOne({
        _id: outpassId,
        isDeleted: false,
      }).session(session);

      if (!outpass) {
        failureMessage = "Outpass not found.";
        return;
      }

      if (outpass.status !== OUTPASS_STATUS.PENDING) {
        failureMessage = "Only pending outpasses can be approved.";
        return;
      }

      const parentStatus = outpass.parentDecision?.status || "PENDING";

      if (parentStatus === "REJECTED") {
        failureMessage = "Parent rejected this request. Approval blocked.";
        return;
      }

      if (!["PENDING", "APPROVED"].includes(parentStatus)) {
        failureMessage = "Invalid parent decision.";
        return;
      }

      const faculty = await Mentor.findById(facultyId).session(session);

      const studentMaster = await StudentMaster.findOne({
        enrollmentNumber: normalize(outpass.enrollmentNumber),
        isActive: true,
        isDeleted: false,
      }).session(session);

      if (!studentMaster) {
        failureMessage = "Active StudentMaster record not found.";
        return;
      }

      // Protect against stale or mismatched academic data.
      if (
        Number(studentMaster.semester) !== Number(outpass.semester) ||
        normalize(studentMaster.section) !== normalize(outpass.section) ||
        normalize(studentMaster.group) !== normalize(outpass.group) ||
        (outpass.academicInstitute &&
          !sameId(studentMaster.institute, outpass.academicInstitute)) ||
        (outpass.academicProgram &&
          !sameId(studentMaster.program, outpass.academicProgram))
      ) {
        failureMessage =
          "Student academic mapping changed. Reassignment required.";
        return;
      }

      // Official academic mapping and scope resolution.
      const context = await getAcademicContext(studentMaster);

      if (!context?.scopes) {
        failureMessage = "Unable to resolve student academic scope.";
        return;
      }

      const requiredScope =
        role === "HOD" ? context.scopes.hod : context.scopes.hoi;

      if (!checkFacultyScope(faculty, role, requiredScope, now)) {
        failureMessage = `Unauthorized ${role} academic scope.`;
        return;
      }

      const dayKey = getISTDay(outpass.outDate);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || ""))) {
        failureMessage = "Invalid outpass date.";
        return;
      }

      const previousTrips = await getPreviousTrips(outpass, dayKey, session);

      if (previousTrips.length >= 2) {
        failureMessage = "Maximum 2 approved outpasses per IST day.";
        return;
      }

      const tripNumber = previousTrips.length + 1;

      if (tripNumber === 2 && !previousTrips.every(isCompletedTrip)) {
        failureMessage = "Complete EXIT and ENTRY of first trip.";
        return;
      }

      let validity;

      try {
        validity = getValidityWindow(outpass.outDate);
      } catch {
        failureMessage = "Invalid outpass validity window.";
        return;
      }

      if (now >= validity.expiresAt) {
        failureMessage = "Outpass validity window expired.";
        return;
      }

      // Faculty approval can precede parent approval.
      // QR must wait until verified consent exists.
      const consentVerified =
        parentStatus === "APPROVED" && outpass.hasParentConsent();

      let qr = null;

      if (consentVerified) {
        qr = createQRToken(
          {
            ...outpass.toObject(),
            status: OUTPASS_STATUS.APPROVED,
            approvedAt: now,
            approvedByFaculty: facultyId,
            approvedAuthorityRole: role,
            outpassDayIST: dayKey,
            dailyTripNumber: tripNumber,
          },
          now,
        );
      }

      const previousRole = outpass.assignedRole;

      const bypassedRoles =
        role === "HOD"
          ? ["MENTOR", "COORDINATOR"]
          : ["MENTOR", "COORDINATOR", "HOD"];

      const filter = {
        _id: outpass._id,
        status: OUTPASS_STATUS.PENDING,
        isDeleted: false,
        "parentDecision.status": parentStatus,
        assignedFaculty: outpass.assignedFaculty,
        assignedRole: previousRole,
        qrGenerated: false,
        dailyTripNumber: null,
      };

      if (parentStatus === "PENDING") {
        filter["parentDecision.decidedAt"] = null;
      } else {
        filter["parentDecision.decidedAt"] = outpass.parentDecision.decidedAt;
        filter["parentDecision.method"] = outpass.parentDecision.method;
      }

      const updated = await Outpass.findOneAndUpdate(
        filter,
        {
          $set: {
            status: OUTPASS_STATUS.APPROVED,

            approvedByFaculty: facultyId,
            approvedAuthorityRole: role,
            approvedAt: now,
            approvalRemark: cleanRemark,

            parentConsentAcknowledgement: {
              parentStatusAtApproval: parentStatus,
              acknowledgedBy: facultyId,
              acknowledgedRole: role,
              remark: consentVerified
                ? "Verified parent consent."
                : "Faculty approval while parent decision pending.",
              acknowledgedAt: now,
            },

            approvalBypass: {
              used: true,
              performedBy: facultyId,
              authorityRole: role,
              bypassedRoles,
              reason: cleanRemark,
              performedAt: now,
            },

            outpassDayIST: dayKey,
            dailyTripNumber: tripNumber,

            qrGenerated: Boolean(qr),
            qrGeneratedAt: qr?.qrGeneratedAt || null,
            qrToken: qr?.token || null,
            qrValidFrom: qr?.qrValidFrom || null,
            qrExpiresAt: qr?.qrExpiresAt || null,
            qrRevokedAt: null,
          },

          $push: {
            timeline: approvedEvent(facultyId, cleanRemark),
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        },
      );

      if (!updated) {
        failureMessage = "Outpass changed during approval. Refresh and retry.";
        return;
      }

      approvedId = updated._id;
    });
  } catch (error) {
    if (
      error.code === 11000 ||
      error.code === 112 ||
      error.hasErrorLabel?.("TransientTransactionError")
    ) {
      return failure("Concurrent approval detected. Refresh and retry.");
    }

    throw error;
  } finally {
    await session.endSession();
  }

  if (!approvedId) {
    return failure(failureMessage || "Approval failed.");
  }

  const updatedOutpass = await Outpass.findById(approvedId);

  if (!updatedOutpass) {
    return failure("Approved outpass could not be retrieved.");
  }

  const qrReady =
    updatedOutpass.qrGenerated === true && Boolean(updatedOutpass.qrToken);

  // Notifications run only after transaction commit.
  try {
    await sendNotification({
      title: "Outpass Approved",
      message: qrReady
        ? `Your outpass was approved by ${role}. QR is ready.`
        : `Your outpass was approved by ${role}. Parent consent is pending.`,
      type: NOTIFICATION_TYPES.OUTPASS_APPROVED,
      sender: facultyId,
      receiver: updatedOutpass.student,
      role: NOTIFICATION_ROLES.STUDENT,
      relatedOutpass: updatedOutpass._id,
    });
  } catch (error) {
    console.error("Approval notification failed:", error.message);
  }

  return {
    success: true,
    message: qrReady
      ? `${role} approval successful. QR ready.`
      : `${role} approval successful. Awaiting verified parent consent for QR.`,
    data: updatedOutpass,
  };
};

const approveOutpassForRole = async (
  facultyId,
  outpassId,
  remark = "",
  role,
) => {
  const normalizedRole = normalize(role);

  // Preserve existing tested workflows.
  if (
    normalizedRole === "MENTOR" ||
    normalizedRole === "BACKUP_MENTOR" ||
    normalizedRole === "COORDINATOR"
  ) {
    return legacy.approveOutpass(facultyId, outpassId, remark);
  }

  if (!["HOD", "HOI"].includes(normalizedRole)) {
    return failure("Unauthorized approval role.");
  }

  return approveDirectly(facultyId, outpassId, remark, normalizedRole);
};

module.exports = Object.freeze({
  approveOutpassForRole,
});
