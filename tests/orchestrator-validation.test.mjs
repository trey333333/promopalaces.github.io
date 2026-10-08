import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { validate } from "../tools/validate-orchestrator.mjs";

const SOURCE = resolve(import.meta.dirname, "..");
const TIMESTAMP = "2026-10-07T22:22:35Z";
const TEST_COMMIT_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
function fixture(mutate) {
  const root = mkdtempSync(join(tmpdir(), "promopalaces-governance-"));
  try {
    for (const directory of ["agents", "affiliates", "governance"]) cpSync(join(SOURCE, directory), join(root, directory), { recursive: true });
    mutate(root);
    return validate(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
function edit(root, relativePath, mutate) {
  const path = join(root, ...relativePath.split("/"));
  const data = JSON.parse(readFileSync(path, "utf8"));
  mutate(data);
  writeFileSync(path, JSON.stringify(data));
}
function raw(root, relativePath, content) { writeFileSync(join(root, ...relativePath.split("/")), content); }
function task(backlog, id) { return backlog.tasks.find((item) => item.id === id); }
function history(item, status) {
  item.status = status;
  item.status_history = [{ from: "created", to: status, at: TIMESTAMP, reason: "Regression fixture transition." }];
  item.updated_at = TIMESTAMP;
}
function decision(overrides = {}) {
  return { id: "DEC-100", timestamp: TIMESTAMP, decision_type: "owner_authorization", task_id: "PP-008", gate_ids: ["production_configuration"], scope: "Regression fixture only.", approver_role: "owner", evidence: ["test evidence"], expires_at: "2030-01-01T00:00:00Z", status: "approved", ...overrides };
}
function promotePartner(partner) {
  partner.affiliate_identifier.verification_status = "verified";
  partner.customer_offer.verification_status = "verified";
  partner.landing_page.affiliate_attribution_status = "verified";
  partner.tracking_plan_status = "configured";
  partner.activation_status = "approved_for_publication";
  partner.publication_allowed = true;
  partner.promotion_authorization_at = "2026-10-07T22:30:00Z";
}
function completeWithEvidence(item, startAt, completeAt) {
  item.status = "complete";
  item.status_history = [
    { from: "created", to: "in_progress", at: startAt, reason: "Authorized fixture work started." },
    { from: "in_progress", to: "complete", at: completeAt, reason: "Authorized fixture work completed." }
  ];
  item.completion_evidence = ["fixture completion evidence"];
  item.updated_at = completeAt;
}
function expectErrors(name, mutate, expected) {
  test(name, () => {
    const errors = fixture(mutate);
    for (const fragment of expected) assert.ok(errors.some((error) => error.includes(fragment)), "Expected error fragment not found: " + fragment + "\nActual: " + errors.join("\n"));
  });
}

test("accepts the hardened baseline", () => assert.deepEqual(validate(SOURCE), []));

const cases = [
  ["01 rejects registry agent-count changes", (root) => edit(root, "agents/registry.json", (data) => data.agents.pop()), ["exactly 16 agents"]],
  ["02 rejects non-disabled registry default", (root) => edit(root, "agents/registry.json", (data) => { data.default_execution_status = "enabled"; }), ["default_execution_status must be disabled"]],
  ["03 rejects enabled agent records", (root) => edit(root, "agents/registry.json", (data) => { data.agents[0].execution_status = "enabled"; }), ["execution_status must be disabled"]],
  ["04 rejects duplicate agent IDs", (root) => edit(root, "agents/registry.json", (data) => { data.agents[1].id = data.agents[0].id; }), ["duplicate agent id"]],
  ["05 rejects duplicate agent names", (root) => edit(root, "agents/registry.json", (data) => { data.agents[1].name = data.agents[0].name; }), ["duplicate agent name"]],
  ["06 rejects undeclared agent fields", (root) => edit(root, "agents/registry.json", (data) => { data.agents[0].unexpected = true; }), ["unexpected is not allowed"]],
  ["07 rejects empty assigned-tool arrays", (root) => edit(root, "agents/registry.json", (data) => { data.agents[0].assigned_tools = []; }), ["assigned_tools must not be empty"]],
  ["08 rejects malformed permission arrays", (root) => edit(root, "agents/registry.json", (data) => { data.agents[0].permissions.allowed_actions = "plan"; }), ["allowed_actions must be an array"]],
  ["09 rejects unsupported allowed actions", (root) => edit(root, "agents/registry.json", (data) => { data.agents[0].permissions.allowed_actions = ["unsafe"]; }), ["allowed_actions contains unsupported action unsafe"]],
  ["10 rejects unsupported restricted actions", (root) => edit(root, "agents/registry.json", (data) => { data.agents[0].permissions.restricted_actions = ["unsafe"]; }), ["restricted_actions contains unsupported action unsafe"]],
  ["11 rejects overlapping permission actions", (root) => edit(root, "agents/registry.json", (data) => { data.agents[0].permissions.allowed_actions.push("publishing"); }), ["overlaps allowed and restricted"]],
  ["12 rejects non-owner permission authority", (root) => edit(root, "agents/registry.json", (data) => { data.agents[0].permissions.approval_authority = "agent"; }), ["approval_authority must be owner"]],
  ["13 rejects missing restricted-action mappings", (root) => edit(root, "agents/registry.json", (data) => { delete data.restricted_action_gate_map.publishing; }), ["restricted_action_gate_map.publishing is required"]],
  ["14 rejects restricted actions mapped to unknown gates", (root) => edit(root, "agents/registry.json", (data) => { data.restricted_action_gate_map.publishing = ["unknown_gate"]; }), ["maps to unknown gate unknown_gate"]],
  ["15 rejects missing mandatory gates", (root) => edit(root, "governance/approval-gates.json", (data) => { delete data.gates.data_export; }), ["missing required gate data_export"]],
  ["16 rejects null gate definitions", (root) => edit(root, "governance/approval-gates.json", (data) => { data.gates.publishing = null; }), ["gates.publishing must be an object"]],
  ["17 rejects non-restricted gates", (root) => edit(root, "governance/approval-gates.json", (data) => { data.gates.publishing.restricted = false; }), ["gates.publishing.restricted must be true"]],
  ["18 rejects missing owner authorization requirements", (root) => edit(root, "governance/approval-gates.json", (data) => { data.gates.publishing.owner_authorization_required = false; }), ["owner_authorization_required must be true"]],
  ["19 rejects empty gate evidence requirements", (root) => edit(root, "governance/approval-gates.json", (data) => { data.gates.publishing.evidence_requirements = []; }), ["evidence_requirements must not be empty"]],
  ["20 rejects malformed gate action arrays", (root) => edit(root, "governance/approval-gates.json", (data) => { data.gates.publishing.restricted_actions = "publishing"; }), ["restricted_actions must be an array"]],
  ["21 rejects unknown gate actions", (root) => edit(root, "governance/approval-gates.json", (data) => { data.gates.publishing.restricted_actions = ["unknown_action"]; }), ["restricted_actions contains unsupported action unknown_action"]],
  ["22 rejects undeclared gate fields", (root) => edit(root, "governance/approval-gates.json", (data) => { data.gates.publishing.unexpected = true; }), ["gates.publishing.unexpected is not allowed"]],
  ["23 rejects malformed task IDs", (root) => edit(root, "agents/backlog.json", (data) => { data.tasks[0].id = "BAD"; }), ["id has an invalid format"]],
  ["24 rejects duplicate task IDs", (root) => edit(root, "agents/backlog.json", (data) => { data.tasks[1].id = data.tasks[0].id; }), ["duplicate task id"]],
  ["25 rejects missing task owners", (root) => edit(root, "agents/backlog.json", (data) => { delete data.tasks[0].owner; }), ["owner must identify a registry agent"]],
  ["26 rejects unknown task owners", (root) => edit(root, "agents/backlog.json", (data) => { data.tasks[0].owner = "PP-AG-99"; }), ["owner must identify a registry agent"]],
  ["27 rejects invalid task states", (root) => edit(root, "agents/backlog.json", (data) => { data.tasks[0].status = "done"; }), ["status is invalid"]],
  ["28 rejects non-ISO task timestamps", (root) => edit(root, "agents/backlog.json", (data) => { data.tasks[0].created_at = "October 7, 2026"; }), ["strict UTC ISO-8601 timestamp"]],
  ["29 rejects undeclared task fields", (root) => edit(root, "agents/backlog.json", (data) => { data.tasks[0].unexpected = true; }), ["unexpected is not allowed"]],
  ["30 rejects malformed dependency arrays", (root) => edit(root, "agents/backlog.json", (data) => { data.tasks[0].dependencies = "PP-002"; }), ["dependencies must be an array"]],
  ["31 rejects unknown dependencies", (root) => edit(root, "agents/backlog.json", (data) => { data.tasks[0].dependencies = ["PP-999"]; }), ["depends on unknown task PP-999"]],
  ["32 rejects circular dependencies", (root) => edit(root, "agents/backlog.json", (data) => { task(data, "PP-001").dependencies = ["PP-002"]; }), ["circular dependency detected"]],
  ["33 rejects advancing before prerequisites complete", (root) => edit(root, "agents/backlog.json", (data) => { history(task(data, "PP-002"), "in_progress"); history(task(data, "PP-003"), "in_progress"); }), ["PP-003 cannot be in_progress until dependency PP-002 is complete"]],
  ["34 rejects completed tasks without evidence", (root) => edit(root, "agents/backlog.json", (data) => { const item = task(data, "PP-002"); history(item, "complete"); item.completion_evidence = []; }), ["completion_evidence is required for complete tasks"]],
  ["35 rejects blocked tasks without reasons", (root) => edit(root, "agents/backlog.json", (data) => { delete task(data, "PP-012").blocked_reason; }), ["blocked_reason must be a nonempty string"]],
  ["36 rejects blocked reasons on non-blocked tasks", (root) => edit(root, "agents/backlog.json", (data) => { task(data, "PP-002").blocked_reason = "Invalid fixture"; }), ["blocked_reason is only permitted for blocked tasks"]],
  ["37 rejects restricted tasks with approval disabled", (root) => edit(root, "agents/backlog.json", (data) => { task(data, "PP-008").approval.required = false; }), ["approval.required must be true for restricted actions"]],
  ["38 rejects unknown task approval gates", (root) => edit(root, "agents/backlog.json", (data) => { task(data, "PP-008").approval.gates = ["unknown_gate"]; }), ["approval.gates references unknown gate unknown_gate"]],
  ["39 rejects incomplete multiple-gate task approvals", (root) => edit(root, "agents/backlog.json", (data) => { task(data, "PP-014").approval.gates = ["publishing"]; }), ["approval.gates is missing: affiliate_tracking_changes"]],
  ["40 rejects malformed task approval gate arrays", (root) => edit(root, "agents/backlog.json", (data) => { task(data, "PP-008").approval.gates = "production_configuration"; }), ["approval.gates must be an array"]],
  ["41 rejects invalid state transitions", (root) => edit(root, "agents/backlog.json", (data) => { const item = task(data, "PP-002"); item.status = "awaiting_approval"; item.status_history = [{ from: "created", to: "awaiting_approval", at: TIMESTAMP, reason: "Invalid fixture." }]; item.updated_at = TIMESTAMP; }), ["invalid transition created -> awaiting_approval"]],
  ["42 rejects state-history/current-state mismatch", (root) => edit(root, "agents/backlog.json", (data) => { task(data, "PP-002").status = "planned"; }), ["status_history must end at current status planned"]],
  ["43 rejects status-history timestamp mismatch", (root) => edit(root, "agents/backlog.json", (data) => { task(data, "PP-002").updated_at = "2026-10-08T00:00:00Z"; }), ["updated_at must equal the latest status transition timestamp"]],
  ["44 rejects completed restricted tasks without decisions", (root) => edit(root, "agents/backlog.json", (data) => { const item = task(data, "PP-008"); history(item, "complete"); item.completion_evidence = ["fixture"]; }), ["PP-008 is complete without an active owner decision"]],
  ["45 rejects malformed canonical decision logs", (root) => raw(root, "governance/decision-log.json", "{"), ["cannot read valid JSON"]],
  ["46 rejects decisions referencing unknown gates", (root) => edit(root, "governance/decision-log.json", (data) => { data.entries = [decision({ gate_ids: ["unknown_gate"] })]; }), ["gate_ids references unknown gate unknown_gate"]],
  ["47 rejects decisions without owner approval", (root) => edit(root, "governance/decision-log.json", (data) => { data.entries = [decision({ approver_role: "agent" })]; }), ["approver_role must be owner"]],
  ["48 rejects decisions without evidence", (root) => edit(root, "governance/decision-log.json", (data) => { data.entries = [decision({ evidence: [] })]; }), ["evidence must not be empty"]],
  ["49 rejects incomplete execution-enablement decisions", (root) => edit(root, "governance/decision-log.json", (data) => { data.entries = [decision({ decision_type: "execution_enablement", gate_ids: ["execution_enablement"], agent_id: "PP-AG-01", stop_condition: "Stop now." })]; }), ["tool_allowlist must be an array"]],
  ["50 rejects duplicate partner identity and featured order", (root) => edit(root, "affiliates/partners.json", (data) => { data.partners.push(structuredClone(data.partners[0])); }), ["duplicate partner id", "duplicate partner featured_order"]],
  ["51 rejects insecure or unverified partner destinations", (root) => edit(root, "affiliates/partners.json", (data) => { data.partners[0].landing_page.candidate_url = "http://evil.example/promotional-products/?aid=1056"; data.partners[0].landing_page.verified_hostname = "evil.example"; }), ["candidate_url must use HTTPS", "hostname must be in verified_hostnames"]],
  ["52 rejects affiliate mismatches and invalid activation states", (root) => edit(root, "affiliates/partners.json", (data) => { data.partners[0].landing_page.candidate_url = "https://www.executiveadvertising.com/promotional-products/?aid=999"; data.partners[0].activation_status = "live"; }), ["candidate aid must match affiliate identifier", "activation_status is invalid"]],
  ["53 rejects enabled or publishable unverified partners", (root) => edit(root, "affiliates/partners.json", (data) => { data.partners[0].execution_enabled = true; data.partners[0].publication_allowed = true; }), ["execution_enabled must be false", "publication_allowed must be false while affiliate data is unverified"]]
];

assert.equal(cases.length, 53, "The review regression suite must contain 53 negative cases.");
for (const [name, mutate, expected] of cases) expectErrors(name, mutate, expected);

expectErrors("54 rejects decision expiry at or before its timestamp", (root) => edit(root, "governance/decision-log.json", (data) => {
  data.entries = [decision({ expires_at: "2026-10-07T22:22:35Z" })];
}), ["expires_at must be later than timestamp"]);

expectErrors("55 rejects decisions referencing unknown tasks", (root) => edit(root, "governance/decision-log.json", (data) => {
  data.entries = [decision({ task_id: "PP-999" })];
}), ["task_id references unknown task PP-999"]);

expectErrors("56 rejects owner decisions recorded after task completion", (root) => edit(root, "governance/decision-log.json", (data) => {
  data.entries = [decision({ task_id: "PP-001", gate_ids: ["publishing"] })];
}), ["timestamp postdates completion of PP-001"]);

expectErrors("57 treats a revoked approval as ineffective for partner promotion", (root) => {
  edit(root, "affiliates/partners.json", (data) => promotePartner(data.partners[0]));
  edit(root, "governance/decision-log.json", (data) => {
    data.entries = [
      decision({ task_id: "PP-014", gate_ids: ["publishing", "affiliate_tracking_changes"], timestamp: "2026-10-07T22:25:00Z" }),
      decision({ id: "DEC-101", task_id: "PP-014", gate_ids: ["publishing", "affiliate_tracking_changes"], timestamp: "2026-10-07T22:28:00Z", status: "revoked", revokes_decision_id: "DEC-100", scope: "Revoke fixture authorization." })
    ];
  });
}, ["requires an active owner decision covering publishing and affiliate_tracking_changes"]);

expectErrors("58 rejects partner promotion without both required authorization gates", (root) => {
  edit(root, "affiliates/partners.json", (data) => promotePartner(data.partners[0]));
  edit(root, "governance/decision-log.json", (data) => {
    data.entries = [decision({ task_id: "PP-014", gate_ids: ["affiliate_tracking_changes"], timestamp: "2026-10-07T22:25:00Z" })];
  });
}, ["requires an active owner decision covering publishing and affiliate_tracking_changes"]);

expectErrors("59 rejects duplicate affiliate aid query parameters", (root) => edit(root, "affiliates/partners.json", (data) => {
  data.partners[0].landing_page.candidate_url = "https://www.executiveadvertising.com/promotional-products/?aid=1056&aid=1056";
}), ["candidate URL must contain exactly one aid parameter"]);

expectErrors("60 rejects partner authorization tasks without both required gates", (root) => edit(root, "affiliates/partners.json", (data) => {
  data.partners[0].authorization_task_id = "PP-012";
}), ["authorization_task_id must identify a task requiring publishing and affiliate_tracking_changes gates"]);

expectErrors("61 rejects deployment decisions without an exact target commit SHA", (root) => edit(root, "governance/decision-log.json", (data) => {
  data.entries = [decision({ task_id: "PP-017", gate_ids: ["production_configuration", "deployment"] })];
}), ["target_commit_sha must be a nonempty string"]);

expectErrors("62 rejects deployment decisions without an exact tooling commit SHA", (root) => edit(root, "governance/decision-log.json", (data) => {
  data.entries = [decision({ task_id: "PP-017", gate_ids: ["production_configuration", "deployment"], target_commit_sha: TEST_COMMIT_SHA })];
}), ["tooling_commit_sha must be a nonempty string"]);

test("accepts a valid, active owner decision for partner verification and publication", () => {
  const errors = fixture((root) => {
    edit(root, "affiliates/partners.json", (data) => promotePartner(data.partners[0]));
    edit(root, "governance/decision-log.json", (data) => {
      data.entries = [decision({ task_id: "PP-014", gate_ids: ["publishing", "affiliate_tracking_changes"], timestamp: "2026-10-07T22:25:00Z" })];
    });
  });
  assert.deepEqual(errors, []);
});

test("accepts a valid owner decision before a restricted task completes", () => {
  const errors = fixture((root) => {
    edit(root, "agents/backlog.json", (data) => completeWithEvidence(task(data, "PP-017"), "2026-10-07T22:23:00Z", "2026-10-07T22:24:00Z"));
    edit(root, "governance/decision-log.json", (data) => {
      data.entries = [decision({ task_id: "PP-017", gate_ids: ["production_configuration", "deployment"], timestamp: "2026-10-07T22:23:30Z", target_commit_sha: TEST_COMMIT_SHA, tooling_commit_sha: TEST_COMMIT_SHA })];
    });
  });
  assert.deepEqual(errors, []);
});
