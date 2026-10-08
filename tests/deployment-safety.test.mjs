import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { validateDeploymentAuthorization } from "../tools/validate-deployment-authorization.mjs";
import { validateDeploymentHistory } from "../tools/validate-deployment-history.mjs";

const SOURCE = resolve(import.meta.dirname, "..");
const TARGET_COMMIT_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const OTHER_TARGET_SHA = "cccccccccccccccccccccccccccccccccccccccc";
const TOOLING_COMMIT_SHA = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const CONTROL_COMMIT_SHA = "dddddddddddddddddddddddddddddddddddddddd";
const AT = "2026-10-07T23:34:00Z";

function fixture(mutate) {
  const root = mkdtempSync(join(tmpdir(), "promopalaces-deployment-safety-"));
  try {
    for (const directory of ["agents", "affiliates", "governance"]) cpSync(join(SOURCE, directory), join(root, directory), { recursive: true });
    mutate(root);
    return root;
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

function deploymentDecision(overrides = {}) {
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
    target_commit_sha: TARGET_COMMIT_SHA,
    tooling_commit_sha: TOOLING_COMMIT_SHA,
    ...overrides
  };
}

function withFixture(mutate, assertion) {
  const root = fixture(mutate);
  try {
    return assertion(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function authorization(root, overrides = {}) {
  return validateDeploymentAuthorization({
    root,
    decisionId: "DEC-500",
    taskId: "PP-017",
    targetCommitSha: TARGET_COMMIT_SHA,
    toolingCommitSha: TOOLING_COMMIT_SHA,
    controlCommitSha: CONTROL_COMMIT_SHA,
    at: AT,
    ...overrides
  });
}

test("accepts a deployment audit record bound to the exact target commit", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision()]; });
}, (root) => {
  const decision = authorization(root);
  assert.equal(decision.target_commit_sha, TARGET_COMMIT_SHA);
  assert.equal(decision.tooling_commit_sha, TOOLING_COMMIT_SHA);
}));

test("rejects deployment authorization for a different target commit", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision()]; });
}, (root) => {
  assert.throws(
    () => authorization(root, { targetCommitSha: OTHER_TARGET_SHA }),
    /not bound to the exact target commit SHA/
  );
}));

test("rejects deployment authorization for different reviewed tooling", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision()]; });
}, (root) => {
  assert.throws(
    () => authorization(root, { toolingCommitSha: OTHER_TARGET_SHA }),
    /not bound to the exact reviewed tooling commit SHA/
  );
}));

test("rejects deployment decisions valid for more than seven days", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => {
    data.entries = [deploymentDecision({ expires_at: "2026-10-15T23:33:30Z" })];
  });
}, (root) => {
  assert.throws(
    () => authorization(root),
    /validity must not exceed seven days/
  );
}));

test("rejects deployment authorization while task prerequisites are incomplete", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => {
    data.entries = [deploymentDecision({ task_id: "PP-015" })];
  });
}, (root) => {
  assert.throws(
    () => authorization(root, { taskId: "PP-015" }),
    /prerequisites are not complete: PP-010, PP-014/
  );
}));

test("rejects deployment records without a valid target commit SHA", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => {
    data.entries = [deploymentDecision({ target_commit_sha: "short" })];
  });
}, (root) => {
  assert.throws(
    () => authorization(root),
    /Governance validation must pass.*target_commit_sha has an invalid format/
  );
}));

test("rejects a revoked deployment approval", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => {
    data.entries = [
      deploymentDecision(),
      { id: "DEC-501", timestamp: "2026-10-07T23:33:45Z", decision_type: "owner_authorization", task_id: "PP-017", gate_ids: ["production_configuration", "deployment"], scope: "Revoke regression authorization.", approver_role: "owner", evidence: ["test revocation evidence"], expires_at: "2026-10-10T23:33:45Z", status: "revoked", revokes_decision_id: "DEC-500" }
    ];
  });
}, (root) => {
  assert.throws(() => authorization(root), /has been revoked/);
}));

test("rejects a revocation added after an earlier authorization snapshot", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision()]; });
}, (root) => {
  assert.equal(authorization(root).id, "DEC-500");
  edit(root, "governance/decision-log.json", (data) => {
    data.entries.push({ id: "DEC-502", timestamp: "2026-10-07T23:33:50Z", decision_type: "owner_authorization", task_id: "PP-017", gate_ids: ["production_configuration", "deployment"], scope: "Fresh-state revocation regression.", approver_role: "owner", evidence: ["test revocation evidence"], expires_at: "2026-10-10T23:33:50Z", status: "revoked", revokes_decision_id: "DEC-500" });
  });
  assert.throws(() => authorization(root), /has been revoked/);
}));

test("rejects a missing deployment approval", () => withFixture(() => {}, (root) => {
  assert.throws(() => authorization(root), /Approval decision does not exist/);
}));

test("rejects an approval for the wrong task", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision({ task_id: "PP-010", gate_ids: ["deployment"] })]; });
}, (root) => {
  assert.throws(() => authorization(root), /does not belong to task PP-017/);
}));

test("rejects deployment approval that omits a required production configuration gate", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision({ gate_ids: ["deployment"] })]; });
}, (root) => {
  assert.throws(() => authorization(root), /does not cover every required task gate: production_configuration/);
}));

test("rejects an unauthorized deployment approval", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision({ approver_role: "agent" })]; });
}, (root) => {
  assert.throws(() => authorization(root), /Governance validation must pass.*approver_role must be owner/);
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

test("rejects a target equal to the authorization control commit", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision({ target_commit_sha: CONTROL_COMMIT_SHA })]; });
}, (root) => {
  assert.throws(
    () => authorization(root, { targetCommitSha: CONTROL_COMMIT_SHA }),
    /must differ from the control commit SHA/
  );
}));

test("rejects tooling equal to the authorization control commit", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision({ tooling_commit_sha: CONTROL_COMMIT_SHA })]; });
}, (root) => {
  assert.throws(
    () => authorization(root, { toolingCommitSha: CONTROL_COMMIT_SHA }),
    /tooling commit SHA must differ from the control commit SHA/
  );
}));
