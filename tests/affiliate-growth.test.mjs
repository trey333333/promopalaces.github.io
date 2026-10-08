import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const ROOT = resolve(import.meta.dirname, "..");
const PARTNERS = JSON.parse(readFileSync(join(ROOT, "affiliates", "partners.json"), "utf8"));
const RESEARCH = JSON.parse(readFileSync(join(ROOT, "affiliates", "research-backlog.json"), "utf8"));
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "deployment", "public-assets.json"), "utf8"));
const CONFIG_SOURCE = readFileSync(join(ROOT, "assets", "js", "marketplace-config.js"), "utf8");

function departmentIds() {
  const sandbox = { window: {} };
  vm.runInNewContext(CONFIG_SOURCE, sandbox);
  return sandbox.window.PromoPalacesMarketplace.departments.map((department) => department.id);
}

function publicText() {
  const readableExtensions = new Set([".html", ".js", ".css", ".xml", ".txt"]);
  return MANIFEST.files
    .filter((file) => readableExtensions.has(extname(file)))
    .map((file) => readFileSync(join(ROOT, file), "utf8"))
    .join("\n");
}

test("keeps the hardened partner registry Executive Advertising-only", () => {
  assert.equal(PARTNERS.partners.length, 1);
  const [ea] = PARTNERS.partners;
  assert.equal(ea.id, "EA-001");
  assert.equal(ea.name, "Executive Advertising");
  assert.equal(ea.affiliate_identifier.value, "1056");
  assert.equal(ea.execution_enabled, false);
  assert.equal(ea.publication_allowed, false);
  assert.deepEqual(RESEARCH.exclusive_department_policy, {
    department_id: "promotional-products",
    policy: "Executive Advertising (EA-001, affiliate ID 1056) remains the only permitted promotional merchandise affiliate. This research backlog must not add or research a competing promotional merchandise referral.",
    source: "affiliates/partners.json and assets/js/marketplace-config.js"
  });
});

test("covers every configured department without treating research as partner approval", () => {
  const configured = departmentIds();
  assert.equal(configured.length, 16);
  assert.deepEqual([...RESEARCH.department_backlog.map((entry) => entry.department_id)].sort(), [...configured].sort());
  assert.equal(new Set(RESEARCH.department_backlog.map((entry) => entry.department_id)).size, 16);
  for (const entry of RESEARCH.department_backlog) {
    assert.match(entry.launch_criteria, /\S/);
  }
  assert.deepEqual(RESEARCH.workflow, [
    "candidate", "researched", "application_approved_by_owner", "applied", "accepted", "tracking_verified", "publication_approved"
  ]);
});

test("requires all researched candidates to remain inactive and publication-prohibited", () => {
  assert.equal(RESEARCH.publication_prohibition.public_links_allowed, false);
  assert.equal(RESEARCH.publication_prohibition.affiliate_identifiers_allowed, false);
  assert.equal(RESEARCH.publication_prohibition.tracking_changes_allowed, false);
  for (const candidate of RESEARCH.candidates) {
    assert.equal(candidate.research_status, "researched", candidate.id);
    assert.equal(candidate.approval_status, "not_approved", candidate.id);
    assert.equal(candidate.application_status, "not_applied", candidate.id);
    assert.equal(candidate.tracking_status, "not_available", candidate.id);
    assert.equal(candidate.publication_status, "prohibited", candidate.id);
    assert.equal(candidate.execution_enabled, false, candidate.id);
    assert.equal(candidate.tracking_identifier.value, null, candidate.id);
    assert.equal(candidate.tracking_identifier.status, "not_assigned", candidate.id);
    assert.equal(candidate.next_required_transition, "application_approved_by_owner", candidate.id);
    assert.equal(candidate.required_gate, "affiliate_applications", candidate.id);
    assert.match(candidate.application_entry_url, /^https:\/\//, candidate.id);
    assert.match(candidate.published_terms.commission, /\S/, candidate.id);
    assert.match(candidate.published_terms.cookie, /\S/, candidate.id);
    assert.ok(candidate.published_terms.restrictions.length > 0, candidate.id);
    assert.ok(candidate.published_terms.source_urls.every((url) => /^https:\/\//.test(url)), candidate.id);
    assert.match(candidate.published_terms.verified_at, /^2026-10-08$/, candidate.id);
  }
});

test("prioritizes the requested four and researches the requested complementary coverage", () => {
  const byId = new Map(RESEARCH.candidates.map((candidate) => [candidate.id, candidate]));
  assert.deepEqual(
    RESEARCH.candidates.filter((candidate) => candidate.priority === "P0").map((candidate) => candidate.id),
    ["ARC-GETRESPONSE-001", "ARC-HOSTINGER-001", "ARC-SHOPIFY-001", "ARC-SEMRUSH-001"]
  );
  for (const [id, department] of [
    ["ARC-HUBSPOT-001", "sales-crm"],
    ["ARC-FRESHBOOKS-001", "accounting-finance"],
    ["ARC-ADOBE-001", "branding-design"],
    ["ARC-MAKE-001", "ai-automation"],
    ["ARC-ZENBUSINESS-001", "business-services"]
  ]) assert.ok(byId.get(id).department_ids.includes(department), id);
});

test("prevents researched candidates and application destinations from entering public assets", () => {
  const content = publicText();
  for (const candidate of RESEARCH.candidates) {
    const applicationHost = new URL(candidate.application_entry_url).hostname.replace(/^www\./, "");
    assert.doesNotMatch(content, new RegExp(applicationHost.replaceAll(".", "\\."), "i"), candidate.id + " application host leaked into public artifact source");
    assert.doesNotMatch(content, new RegExp(candidate.id, "i"), candidate.id + " research record leaked into public artifact source");
  }
  assert.doesNotMatch(content, /research-backlog\.json|PP-003-owner-application-packets|PP-003-partner-onboarding/i);
});

test("keeps owner packets and onboarding documentation evidence-based", () => {
  const packets = readFileSync(join(ROOT, "docs", "affiliate", "PP-003-owner-application-packets.md"), "utf8");
  const onboarding = readFileSync(join(ROOT, "docs", "affiliate", "PP-003-partner-onboarding.md"), "utf8");
  for (const name of ["GetResponse", "Hostinger", "Shopify", "Semrush"]) assert.match(packets, new RegExp(name));
  assert.match(packets, /not applications/i);
  assert.match(packets, /affiliate_applications/);
  for (const stage of RESEARCH.workflow) assert.match(onboarding, new RegExp(stage.replaceAll("_", " "), "i"));
  assert.match(onboarding, /Executive Advertising remains the sole permitted promotional merchandise affiliate/i);
});
