import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const CI_WORKFLOW = readFileSync(join(ROOT, ".github", "workflows", "validate-site.yml"), "utf8");
const DEPLOY_WORKFLOW = readFileSync(join(ROOT, ".github", "workflows", "deploy-pages.yml"), "utf8");

test("CI validates pull requests to main, main pushes, and manual troubleshooting runs", () => {
  assert.match(CI_WORKFLOW, /^name: PromoPalaces CI\r?$/m);
  assert.match(CI_WORKFLOW, /^  pull_request:\r?\n    branches: \[main\]$/m);
  assert.match(CI_WORKFLOW, /^  push:\r?\n    branches: \[main\]$/m);
  assert.match(CI_WORKFLOW, /^  workflow_dispatch:\r?$/m);
  assert.doesNotMatch(CI_WORKFLOW, /pull_request_target/);
});

test("CI exposes the stable read-only PromoPalaces CI / validate status check", () => {
  assert.match(CI_WORKFLOW, /^jobs:\r?\n  validate:\r?\n    name: validate$/m);
  assert.match(CI_WORKFLOW, /^permissions:\r?\n  contents: read\r?\n\r?\njobs:/m);
  assert.equal((CI_WORKFLOW.match(/^\s*permissions:/gm) ?? []).length, 1);
  assert.doesNotMatch(CI_WORKFLOW, /(?:pages:\s*write|id-token:\s*write|secrets\.|environment:)/);
  assert.doesNotMatch(CI_WORKFLOW, /(?:deploy-pages|upload-pages-artifact|actions\/upload-artifact)/);
  assert.doesNotMatch(CI_WORKFLOW, /\b(?:deploy|publish)\b/i);
});

test("CI checks out the triggering revision without persisted credentials using pinned actions", () => {
  assert.match(CI_WORKFLOW, /uses: actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(CI_WORKFLOW, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(CI_WORKFLOW, /fetch-depth: 0/);
  assert.match(CI_WORKFLOW, /persist-credentials: false/);
  assert.match(CI_WORKFLOW, /uses: actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.match(CI_WORKFLOW, /node-version: 22/);
});

test("CI validates restoration mode, runs the applicable regression suite, and validates public artifacts without publication", () => {
  assert.match(CI_WORKFLOW, /run: node tools\/validate-orchestrator\.mjs/);
  assert.match(CI_WORKFLOW, /run: node tools\/validate-restoration-mode\.mjs/);
  assert.match(CI_WORKFLOW, /run: node tools\/run-site-ci\.mjs/);
  assert.match(CI_WORKFLOW, /run: node tools\/build-public-site\.mjs --artifact dist/);
  assert.match(CI_WORKFLOW, /run: node tools\/validate-public-artifact\.mjs --artifact dist/);
  for (const internalPath of ["agents", "affiliates", "governance", "tests", "tools", "docs", "deployment", "AGENTS.md"]) {
    assert.match(CI_WORKFLOW, new RegExp("test ! -e dist/" + internalPath.replace(".", "\\.")));
  }
});

test("CI remains separate from the protected manual deployment workflow", () => {
  assert.match(DEPLOY_WORKFLOW, /^on:\r?\n  workflow_dispatch:/m);
  assert.doesNotMatch(DEPLOY_WORKFLOW, /^\s*(?:pull_request|push):/m);
  assert.match(DEPLOY_WORKFLOW, /environment:\r?\n      name: github-pages/);
  assert.match(DEPLOY_WORKFLOW, /uses: actions\/deploy-pages@[0-9a-f]{40}/);
});
