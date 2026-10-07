#!/usr/bin/env node
/** Validate PromoPalaces governance metadata with Node.js built-ins only. */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_ID = /^PP-AG-\d{2}$/;
const TASK_ID = /^PP-\d{3}$/;
const PARTNER_ID = /^[A-Z][A-Z0-9]{1,15}-\d{3}$/;
const DECISION_ID = /^DEC-\d{3,}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const STATUSES = new Set(["planned", "in_progress", "blocked", "awaiting_approval", "complete", "cancelled"]);
const ADVANCED = new Set(["in_progress", "awaiting_approval", "complete"]);
const REQUIRED_GATES = new Set(["publishing", "deployment", "affiliate_applications", "spending", "affiliate_tracking_changes", "production_configuration", "third_party_integrations", "execution_enablement", "external_communication", "data_export"]);
const ACTIVATION_STATUSES = new Set(["development_backlog", "verification_pending", "approved_for_development", "approved_for_publication", "inactive"]);
const TRANSITIONS = {
  created: new Set(["planned", "in_progress", "blocked", "cancelled"]),
  planned: new Set(["in_progress", "blocked", "cancelled"]),
  in_progress: new Set(["awaiting_approval", "blocked", "complete", "cancelled"]),
  awaiting_approval: new Set(["in_progress", "blocked", "complete", "cancelled"]),
  blocked: new Set(["planned", "in_progress", "cancelled"]),
  complete: new Set(),
  cancelled: new Set()
};

function object(value) {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

function load(path, errors) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (!object(value)) {
      errors.push(path + ": top level must be an object");
      return {};
    }
    return value;
  } catch (error) {
    errors.push(path + ": cannot read valid JSON: " + error.message);
    return {};
  }
}

function shape(value, label, required, optional, errors) {
  if (!object(value)) {
    errors.push(label + " must be an object");
    return {};
  }
  const allowed = new Set(required.concat(optional));
  for (const key of required) if (!Object.hasOwn(value, key)) errors.push(label + "." + key + " is required");
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(label + "." + key + " is not allowed");
  return value;
}

function text(value, label, errors, pattern) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(label + " must be a nonempty string");
    return "";
  }
  if (pattern && !pattern.test(value)) errors.push(label + " has an invalid format");
  return value;
}

function bool(value, label, errors, expected) {
  if (typeof value !== "boolean") {
    errors.push(label + " must be a boolean");
    return false;
  }
  if (expected !== undefined && value !== expected) errors.push(label + " must be " + String(expected));
  return value;
}

function strings(value, label, errors, nonempty = true) {
  if (!Array.isArray(value)) {
    errors.push(label + " must be an array");
    return [];
  }
  if (nonempty && value.length === 0) errors.push(label + " must not be empty");
  const seen = new Set();
  value.forEach((item, index) => {
    text(item, label + "[" + index + "]", errors);
    if (seen.has(item)) errors.push(label + " contains duplicate value " + item);
    seen.add(item);
  });
  return value;
}

function timestamp(value, label, errors) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) {
    errors.push(label + " must be a strict UTC ISO-8601 timestamp");
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 19) !== value.slice(0, 19)) {
    errors.push(label + " must be a real UTC date and time");
    return false;
  }
  return true;
}

function sameSet(actual, expected, label, errors) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = [...expectedSet].filter((item) => !actualSet.has(item));
  const extra = [...actualSet].filter((item) => !expectedSet.has(item));
  if (missing.length) errors.push(label + " is missing: " + missing.sort().join(", "));
  if (extra.length) errors.push(label + " has unsupported values: " + extra.sort().join(", "));
}

function registryCheck(registry, errors) {
  shape(registry, "registry", ["schema_version", "organization", "purpose", "default_execution_status", "approval_authority", "allowed_actions_vocabulary", "restricted_actions_vocabulary", "restricted_action_gate_map", "agents"], [], errors);
  text(registry.schema_version, "registry.schema_version", errors, VERSION);
  text(registry.organization, "registry.organization", errors);
  text(registry.purpose, "registry.purpose", errors);
  if (registry.default_execution_status !== "disabled") errors.push("registry.default_execution_status must be disabled");
  if (registry.approval_authority !== "owner") errors.push("registry.approval_authority must be owner");
  const allowed = strings(registry.allowed_actions_vocabulary, "registry.allowed_actions_vocabulary", errors);
  const restricted = strings(registry.restricted_actions_vocabulary, "registry.restricted_actions_vocabulary", errors);
  const allowedSet = new Set(allowed);
  const restrictedSet = new Set(restricted);
  for (const action of allowedSet) if (restrictedSet.has(action)) errors.push("action " + action + " cannot be both allowed and restricted");
  const gateMap = shape(registry.restricted_action_gate_map, "registry.restricted_action_gate_map", restricted, [], errors);
  for (const action of restricted) strings(gateMap[action], "registry.restricted_action_gate_map." + action, errors);

  const agentIds = new Set();
  const agentNames = new Set();
  if (!Array.isArray(registry.agents)) {
    errors.push("registry.agents must be an array");
    return { agentIds, allowedSet, restrictedSet, gateMap };
  }
  if (registry.agents.length !== 16) errors.push("registry must contain exactly 16 agents; found " + registry.agents.length);
  registry.agents.forEach((agent, index) => {
    const label = "registry.agents[" + index + "]";
    agent = shape(agent, label, ["id", "name", "department", "assigned_tools", "priority", "responsibilities", "kpi", "execution_status", "permissions"], [], errors);
    const id = text(agent.id, label + ".id", errors, AGENT_ID);
    const name = text(agent.name, label + ".name", errors);
    if (agentIds.has(id)) errors.push("duplicate agent id: " + id);
    if (agentNames.has(name)) errors.push("duplicate agent name: " + name);
    agentIds.add(id);
    agentNames.add(name);
    text(agent.department, label + ".department", errors);
    strings(agent.assigned_tools, label + ".assigned_tools", errors);
    strings(agent.responsibilities, label + ".responsibilities", errors);
    text(agent.kpi, label + ".kpi", errors);
    if (!PRIORITIES.has(agent.priority)) errors.push(label + ".priority is invalid");
    if (agent.execution_status !== "disabled") errors.push(label + ".execution_status must be disabled");
    const permissions = shape(agent.permissions, label + ".permissions", ["allowed_actions", "restricted_actions", "approval_authority"], [], errors);
    const allowedActions = strings(permissions.allowed_actions, label + ".permissions.allowed_actions", errors);
    const restrictedActions = strings(permissions.restricted_actions, label + ".permissions.restricted_actions", errors);
    if (permissions.approval_authority !== "owner") errors.push(label + ".permissions.approval_authority must be owner");
    for (const action of allowedActions) if (!allowedSet.has(action)) errors.push(label + ".permissions.allowed_actions contains unsupported action " + action);
    for (const action of restrictedActions) if (!restrictedSet.has(action)) errors.push(label + ".permissions.restricted_actions contains unsupported action " + action);
    for (const action of allowedActions) if (restrictedActions.includes(action)) errors.push(label + ".permissions action " + action + " overlaps allowed and restricted");
  });
  return { agentIds, allowedSet, restrictedSet, gateMap };
}

function gateCheck(gates, registry, errors) {
  shape(gates, "approval_gates", ["schema_version", "default_policy", "authorization", "gates"], [], errors);
  text(gates.schema_version, "approval_gates.schema_version", errors, VERSION);
  if (gates.default_policy !== "deny") errors.push("approval_gates.default_policy must be deny");
  const auth = shape(gates.authorization, "approval_gates.authorization", ["required", "record", "no_implied_authorization"], [], errors);
  if (auth.required !== "explicit owner authorization") errors.push("approval_gates.authorization.required must be explicit owner authorization");
  if (auth.record !== "governance/decision-log.json") errors.push("approval_gates.authorization.record must name the canonical decision log");
  bool(auth.no_implied_authorization, "approval_gates.authorization.no_implied_authorization", errors, true);
  if (!object(gates.gates)) {
    errors.push("approval_gates.gates must be an object");
    return new Set();
  }
  const ids = new Set(Object.keys(gates.gates));
  for (const required of REQUIRED_GATES) if (!ids.has(required)) errors.push("approval_gates missing required gate " + required);
  const actionToGate = new Map();
  for (const [id, rawGate] of Object.entries(gates.gates)) {
    const label = "approval_gates.gates." + id;
    const gate = shape(rawGate, label, ["id", "restricted", "owner_authorization_required", "restricted_actions", "evidence_requirements"], [], errors);
    if (gate.id !== id) errors.push(label + ".id must equal " + id);
    bool(gate.restricted, label + ".restricted", errors, true);
    bool(gate.owner_authorization_required, label + ".owner_authorization_required", errors, true);
    const actions = strings(gate.restricted_actions, label + ".restricted_actions", errors);
    strings(gate.evidence_requirements, label + ".evidence_requirements", errors);
    for (const action of actions) {
      if (!registry.restrictedSet.has(action)) errors.push(label + ".restricted_actions contains unsupported action " + action);
      if (actionToGate.has(action)) errors.push("restricted action " + action + " appears in both " + actionToGate.get(action) + " and " + id);
      actionToGate.set(action, id);
    }
  }
  for (const action of registry.restrictedSet) {
    const mapped = registry.gateMap[action];
    if (!Array.isArray(mapped)) continue;
    for (const gateId of mapped) {
      if (!ids.has(gateId)) errors.push("restricted action " + action + " maps to unknown gate " + gateId);
      if (actionToGate.get(action) !== gateId) errors.push("restricted action " + action + " does not map consistently to gate " + gateId);
    }
  }
  return ids;
}

function decisionCheck(log, gateIds, agentIds, errors) {
  shape(log, "decision_log", ["schema_version", "entries"], [], errors);
  text(log.schema_version, "decision_log.schema_version", errors, VERSION);
  if (!Array.isArray(log.entries)) {
    errors.push("decision_log.entries must be an array");
    return [];
  }
  const ids = new Set();
  log.entries.forEach((entry, index) => {
    const label = "decision_log.entries[" + index + "]";
    const optional = ["agent_id", "tool_allowlist", "stop_condition", "revokes_decision_id", "commit_sha"];
    entry = shape(entry, label, ["id", "timestamp", "decision_type", "task_id", "gate_ids", "scope", "approver_role", "evidence", "expires_at", "status"], optional, errors);
    const id = text(entry.id, label + ".id", errors, DECISION_ID);
    if (ids.has(id)) errors.push("duplicate decision id: " + id);
    ids.add(id);
    const hasTimestamp = timestamp(entry.timestamp, label + ".timestamp", errors);
    const hasExpiry = timestamp(entry.expires_at, label + ".expires_at", errors);
    if (hasTimestamp && hasExpiry && entry.expires_at <= entry.timestamp) errors.push(label + ".expires_at must be later than timestamp");
    if (!["owner_authorization", "execution_enablement"].includes(entry.decision_type)) errors.push(label + ".decision_type is invalid");
    text(entry.task_id, label + ".task_id", errors, TASK_ID);
    const gateList = strings(entry.gate_ids, label + ".gate_ids", errors);
    for (const gateId of gateList) if (!gateIds.has(gateId)) errors.push(label + ".gate_ids references unknown gate " + gateId);
    text(entry.scope, label + ".scope", errors);
    if (entry.approver_role !== "owner") errors.push(label + ".approver_role must be owner");
    strings(entry.evidence, label + ".evidence", errors);
    if (!["approved", "revoked"].includes(entry.status)) errors.push(label + ".status is invalid");
    if (entry.status === "revoked") text(entry.revokes_decision_id, label + ".revokes_decision_id", errors, DECISION_ID);
    else if (Object.hasOwn(entry, "revokes_decision_id")) errors.push(label + ".revokes_decision_id is only valid for revoked decisions");
    const deploymentAuthorization = entry.status === "approved" && entry.decision_type === "owner_authorization" && gateList.includes("deployment");
    if (deploymentAuthorization) text(entry.commit_sha, label + ".commit_sha", errors, COMMIT_SHA);
    else if (Object.hasOwn(entry, "commit_sha")) errors.push(label + ".commit_sha is only valid for approved owner_authorization decisions covering deployment");
    if (entry.decision_type === "execution_enablement") {
      const agent = text(entry.agent_id, label + ".agent_id", errors, AGENT_ID);
      if (!agentIds.has(agent)) errors.push(label + ".agent_id must identify a registry agent");
      strings(entry.tool_allowlist, label + ".tool_allowlist", errors);
      text(entry.stop_condition, label + ".stop_condition", errors);
      if (!gateList.includes("execution_enablement")) errors.push(label + ".gate_ids must include execution_enablement");
    } else {
      for (const key of ["agent_id", "tool_allowlist", "stop_condition"]) if (Object.hasOwn(entry, key)) errors.push(label + "." + key + " is only valid for execution_enablement decisions");
    }
  });
  return log.entries;
}

function taskHistory(history, current, label, errors) {
  if (!Array.isArray(history) || history.length === 0) {
    errors.push(label + ".status_history must be a nonempty array");
    return "";
  }
  let previous = "created";
  let lastAt = "";
  history.forEach((event, index) => {
    const eventLabel = label + ".status_history[" + index + "]";
    event = shape(event, eventLabel, ["from", "to", "at", "reason"], [], errors);
    if (event.from !== previous) errors.push(eventLabel + ".from must be " + previous);
    if (!STATUSES.has(event.to)) errors.push(eventLabel + ".to is invalid");
    if (!TRANSITIONS[previous]?.has(event.to)) errors.push(eventLabel + " has invalid transition " + previous + " -> " + event.to);
    timestamp(event.at, eventLabel + ".at", errors);
    text(event.reason, eventLabel + ".reason", errors);
    if (lastAt && typeof event.at === "string" && event.at < lastAt) errors.push(eventLabel + ".at must not move backward");
    previous = event.to;
    lastAt = event.at;
  });
  if (previous !== current) errors.push(label + ".status_history must end at current status " + current);
  return lastAt;
}

function activeDecision(entries, taskId, gates, at) {
  const required = new Set(gates);
  return entries.some((entry) => entry.status === "approved"
    && entry.approver_role === "owner"
    && entry.task_id === taskId
    && entry.timestamp <= at
    && entry.expires_at >= at
    && [...required].every((gate) => entry.gate_ids.includes(gate))
    && !entries.some((revocation) => revocation.status === "revoked"
      && revocation.revokes_decision_id === entry.id
      && revocation.timestamp <= at));
}

function backlogCheck(backlog, registry, gateIds, errors) {
  shape(backlog, "backlog", ["schema_version", "updated_at", "allowed_statuses", "tasks"], [], errors);
  text(backlog.schema_version, "backlog.schema_version", errors, VERSION);
  timestamp(backlog.updated_at, "backlog.updated_at", errors);
  sameSet(strings(backlog.allowed_statuses, "backlog.allowed_statuses", errors), STATUSES, "backlog.allowed_statuses", errors);
  if (!Array.isArray(backlog.tasks)) {
    errors.push("backlog.tasks must be an array");
    return;
  }
  const tasks = new Map();
  backlog.tasks.forEach((task, index) => {
    const label = "backlog.tasks[" + index + "]";
    task = shape(task, label, ["id", "title", "owner", "priority", "dependencies", "status", "status_history", "acceptance_criteria", "planning_references", "completion_evidence", "restricted_actions", "approval", "created_at", "updated_at"], ["blocked_reason"], errors);
    const id = text(task.id, label + ".id", errors, TASK_ID);
    if (tasks.has(id)) errors.push("duplicate task id: " + id);
    tasks.set(id, task);
    text(task.title, label + ".title", errors);
    if (!registry.agentIds.has(task.owner)) errors.push(label + ".owner must identify a registry agent");
    if (!PRIORITIES.has(task.priority)) errors.push(label + ".priority is invalid");
    const dependencies = strings(task.dependencies, label + ".dependencies", errors, false);
    if (dependencies.includes(id)) errors.push(label + ".dependencies cannot include itself");
    if (!STATUSES.has(task.status)) errors.push(label + ".status is invalid");
    const historyAt = taskHistory(task.status_history, task.status, label, errors);
    strings(task.acceptance_criteria, label + ".acceptance_criteria", errors);
    strings(task.planning_references, label + ".planning_references", errors);
    const evidence = strings(task.completion_evidence, label + ".completion_evidence", errors, false);
    if (task.status === "complete" && evidence.length === 0) errors.push(label + ".completion_evidence is required for complete tasks");
    if (task.status === "blocked") text(task.blocked_reason, label + ".blocked_reason", errors);
    else if (Object.hasOwn(task, "blocked_reason")) errors.push(label + ".blocked_reason is only permitted for blocked tasks");
    const actions = strings(task.restricted_actions, label + ".restricted_actions", errors, false);
    for (const action of actions) if (!registry.restrictedSet.has(action)) errors.push(label + ".restricted_actions contains unsupported action " + action);
    const approval = shape(task.approval, label + ".approval", ["required", "authority", "gates"], [], errors);
    bool(approval.required, label + ".approval.required", errors);
    if (approval.authority !== "owner") errors.push(label + ".approval.authority must be owner");
    const approvalGates = strings(approval.gates, label + ".approval.gates", errors, false);
    for (const gateId of approvalGates) if (!gateIds.has(gateId)) errors.push(label + ".approval.gates references unknown gate " + gateId);
    const expected = [...new Set(actions.flatMap((action) => registry.gateMap[action] ?? []))];
    if (actions.length === 0) {
      if (approval.required !== false) errors.push(label + ".approval.required must be false without restricted actions");
      if (approvalGates.length !== 0) errors.push(label + ".approval.gates must be empty without restricted actions");
    } else {
      if (approval.required !== true) errors.push(label + ".approval.required must be true for restricted actions");
      sameSet(approvalGates, expected, label + ".approval.gates", errors);
    }
    timestamp(task.created_at, label + ".created_at", errors);
    timestamp(task.updated_at, label + ".updated_at", errors);
    if (typeof task.created_at === "string" && typeof task.updated_at === "string" && task.updated_at < task.created_at) errors.push(label + ".updated_at must not precede created_at");
    if (historyAt && task.updated_at !== historyAt) errors.push(label + ".updated_at must equal the latest status transition timestamp");
  });
  for (const [id, task] of tasks) for (const dependency of task.dependencies ?? []) if (!tasks.has(dependency)) errors.push(id + " depends on unknown task " + dependency);
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) {
      errors.push("circular dependency detected at " + id);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of tasks.get(id)?.dependencies ?? []) if (tasks.has(dependency)) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of tasks.keys()) visit(id);
  for (const [id, task] of tasks) {
    if (ADVANCED.has(task.status)) for (const dependency of task.dependencies) if (tasks.get(dependency)?.status !== "complete") errors.push(id + " cannot be " + task.status + " until dependency " + dependency + " is complete");
  }
  const blankAidTask = tasks.get("PP-016");
  if (!blankAidTask || blankAidTask.priority !== "P0" || !blankAidTask.restricted_actions?.includes("affiliate_tracking_changes")) errors.push("backlog must contain P0 task PP-016 for the blank affiliate aid parameter");
  return tasks;
}

function decisionTaskCheck(entries, tasks, errors) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  entries.forEach((entry, index) => {
    const label = "decision_log.entries[" + index + "]";
    const task = tasks.get(entry.task_id);
    if (!task) {
      errors.push(label + ".task_id references unknown task " + entry.task_id);
      return;
    }
    if (entry.timestamp < task.created_at) errors.push(label + ".timestamp must not predate task creation");
    if (entry.status === "approved" && task.status === "complete" && entry.timestamp > task.updated_at) errors.push(label + ".timestamp postdates completion of " + task.id);
    if (entry.status === "revoked") {
      const target = byId.get(entry.revokes_decision_id);
      if (!target) errors.push(label + ".revokes_decision_id references unknown decision " + entry.revokes_decision_id);
      else {
        if (target.status !== "approved") errors.push(label + ".revokes_decision_id must reference an approved decision");
        if (target.task_id !== entry.task_id) errors.push(label + ".revokes_decision_id must reference a decision for the same task");
        if (entry.timestamp < target.timestamp) errors.push(label + ".timestamp must not predate the revoked decision");
      }
    }
  });
}

function completionAuthorizationCheck(tasks, decisions, errors) {
  for (const [id, task] of tasks) {
    if (task.status === "complete" && task.restricted_actions.length > 0 && !activeDecision(decisions, id, task.approval.gates, task.updated_at)) {
      errors.push(id + " is complete without an active owner decision for all required gates");
    }
  }
}

function partnerCheck(registry, partners, gateIds, decisions, tasks, errors) {
  shape(partners, "partners", ["schema_version", "permitted_activation_statuses", "verified_hostnames", "partners"], [], errors);
  text(partners.schema_version, "partners.schema_version", errors, VERSION);
  sameSet(strings(partners.permitted_activation_statuses, "partners.permitted_activation_statuses", errors), ACTIVATION_STATUSES, "partners.permitted_activation_statuses", errors);
  const hosts = strings(partners.verified_hostnames, "partners.verified_hostnames", errors);
  for (const host of hosts) if (!/^[a-z0-9.-]+$/i.test(host)) errors.push("partners.verified_hostnames contains invalid hostname " + host);
  if (!Array.isArray(partners.partners)) {
    errors.push("partners.partners must be an array");
    return;
  }
  const ids = new Set();
  const orders = new Set();
  partners.partners.forEach((partner, index) => {
    const label = "partners.partners[" + index + "]";
    partner = shape(partner, label, ["id", "name", "featured_order", "activation_status", "execution_enabled", "relationship_status", "affiliate_identifier", "customer_offer", "landing_page", "tracking_plan_status", "affiliate_disclosure", "publication_allowed", "approval_gate_actions", "authorization_task_id", "planning_reference"], ["promotion_authorization_at"], errors);
    const id = text(partner.id, label + ".id", errors, PARTNER_ID);
    if (ids.has(id)) errors.push("duplicate partner id: " + id);
    ids.add(id);
    text(partner.name, label + ".name", errors);
    if (!Number.isInteger(partner.featured_order) || partner.featured_order < 1) errors.push(label + ".featured_order must be a positive integer");
    if (orders.has(partner.featured_order)) errors.push("duplicate partner featured_order: " + partner.featured_order);
    orders.add(partner.featured_order);
    if (!ACTIVATION_STATUSES.has(partner.activation_status)) errors.push(label + ".activation_status is invalid");
    bool(partner.execution_enabled, label + ".execution_enabled", errors, false);
    text(partner.relationship_status, label + ".relationship_status", errors);
    const affiliate = shape(partner.affiliate_identifier, label + ".affiliate_identifier", ["value", "source", "verification_status"], [], errors);
    const affiliateId = text(affiliate.value, label + ".affiliate_identifier.value", errors, /^\d+$/);
    text(affiliate.source, label + ".affiliate_identifier.source", errors);
    if (!["verified", "unverified"].includes(affiliate.verification_status)) errors.push(label + ".affiliate_identifier.verification_status is invalid");
    const offer = shape(partner.customer_offer, label + ".customer_offer", ["coupon_code", "offer_text", "usage_limit", "source", "verification_status"], [], errors);
    text(offer.coupon_code, label + ".customer_offer.coupon_code", errors);
    text(offer.offer_text, label + ".customer_offer.offer_text", errors);
    text(offer.usage_limit, label + ".customer_offer.usage_limit", errors);
    text(offer.source, label + ".customer_offer.source", errors);
    if (!["verified", "unverified"].includes(offer.verification_status)) errors.push(label + ".customer_offer.verification_status is invalid");
    const landing = shape(partner.landing_page, label + ".landing_page", ["candidate_url", "verified_hostname", "url_reachability", "affiliate_attribution_status", "verification_requirement"], [], errors);
    const candidate = text(landing.candidate_url, label + ".landing_page.candidate_url", errors);
    try {
      const url = new URL(candidate);
      if (url.protocol !== "https:") errors.push(label + ".landing_page.candidate_url must use HTTPS");
      if (url.hostname !== landing.verified_hostname) errors.push(label + ".landing_page.verified_hostname must match candidate URL hostname");
      if (!hosts.includes(url.hostname)) errors.push(label + ".landing_page hostname must be in verified_hostnames");
      const aidValues = url.searchParams.getAll("aid");
      if (aidValues.length !== 1) errors.push(label + ".landing_page candidate URL must contain exactly one aid parameter");
      else if (aidValues[0] !== affiliateId) errors.push(label + ".landing_page candidate aid must match affiliate identifier");
    } catch {
      errors.push(label + ".landing_page.candidate_url must be a valid URL");
    }
    text(landing.verified_hostname, label + ".landing_page.verified_hostname", errors);
    const reachability = shape(landing.url_reachability, label + ".landing_page.url_reachability", ["status", "method", "observed_status", "verified_at"], [], errors);
    if (!["verified_reachable", "unverified"].includes(reachability.status)) errors.push(label + ".landing_page.url_reachability.status is invalid");
    text(reachability.method, label + ".landing_page.url_reachability.method", errors);
    if (!Number.isInteger(reachability.observed_status) || reachability.observed_status < 100 || reachability.observed_status > 599) errors.push(label + ".landing_page.url_reachability.observed_status must be an HTTP status");
    timestamp(reachability.verified_at, label + ".landing_page.url_reachability.verified_at", errors);
    if (!["verified", "unverified"].includes(landing.affiliate_attribution_status)) errors.push(label + ".landing_page.affiliate_attribution_status is invalid");
    text(landing.verification_requirement, label + ".landing_page.verification_requirement", errors);
    if (!["planned_only", "configured"].includes(partner.tracking_plan_status)) errors.push(label + ".tracking_plan_status is invalid");
    const disclosure = shape(partner.affiliate_disclosure, label + ".affiliate_disclosure", ["required", "text"], [], errors);
    bool(disclosure.required, label + ".affiliate_disclosure.required", errors, true);
    text(disclosure.text, label + ".affiliate_disclosure.text", errors);
    bool(partner.publication_allowed, label + ".publication_allowed", errors);
    const actions = strings(partner.approval_gate_actions, label + ".approval_gate_actions", errors);
    for (const action of actions) {
      if (!registry.restrictedSet.has(action)) errors.push(label + ".approval_gate_actions contains unsupported action " + action);
      for (const gateId of registry.gateMap[action] ?? []) if (!gateIds.has(gateId)) errors.push(label + ".approval_gate_actions maps to unknown gate " + gateId);
    }
    const authorizationTaskId = text(partner.authorization_task_id, label + ".authorization_task_id", errors, TASK_ID);
    const authorizationTask = tasks.get(authorizationTaskId);
    if (!authorizationTask) errors.push(label + ".authorization_task_id must identify a backlog task");
    else if (!authorizationTask.approval?.gates?.includes("publishing") || !authorizationTask.approval?.gates?.includes("affiliate_tracking_changes")) {
      errors.push(label + ".authorization_task_id must identify a task requiring publishing and affiliate_tracking_changes gates");
    }
    text(partner.planning_reference, label + ".planning_reference", errors);
    const unverified = affiliate.verification_status !== "verified" || offer.verification_status !== "verified" || landing.affiliate_attribution_status !== "verified";
    if (unverified && partner.publication_allowed !== false) errors.push(label + ".publication_allowed must be false while affiliate data is unverified");
    if (unverified && partner.activation_status === "approved_for_publication") errors.push(label + ".activation_status cannot be approved_for_publication while affiliate data is unverified");
    const promotionEnabled = partner.publication_allowed === true
      || partner.activation_status === "approved_for_development"
      || partner.activation_status === "approved_for_publication"
      || !unverified;
    if (promotionEnabled) {
      if (!timestamp(partner.promotion_authorization_at, label + ".promotion_authorization_at", errors)) return;
      if (!activeDecision(decisions, authorizationTaskId, ["publishing", "affiliate_tracking_changes"], partner.promotion_authorization_at)) {
        errors.push(label + " requires an active owner decision covering publishing and affiliate_tracking_changes before promotion or verification is enabled");
      }
    } else if (Object.hasOwn(partner, "promotion_authorization_at")) {
      errors.push(label + ".promotion_authorization_at is only permitted when promotion or verification is enabled");
    }
  });
}

export function validate(root) {
  const errors = [];
  const registry = load(resolve(root, "agents/registry.json"), errors);
  const gates = load(resolve(root, "governance/approval-gates.json"), errors);
  const decisions = load(resolve(root, "governance/decision-log.json"), errors);
  const backlog = load(resolve(root, "agents/backlog.json"), errors);
  const partners = load(resolve(root, "affiliates/partners.json"), errors);
  const registryState = registryCheck(registry, errors);
  const gateIds = gateCheck(gates, registryState, errors);
  const decisionEntries = decisionCheck(decisions, gateIds, registryState.agentIds, errors);
  const tasks = backlogCheck(backlog, registryState, gateIds, errors) ?? new Map();
  decisionTaskCheck(decisionEntries, tasks, errors);
  completionAuthorizationCheck(tasks, decisionEntries, errors);
  partnerCheck(registryState, partners, gateIds, decisionEntries, tasks, errors);
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = dirname(fileURLToPath(import.meta.url));
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex >= 0 ? resolve(process.argv[rootIndex + 1] ?? "") : resolve(directory, "..");
  const errors = validate(root);
  if (errors.length) {
    console.error("Orchestration validation failed:");
    errors.forEach((error) => console.error("- " + error));
    process.exitCode = 1;
  } else {
    console.log("Orchestration validation passed: strict registry, backlog, gates, decision log, and partner controls are valid.");
  }
}
