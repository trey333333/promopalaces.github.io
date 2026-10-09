import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { buildPublicSite, validatePublicArtifact } from "../tools/public-artifact-lib.mjs";
import { RESTORATION_TESTS, selectSiteCiSuite } from "../tools/run-site-ci.mjs";
import { REQUIRED_RISK_IDS, validateRestorationAcknowledgement, validateRestorationMode } from "../tools/validate-restoration-mode.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const PACKAGE_ROOT = join(ROOT, "docs", "rollback", "PP-017-historical-site");
const TEMPLATE = JSON.parse(readFileSync(join(PACKAGE_ROOT, "restoration-mode.template.json"), "utf8"));
const MANIFEST = readFileSync(join(PACKAGE_ROOT, "legacy-public-assets.json"));
const MANIFEST_DATA = JSON.parse(MANIFEST);

function temporaryRestorationRepository({ invalid = false } = {}, callback) {
  const root = mkdtempSync(join(tmpdir(), "promopalaces-restoration-ci-"));
  try {
    cpSync(ROOT, root, {
      recursive: true,
      filter(source) {
        const name = source.split(/[\\/]/).at(-1);
        return ![".git", "dist"].includes(name);
      }
    });
    for (const file of MANIFEST_DATA.files) cpSync(join(PACKAGE_ROOT, "source", ...file.split("/")), join(root, ...file.split("/")));
    writeFileSync(join(root, "deployment", "public-assets.json"), MANIFEST);
    const mode = structuredClone(TEMPLATE);
    if (invalid) mode.package.manifest_sha256 = "0".repeat(64);
    writeFileSync(join(root, "deployment", "restoration-mode.json"), JSON.stringify(mode, null, 2) + "\n");
    execFileSync("git", ["-C", root, "init", "-q"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "config", "user.email", "test@example.invalid"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "config", "user.name", "PromoPalaces Test"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "remote", "add", "historical", ROOT], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "fetch", "--quiet", "historical", TEMPLATE.package.historical_source_commit], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "add", "."], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "commit", "-qm", "simulated historical restoration"], { stdio: "ignore" });
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function temporaryInvalidModeRepository(mutator, callback) {
  const root = mkdtempSync(join(tmpdir(), "promopalaces-invalid-restoration-ci-"));
  try {
    mkdirSync(join(root, "deployment"), { recursive: true });
    const mode = structuredClone(TEMPLATE);
    mutator(mode);
    writeFileSync(join(root, "deployment", "restoration-mode.json"), JSON.stringify(mode) + "\n");
    execFileSync("git", ["-C", root, "init", "-q"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "config", "user.email", "test@example.invalid"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "config", "user.name", "PromoPalaces Test"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "add", "."], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "commit", "-qm", "invalid restoration mode"], { stdio: "ignore" });
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeWindowsLineEndings(root, relativePath) {
  const path = join(root, ...relativePath.split("/"));
  const text = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  writeFileSync(path, text.replaceAll("\n", "\r\n"));
  execFileSync("git", ["-C", root, "diff", "--quiet", "HEAD", "--", relativePath], { stdio: "ignore" });
}

test("normal marketplace CI selects every regression test, including strict marketplace checks", () => {
  const suite = selectSiteCiSuite(ROOT);
  assert.equal(suite.mode, "marketplace");
  for (const file of ["marketplace.test.mjs", "homepage-design.test.mjs", "pp-002-corrections.test.mjs", "restoration-mode.test.mjs"]) assert.ok(suite.tests.includes(file), file);
  assert.equal(suite.tests.length, readdirSync(join(ROOT, "tests")).filter((file) => file.endsWith(".test.mjs")).length);
});

test("rejects a restoration mode that repoints the approved historical revision", () => temporaryInvalidModeRepository((mode) => {
  mode.package.historical_source_commit = "0".repeat(40);
}, (root) => {
  assert.throws(() => validateRestorationMode(root), /not the approved historical revision/);
  assert.throws(() => selectSiteCiSuite(root), /not the approved historical revision/);
}));

test("rejects a restoration mode that repoints the approved legacy manifest", () => temporaryInvalidModeRepository((mode) => {
  mode.package.manifest_sha256 = "0".repeat(64);
}, (root) => {
  assert.throws(() => validateRestorationMode(root), /not the approved legacy manifest/);
  assert.throws(() => selectSiteCiSuite(root), /not the approved legacy manifest/);
}));

test("requires the exact owner acknowledgement for a historical restoration deployment", () => {
  const targetCommitSha = "a".repeat(40);
  const restoration = { active: true, target_commit_sha: targetCommitSha };
  const decision = { task_id: "PP-017", target_commit_sha: targetCommitSha };
  assert.throws(() => validateRestorationAcknowledgement(decision, restoration, "PP-017", targetCommitSha), /must be an object/);
  assert.throws(() => validateRestorationAcknowledgement({ ...decision, restoration_acknowledgement: { acknowledged_by: "owner", task_id: "PP-017", target_commit_sha: targetCommitSha, risk_ids: REQUIRED_RISK_IDS.slice(0, 2) } }, restoration, "PP-017", targetCommitSha), /must exactly match/);
  assert.throws(() => validateRestorationAcknowledgement({ ...decision, restoration_acknowledgement: { acknowledged_by: "owner", task_id: "PP-018", target_commit_sha: targetCommitSha, risk_ids: REQUIRED_RISK_IDS } }, restoration, "PP-017", targetCommitSha), /must bind the authorized task ID/);
  assert.doesNotThrow(() => validateRestorationAcknowledgement({ ...decision, restoration_acknowledgement: { acknowledged_by: "owner", task_id: "PP-017", target_commit_sha: targetCommitSha, risk_ids: REQUIRED_RISK_IDS } }, restoration, "PP-017", targetCommitSha));
  assert.match(readFileSync(join(ROOT, "tools", "validate-deployment-authorization.mjs"), "utf8"), /validateRestorationAcknowledgement/);
  assert.match(readFileSync(join(ROOT, "tools", "validate-deployment-authorization.mjs"), "utf8"), /validateRestorationTarget/);
});

test("a legitimate simulated restoration commit passes the complete applicable CI suite", () => temporaryRestorationRepository({}, (root) => {
  const suite = selectSiteCiSuite(root);
  assert.deepEqual(suite, { mode: "historical_restoration", tests: RESTORATION_TESTS });
  assert.ok(!suite.tests.includes("marketplace.test.mjs"));
  assert.ok(!suite.tests.includes("homepage-design.test.mjs"));
  execFileSync(process.execPath, [join(root, "tools", "run-site-ci.mjs"), "--root", root], { cwd: root, stdio: "ignore", timeout: 120000 });
  const artifact = join(root, "legacy-public-site");
  assert.deepEqual(buildPublicSite({ root, artifact }), [...MANIFEST_DATA.files].sort());
  assert.deepEqual(validatePublicArtifact({ root, artifact }), [...MANIFEST_DATA.files].sort());
  assert.ok(!MANIFEST_DATA.files.some((path) => path.startsWith("governance/") || path.startsWith("docs/") || path.startsWith("agents/") || path.startsWith("affiliates/")));
}));

test("validates identical restoration Git blobs from LF and simulated Windows CRLF checkouts", () => temporaryRestorationRepository({}, (root) => {
  const linuxResult = validateRestorationMode(root);
  execFileSync("git", ["-C", root, "config", "core.autocrlf", "true"], { stdio: "ignore" });
  for (const path of [
    "deployment/restoration-mode.json",
    "deployment/public-assets.json",
    "docs/rollback/PP-017-historical-site/legacy-public-assets.json",
    "docs/rollback/PP-017-historical-site/source/about.html"
  ]) writeWindowsLineEndings(root, path);
  const windowsResult = validateRestorationMode(root);
  assert.deepEqual(windowsResult.packageManifest, linuxResult.packageManifest);
  assert.equal(windowsResult.target_commit_sha, linuxResult.target_commit_sha);
}));
