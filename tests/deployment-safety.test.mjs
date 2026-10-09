import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { validateDeploymentAuthorization } from "../tools/validate-deployment-authorization.mjs";
import { validateDeploymentHistory } from "../tools/validate-deployment-history.mjs";
import { REQUIRED_RISK_IDS, validateRestorationTarget } from "../tools/validate-restoration-mode.mjs";

const SOURCE = resolve(import.meta.dirname, "..");
const PACKAGE_ROOT = join(SOURCE, "docs", "rollback", "PP-017-historical-site");
const LEGACY_MANIFEST = readFileSync(join(PACKAGE_ROOT, "legacy-public-assets.json"));
const LEGACY_FILES = JSON.parse(LEGACY_MANIFEST).files;
const RESTORATION_MODE = readFileSync(join(PACKAGE_ROOT, "restoration-mode.template.json"));
const MARKETPLACE_MANIFEST = readFileSync(join(SOURCE, "deployment", "public-assets.json"));
const OTHER_TARGET_SHA = "cccccccccccccccccccccccccccccccccccccccc";
const TOOLING_COMMIT_SHA = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const CONTROL_COMMIT_SHA = "dddddddddddddddddddddddddddddddddddddddd";
const AT = "2026-10-07T23:34:00Z";

function fixture(mutate) {
  const root = mkdtempSync(join(tmpdir(), "promopalaces-deployment-safety-"));
  try {
    for (const directory of ["agents", "affiliates", "governance"]) cpSync(join(SOURCE, directory), join(root, directory), { recursive: true });
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "test@example.invalid"]);
    git(root, ["config", "user.name", "PromoPalaces Test"]);
    git(root, ["add", "."]);
    git(root, ["commit", "-qm", "approved marketplace target"]);
    const targetCommitSha = git(root, ["rev-parse", "HEAD"]);
    mutate(root, targetCommitSha);
    return { root, targetCommitSha };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function edit(root, relativePath, mutate) {
  const path = join(root, ...relativePath.split("/"));
  const data = JSON.parse(readFileSync(path, "utf8"));
  mutate(data);
  writeFileSync(path, JSON.stringify(data));
}

function deploymentDecision(targetCommitSha, overrides = {}) {
  return {
    id: "DEC-500",
    timestamp: "2026-10-07T23:33:30Z",
    decision_type: "owner_authorization",
    task_id: "PP-017",
    gate_ids: ["production_configuration", "deployment"],
    scope: "Regression-only deployment authorization record.",
    approver_role: "owner",
    evidence: ["test evidence"],
    expires_at: "2026-10-10T23:33:30Z",
    status: "approved",
    target_commit_sha: targetCommitSha,
    tooling_commit_sha: TOOLING_COMMIT_SHA,
    ...overrides
  };
}

function withFixture(mutate, assertion) {
  const state = fixture(mutate);
  try {
    return assertion(state.root, state.targetCommitSha);
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
}

function authorization(root, targetCommitSha, overrides = {}) {
  return validateDeploymentAuthorization({
    root,
    decisionId: "DEC-500",
    taskId: "PP-017",
    targetCommitSha,
    toolingCommitSha: TOOLING_COMMIT_SHA,
    controlCommitSha: CONTROL_COMMIT_SHA,
    at: AT,
    ...overrides
  });
}

test("accepts a deployment audit record bound to the exact target commit", () => withFixture((root, targetCommitSha) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision(targetCommitSha)]; });
}, (root, targetCommitSha) => {
  const decision = authorization(root, targetCommitSha);
  assert.equal(decision.target_commit_sha, targetCommitSha);
  assert.equal(decision.tooling_commit_sha, TOOLING_COMMIT_SHA);
}));

test("rejects deployment authorization for a different target commit", () => withFixture((root, targetCommitSha) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision(targetCommitSha)]; });
}, (root, targetCommitSha) => {
  assert.throws(
    () => authorization(root, targetCommitSha, { targetCommitSha: OTHER_TARGET_SHA }),
    /not bound to the exact target commit SHA/
  );
}));

test("rejects deployment authorization for different reviewed tooling", () => withFixture((root, targetCommitSha) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision(targetCommitSha)]; });
}, (root, targetCommitSha) => {
  assert.throws(
    () => authorization(root, targetCommitSha, { toolingCommitSha: OTHER_TARGET_SHA }),
    /not bound to the exact reviewed tooling commit SHA/
  );
}));

test("rejects deployment decisions valid for more than seven days", () => withFixture((root, targetCommitSha) => {
  edit(root, "governance/decision-log.json", (data) => {
    data.entries = [deploymentDecision(targetCommitSha, { expires_at: "2026-10-15T23:33:30Z" })];
  });
}, (root, targetCommitSha) => {
  assert.throws(
    () => authorization(root, targetCommitSha),
    /validity must not exceed seven days/
  );
}));

test("rejects deployment authorization while task prerequisites are incomplete", () => withFixture((root, targetCommitSha) => {
  edit(root, "governance/decision-log.json", (data) => {
    data.entries = [deploymentDecision(targetCommitSha, { task_id: "PP-015" })];
  });
}, (root, targetCommitSha) => {
  assert.throws(
    () => authorization(root, targetCommitSha, { taskId: "PP-015" }),
    /prerequisites are not complete: PP-010, PP-014/
  );
}));

test("rejects deployment records without a valid target commit SHA", () => withFixture((root, targetCommitSha) => {
  edit(root, "governance/decision-log.json", (data) => {
    data.entries = [deploymentDecision(targetCommitSha, { target_commit_sha: "short" })];
  });
}, (root, targetCommitSha) => {
  assert.throws(
    () => authorization(root, targetCommitSha),
    /Governance validation must pass.*target_commit_sha has an invalid format/
  );
}));

test("rejects a revoked deployment approval", () => withFixture((root, targetCommitSha) => {
  edit(root, "governance/decision-log.json", (data) => {
    data.entries = [
      deploymentDecision(targetCommitSha),
      { id: "DEC-501", timestamp: "2026-10-07T23:33:45Z", decision_type: "owner_authorization", task_id: "PP-017", gate_ids: ["production_configuration", "deployment"], scope: "Revoke regression authorization.", approver_role: "owner", evidence: ["test revocation evidence"], expires_at: "2026-10-10T23:33:45Z", status: "revoked", revokes_decision_id: "DEC-500" }
    ];
  });
}, (root, targetCommitSha) => {
  assert.throws(() => authorization(root, targetCommitSha), /has been revoked/);
}));

test("rejects a revocation added after an earlier authorization snapshot", () => withFixture((root, targetCommitSha) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision(targetCommitSha)]; });
}, (root, targetCommitSha) => {
  assert.equal(authorization(root, targetCommitSha).id, "DEC-500");
  edit(root, "governance/decision-log.json", (data) => {
    data.entries.push({ id: "DEC-502", timestamp: "2026-10-07T23:33:50Z", decision_type: "owner_authorization", task_id: "PP-017", gate_ids: ["production_configuration", "deployment"], scope: "Fresh-state revocation regression.", approver_role: "owner", evidence: ["test revocation evidence"], expires_at: "2026-10-10T23:33:50Z", status: "revoked", revokes_decision_id: "DEC-500" });
  });
  assert.throws(() => authorization(root, targetCommitSha), /has been revoked/);
}));

test("rejects a missing deployment approval", () => withFixture(() => {}, (root, targetCommitSha) => {
  assert.throws(() => authorization(root, targetCommitSha), /Approval decision does not exist/);
}));

test("rejects an approval for the wrong task", () => withFixture((root, targetCommitSha) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision(targetCommitSha, { task_id: "PP-010", gate_ids: ["deployment"] })]; });
}, (root, targetCommitSha) => {
  assert.throws(() => authorization(root, targetCommitSha), /does not belong to task PP-017/);
}));

test("rejects deployment approval that omits a required production configuration gate", () => withFixture((root, targetCommitSha) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision(targetCommitSha, { gate_ids: ["deployment"] })]; });
}, (root, targetCommitSha) => {
  assert.throws(() => authorization(root, targetCommitSha), /does not cover every required task gate: production_configuration/);
}));

test("rejects an unauthorized deployment approval", () => withFixture((root, targetCommitSha) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision(targetCommitSha, { approver_role: "agent" })]; });
}, (root, targetCommitSha) => {
  assert.throws(() => authorization(root, targetCommitSha), /Governance validation must pass.*approver_role must be owner/);
}));

test("derives restoration status from the historical target and enforces a complete target-bound acknowledgement", () => withHistoricalRestorationFixture({ includeAcknowledgement: false }, ({ root, targetCommitSha, unmarkedHistoricalTargetSha, toolingCommitSha, controlCommitSha }) => {
  assert.equal(validateRestorationTarget(root, targetCommitSha).active, true);
  assert.throws(
    () => validateRestorationTarget(root, unmarkedHistoricalTargetSha),
    /appears to be a historical restoration but has no validated deployment\/restoration-mode\.json/
  );
  assert.equal(validateRestorationTarget(root, toolingCommitSha).active, false);
  assert.throws(
    () => validateDeploymentAuthorization({ root, decisionId: "DEC-500", taskId: "PP-017", targetCommitSha, toolingCommitSha, controlCommitSha, at: AT }),
    /decision\.restoration_acknowledgement must be an object/
  );

  const decision = deploymentDecision(targetCommitSha, {
    tooling_commit_sha: toolingCommitSha,
    restoration_acknowledgement: restorationAcknowledgement(targetCommitSha)
  });
  writeDecisionLog(root, [decision]);
  git(root, ["add", "governance/decision-log.json"]);
  git(root, ["commit", "-qm", "target-bound historical restoration acknowledgement"]);
  const acknowledgedControlCommitSha = git(root, ["rev-parse", "HEAD"]);
  assert.deepEqual(
    validateDeploymentHistory({ repositoryRoot: root, targetCommitSha, toolingCommitSha, controlCommitSha: acknowledgedControlCommitSha }),
    { targetCommitSha, toolingCommitSha, controlCommitSha: acknowledgedControlCommitSha }
  );
  assert.equal(
    validateDeploymentAuthorization({ root, decisionId: "DEC-500", taskId: "PP-017", targetCommitSha, toolingCommitSha, controlCommitSha: acknowledgedControlCommitSha, at: AT }).id,
    "DEC-500"
  );

  const insufficient = structuredClone(decision);
  insufficient.restoration_acknowledgement.risk_ids = REQUIRED_RISK_IDS.slice(0, 2);
  writeDecisionLog(root, [insufficient]);
  assert.throws(
    () => validateDeploymentAuthorization({ root, decisionId: "DEC-500", taskId: "PP-017", targetCommitSha, toolingCommitSha, controlCommitSha: acknowledgedControlCommitSha, at: AT }),
    /risk_ids must exactly match/
  );

  const tamperedTarget = structuredClone(decision);
  tamperedTarget.restoration_acknowledgement.target_commit_sha = toolingCommitSha;
  writeDecisionLog(root, [tamperedTarget]);
  assert.throws(
    () => validateDeploymentAuthorization({ root, decisionId: "DEC-500", taskId: "PP-017", targetCommitSha, toolingCommitSha, controlCommitSha: acknowledgedControlCommitSha, at: AT }),
    /target_commit_sha must match decision target_commit_sha/
  );

  writeDecisionLog(root, [decision]);
  assert.throws(
    () => validateDeploymentAuthorization({ root, decisionId: "DEC-500", taskId: "PP-017", targetCommitSha: toolingCommitSha, toolingCommitSha, controlCommitSha: acknowledgedControlCommitSha, at: AT }),
    /not bound to the exact target commit SHA/
  );

  const expired = structuredClone(decision);
  expired.expires_at = "2026-10-07T23:33:45Z";
  writeDecisionLog(root, [expired]);
  assert.throws(
    () => validateDeploymentAuthorization({ root, decisionId: "DEC-500", taskId: "PP-017", targetCommitSha, toolingCommitSha, controlCommitSha: acknowledgedControlCommitSha, at: AT }),
    /is not active at the authorization time/
  );

  writeDecisionLog(root, [
    decision,
    { id: "DEC-501", timestamp: "2026-10-07T23:33:45Z", decision_type: "owner_authorization", task_id: "PP-017", gate_ids: ["production_configuration", "deployment"], scope: "Regression revocation of a historical restoration authorization.", approver_role: "owner", evidence: ["test revocation evidence"], expires_at: "2026-10-10T23:33:45Z", status: "revoked", revokes_decision_id: "DEC-500" }
  ]);
  assert.throws(
    () => validateDeploymentAuthorization({ root, decisionId: "DEC-500", taskId: "PP-017", targetCommitSha, toolingCommitSha, controlCommitSha: acknowledgedControlCommitSha, at: AT }),
    /has been revoked/
  );
}));

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
}

function commit(root, file, content, message) {
  writeFileSync(join(root, file), content);
  git(root, ["add", file]);
  git(root, ["commit", "-qm", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

function copyPackageSource(root) {
  for (const file of LEGACY_FILES) {
    cpSync(join(PACKAGE_ROOT, "source", ...file.split("/")), join(root, ...file.split("/")));
  }
  writeFileSync(join(root, "deployment", "public-assets.json"), LEGACY_MANIFEST);
  writeFileSync(join(root, "deployment", "restoration-mode.json"), RESTORATION_MODE);
}

function restoreMarketplaceMode(root) {
  rmSync(join(root, "deployment", "restoration-mode.json"), { force: true });
  writeFileSync(join(root, "deployment", "public-assets.json"), MARKETPLACE_MANIFEST);
  cpSync(join(SOURCE, "index.html"), join(root, "index.html"));
}

function restorationAcknowledgement(targetCommitSha, overrides = {}) {
  return {
    acknowledged_by: "owner",
    task_id: "PP-017",
    target_commit_sha: targetCommitSha,
    risk_ids: REQUIRED_RISK_IDS,
    ...overrides
  };
}

function writeDecisionLog(root, entries) {
  writeFileSync(join(root, "governance", "decision-log.json"), JSON.stringify({ schema_version: "1.1.0", entries }, null, 2) + "\n");
}

function withHistoricalRestorationFixture({ includeAcknowledgement = true } = {}, assertion) {
  const root = mkdtempSync(join(tmpdir(), "promopalaces-historical-authorization-"));
  try {
    for (const directory of ["agents", "affiliates", "governance"]) cpSync(join(SOURCE, directory), join(root, directory), { recursive: true });
    mkdirSync(join(root, "docs", "rollback"), { recursive: true });
    cpSync(PACKAGE_ROOT, join(root, "docs", "rollback", "PP-017-historical-site"), { recursive: true });
    mkdirSync(join(root, "deployment"), { recursive: true });
    writeFileSync(join(root, "deployment", "public-assets.json"), MARKETPLACE_MANIFEST);
    git(root, ["init", "-q"]);
    git(root, ["branch", "-M", "main"]);
    git(root, ["config", "user.email", "test@example.invalid"]);
    git(root, ["config", "user.name", "PromoPalaces Test"]);
    git(root, ["remote", "add", "historical", SOURCE]);
    git(root, ["fetch", "--quiet", "historical", "a1f732de923d90767a0a7236afeb1ac72342292b"]);

    copyPackageSource(root);
    git(root, ["add", "."]);
    git(root, ["commit", "-qm", "historical restoration target"]);
    const targetCommitSha = git(root, ["rev-parse", "HEAD"]);

    rmSync(join(root, "deployment", "restoration-mode.json"), { force: true });
    git(root, ["add", "deployment/restoration-mode.json"]);
    git(root, ["commit", "-qm", "invalid unmarked historical target"]);
    const unmarkedHistoricalTargetSha = git(root, ["rev-parse", "HEAD"]);

    restoreMarketplaceMode(root);
    writeFileSync(join(root, "tooling-marker.txt"), "later marketplace tooling");
    git(root, ["add", "deployment", "index.html", "tooling-marker.txt"]);
    git(root, ["commit", "-qm", "later marketplace tooling"]);
    const toolingCommitSha = git(root, ["rev-parse", "HEAD"]);
    const decision = deploymentDecision(targetCommitSha, { tooling_commit_sha: toolingCommitSha });
    if (includeAcknowledgement) decision.restoration_acknowledgement = restorationAcknowledgement(targetCommitSha);
    writeDecisionLog(root, [decision]);
    git(root, ["add", "governance/decision-log.json"]);
    git(root, ["commit", "-qm", "later marketplace authorization control"]);
    const controlCommitSha = git(root, ["rev-parse", "HEAD"]);
    return assertion({ root, targetCommitSha, unmarkedHistoricalTargetSha, toolingCommitSha, controlCommitSha, decision });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function withHistoryFixture(assertion) {
  const root = mkdtempSync(join(tmpdir(), "promopalaces-deployment-history-"));
  try {
    git(root, ["init", "-q"]);
    git(root, ["branch", "-M", "main"]);
    git(root, ["config", "user.email", "test@example.invalid"]);
    git(root, ["config", "user.name", "PromoPalaces Test"]);
    commit(root, "baseline.txt", "baseline", "baseline");
    const targetCommitSha = commit(root, "target.txt", "approved target", "approved target");
    git(root, ["checkout", "-qb", "feature", targetCommitSha]);
    const featureCommitSha = commit(root, "feature.txt", "unreviewed feature path", "feature work");
    git(root, ["checkout", "-q", "main"]);
    const toolingCommitSha = commit(root, "tooling.txt", "reviewed tooling", "reviewed tooling");
    git(root, ["merge", "--no-ff", "feature", "-m", "merge feature"]);
    const controlCommitSha = git(root, ["rev-parse", "HEAD"]);
    return assertion({ root, targetCommitSha, toolingCommitSha, featureCommitSha, controlCommitSha });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("accepts target and tooling commits on the reviewed main first-parent history", () => withHistoryFixture((history) => {
  assert.deepEqual(
    validateDeploymentHistory({ repositoryRoot: history.root, targetCommitSha: history.targetCommitSha, toolingCommitSha: history.toolingCommitSha, controlCommitSha: history.controlCommitSha }),
    { targetCommitSha: history.targetCommitSha, toolingCommitSha: history.toolingCommitSha, controlCommitSha: history.controlCommitSha }
  );
}));

test("rejects an arbitrary feature commit that is not on main first-parent history", () => withHistoryFixture((history) => {
  assert.throws(
    () => validateDeploymentHistory({ repositoryRoot: history.root, targetCommitSha: history.featureCommitSha, toolingCommitSha: history.toolingCommitSha, controlCommitSha: history.controlCommitSha }),
    /Target commit is not a reviewed first-parent commit on main/
  );
}));

test("rejects a target equal to the authorization control commit", () => withFixture((root, targetCommitSha) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision(targetCommitSha, { target_commit_sha: CONTROL_COMMIT_SHA })]; });
}, (root, targetCommitSha) => {
  assert.throws(
    () => authorization(root, targetCommitSha, { targetCommitSha: CONTROL_COMMIT_SHA }),
    /must differ from the control commit SHA/
  );
}));

test("rejects tooling equal to the authorization control commit", () => withFixture((root, targetCommitSha) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision(targetCommitSha, { tooling_commit_sha: CONTROL_COMMIT_SHA })]; });
}, (root, targetCommitSha) => {
  assert.throws(
    () => authorization(root, targetCommitSha, { toolingCommitSha: CONTROL_COMMIT_SHA }),
    /tooling commit SHA must differ from the control commit SHA/
  );
}));
