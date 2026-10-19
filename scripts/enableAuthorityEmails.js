"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const applyPath = path.join(
  root,
  "src/modules/outpass/services/applyOutpassService.js",
);

const reassignPath = path.join(
  root,
  "src/modules/outpass/services/outpassReassignmentService.js",
);

const helperPath = path.join(
  root,
  "src/modules/outpass/services/authorityAssignmentEmailService.js",
);

if (!fs.existsSync(helperPath)) {
  throw new Error("Create authorityAssignmentEmailService.js first.");
}

const applyOld = fs.readFileSync(applyPath, "utf8");
const reassignOld = fs.readFileSync(reassignPath, "utf8");

const requireOnceMatch = (source, regex, label) => {
  const matches = [...source.matchAll(new RegExp(regex.source, "g"))];

  if (matches.length !== 1) {
    throw new Error(
      `${label}: expected one match, found ${matches.length}. No file changed.`,
    );
  }
};

const resolverImport =
  'const { resolveOutpassAuthority } = require("./outpassEscalationService");';

const emailImport =
  'const { sendAuthorityAssignmentEmail } = require("./authorityAssignmentEmailService");';

const pendingEmailPattern =
  /await\s+safeTask\("faculty pending alert",\s*\(\)\s*=>\s*notifyFacultyPendingThreshold\(\{\s*faculty,\s*assignedRole,\s*\}\),\s*\);/;

const reassignmentResultPattern =
  /return\s+\{\s*status:\s*"REASSIGNED",\s*outpassId:\s*updated\.outpassId,/;

const notificationResultPattern = /notificationError,\s*\};/;

const notificationFailurePattern = /notificationFailures:\s*0,/;

const summaryPattern =
  /if\s*\(!result\.notificationSent\)\s*\{\s*summary\.notificationFailures\s*\+=\s*1;\s*\}/;

let applyNew = applyOld;
let reassignNew = reassignOld;

// ============================================================
// 1. INSTALL SHARED EMAIL IMPORT
// ============================================================

for (const target of ["apply", "reassign"]) {
  const source = target === "apply" ? applyNew : reassignNew;

  if (source.includes(emailImport)) continue;

  if (!source.includes(resolverImport)) {
    throw new Error(`${target}: resolver import not found.`);
  }

  const updated = source.replace(
    resolverImport,
    `${resolverImport}\n${emailImport}`,
  );

  if (target === "apply") {
    applyNew = updated;
  } else {
    reassignNew = updated;
  }
}

// ============================================================
// 2. NEW OUTPASS -> HOD / HOI EMAIL
// ============================================================

if (!applyNew.includes('"authority assignment email"')) {
  requireOnceMatch(applyNew, pendingEmailPattern, "Apply email stage");

  applyNew = applyNew.replace(
    pendingEmailPattern,
    `if (assignedRole === "HOD" || assignedRole === "HOI") {
    await safeTask("authority assignment email", () =>
      sendAuthorityAssignmentEmail({
        outpassId: outpass._id,
        facultyId: faculty._id,
        assignedRole,
        kind: "NEW",
      }),
    );
  } else {
    await safeTask("faculty pending alert", () =>
      notifyFacultyPendingThreshold({
        faculty,
        assignedRole,
      }),
    );
  }`,
  );
}

// ============================================================
// 3. TRANSFERRED OUTPASS -> NEW HOD / HOI EMAIL
// ============================================================

if (!reassignNew.includes("let authorityEmailSent = null")) {
  requireOnceMatch(
    reassignNew,
    reassignmentResultPattern,
    "Reassignment result",
  );

  requireOnceMatch(
    reassignNew,
    notificationResultPattern,
    "Email result fields",
  );

  reassignNew = reassignNew.replace(
    reassignmentResultPattern,
    `let authorityEmailSent = null;
  let authorityEmailError = null;

  if (nextRole === "HOD" || nextRole === "HOI") {
    try {
      const delivered =
        await sendAuthorityAssignmentEmail({
          outpassId: updated._id,
          facultyId: nextFaculty._id,
          assignedRole: nextRole,
          kind: "TRANSFER",
        });

      authorityEmailSent =
        delivered.sent === true;

      if (!authorityEmailSent) {
        authorityEmailError =
          delivered.reason || "Email not sent";
      }
    } catch (error) {
      authorityEmailSent = false;
      authorityEmailError =
        error.message || "Email delivery failed";

      console.error(
        "[REASSIGN] Authority email failed:",
        authorityEmailError
      );
    }
  }

  return {
    status: "REASSIGNED",
    outpassId: updated.outpassId,`,
  );

  reassignNew = reassignNew.replace(
    notificationResultPattern,
    `notificationError,
    authorityEmailSent,
    authorityEmailError,
  };`,
  );
}

// ============================================================
// 4. TRANSFER EMAIL SUMMARY
// ============================================================

if (!reassignNew.includes("authorityEmailFailures: 0")) {
  requireOnceMatch(
    reassignNew,
    notificationFailurePattern,
    "Reassignment summary",
  );

  reassignNew = reassignNew.replace(
    notificationFailurePattern,
    `notificationFailures: 0,
    authorityEmailFailures: 0,`,
  );
}

if (!reassignNew.includes("summary.authorityEmailFailures += 1")) {
  requireOnceMatch(reassignNew, summaryPattern, "Summary accounting");

  reassignNew = reassignNew.replace(
    summaryPattern,
    (found) =>
      `${found}
    if (result.authorityEmailSent === false) {
      summary.authorityEmailFailures += 1;
    }`,
  );
}

// ============================================================
// 5. VALIDATE BEFORE WRITING
// ============================================================

const changes = [
  [applyPath, applyOld, applyNew],
  [reassignPath, reassignOld, reassignNew],
];

for (const [file, , updated] of changes) {
  if (!updated.includes(emailImport)) {
    throw new Error(`Email import missing: ${file}`);
  }
}

// ============================================================
// 6. BACKUP AND APPLY
// ============================================================

for (const [file, original, updated] of changes) {
  if (original === updated) continue;

  fs.copyFileSync(file, `${file}.before-authority-emails.bak`);

  fs.writeFileSync(file, updated, "utf8");

  console.log("Updated:", path.relative(root, file));
}

console.log("HOD and HOI assignment emails integrated.");
