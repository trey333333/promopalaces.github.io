import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { validateDeploymentAuthorization } from "../tools/validate-deployment-authorization.mjs";

const SOURCE = resolve(import.meta.dirname, "..");
const COMMIT_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const OTHER_SHA = "cccccccccccccccccccccccccccccccccccccccc";
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
    commit_sha: COMMIT_SHA,
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

test("accepts a deployment audit record bound to the exact commit", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision()]; });
}, (root) => {
  const decision = validateDeploymentAuthorization({ root, decisionId: "DEC-500", taskId: "PP-017", commitSha: COMMIT_SHA, at: AT });
  assert.equal(decision.commit_sha, COMMIT_SHA);
}));

test("rejects deployment authorization for a different commit", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => { data.entries = [deploymentDecision()]; });
}, (root) => {
  assert.throws(
    () => validateDeploymentAuthorization({ root, decisionId: "DEC-500", taskId: "PP-017", commitSha: OTHER_SHA, at: AT }),
    /not bound to the exact commit SHA/
  );
}));

test("rejects deployment decisions valid for more than seven days", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => {
    data.entries = [deploymentDecision({ expires_at: "2026-10-15T23:33:30Z" })];
  });
}, (root) => {
  assert.throws(
    () => validateDeploymentAuthorization({ root, decisionId: "DEC-500", taskId: "PP-017", commitSha: COMMIT_SHA, at: AT }),
    /validity must not exceed seven days/
  );
}));

test("rejects deployment authorization while task prerequisites are incomplete", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => {
    data.entries = [deploymentDecision({ task_id: "PP-015" })];
  });
}, (root) => {
  assert.throws(
    () => validateDeploymentAuthorization({ root, decisionId: "DEC-500", taskId: "PP-015", commitSha: COMMIT_SHA, at: AT }),
    /prerequisites are not complete: PP-010, PP-014/
  );
}));

test("rejects deployment records without a valid commit SHA", () => withFixture((root) => {
  edit(root, "governance/decision-log.json", (data) => {
    data.entries = [deploymentDecision({ commit_sha: "short" })];
  });
}, (root) => {
  assert.throws(
    () => validateDeploymentAuthorization({ root, decisionId: "DEC-500", taskId: "PP-017", commitSha: COMMIT_SHA, at: AT }),
    /Governance validation must pass.*commit_sha has an invalid format/
  );
}));
