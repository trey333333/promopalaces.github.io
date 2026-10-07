#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./validate-orchestrator.mjs";

const DECISION_ID = /^DEC-\d{3,}$/;
const TASK_ID = /^PP-\d{3}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const MAX_DEPLOYMENT_APPROVAL_MS = 7 * 24 * 60 * 60 * 1000;

function fail(message) {
  throw new Error(message);
}

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1 || !argv[index + 1] || argv[index + 1].startsWith("--")) fail(name + " is required.");
  if (argv.filter((argument) => argument === name).length !== 1) fail(name + " may be supplied only once.");
  return argv[index + 1];
}

function strictTimestamp(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) fail(name + " must be a strict UTC ISO-8601 timestamp.");
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 19) !== value.slice(0, 19)) fail(name + " must be a real UTC date and time.");
  return value;
}

function currentTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function validateDeploymentAuthorization({ root, decisionId, taskId, commitSha, at = currentTimestamp() }) {
  if (!DECISION_ID.test(decisionId)) fail("decision ID has an invalid format.");
  if (!TASK_ID.test(taskId)) fail("task ID has an invalid format.");
  if (!COMMIT_SHA.test(commitSha)) fail("commit SHA must be a lowercase 40-character SHA-1.");
  const effectiveAt = strictTimestamp(at, "authorization time");
  const validatorErrors = validate(root);
  if (validatorErrors.length) fail("Governance validation must pass before deployment authorization: " + validatorErrors.join("; "));

  const decisionLog = readJson(resolve(root, "governance/decision-log.json"));
  const backlog = readJson(resolve(root, "agents/backlog.json"));
  const task = backlog.tasks.find((candidate) => candidate.id === taskId);
  if (!task) fail("Authorization task does not exist: " + taskId);
  if (!task.approval?.gates?.includes("deployment")) fail("Authorization task must require the deployment gate.");
  const incompleteDependencies = task.dependencies.filter((dependencyId) => backlog.tasks.find((candidate) => candidate.id === dependencyId)?.status !== "complete");
  if (incompleteDependencies.length) fail("Authorization task prerequisites are not complete: " + incompleteDependencies.join(", "));

  const decision = decisionLog.entries.find((candidate) => candidate.id === decisionId);
  if (!decision) fail("Approval decision does not exist: " + decisionId);
  if (decision.status !== "approved" || decision.approver_role !== "owner" || decision.decision_type !== "owner_authorization") fail("Approval decision must be an approved owner_authorization decision.");
  if (decision.task_id !== taskId) fail("Approval decision does not belong to task " + taskId + ".");
  if (!decision.gate_ids.includes("deployment")) fail("Approval decision must cover the deployment gate.");
  if (decision.commit_sha !== commitSha) fail("Approval decision is not bound to the exact commit SHA being deployed.");
  if (new Date(decision.expires_at).valueOf() - new Date(decision.timestamp).valueOf() > MAX_DEPLOYMENT_APPROVAL_MS) fail("Deployment approval validity must not exceed seven days.");
  if (decision.timestamp > effectiveAt || decision.expires_at < effectiveAt) fail("Approval decision is not active at the authorization time.");

  const revoked = decisionLog.entries.some((candidate) => candidate.status === "revoked"
    && candidate.revokes_decision_id === decisionId
    && candidate.timestamp <= effectiveAt);
  if (revoked) fail("Approval decision has been revoked.");
  return decision;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const decisionId = option(process.argv.slice(2), "--decision-id");
    const taskId = option(process.argv.slice(2), "--task-id");
    const commitSha = option(process.argv.slice(2), "--commit-sha");
    const atIndex = process.argv.indexOf("--at");
    const at = atIndex === -1 ? currentTimestamp() : process.argv[atIndex + 1];
    if (atIndex !== -1 && (!at || at.startsWith("--"))) fail("--at requires a timestamp value.");
    const decision = validateDeploymentAuthorization({ root: repositoryRoot, decisionId, taskId, commitSha, at });
    console.log("Deployment authorization is active for " + decision.id + " and task " + taskId + ".");
  } catch (error) {
    console.error("Deployment authorization validation failed: " + error.message);
    process.exitCode = 1;
  }
}
