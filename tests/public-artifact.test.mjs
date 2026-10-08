import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { buildPublicSite, FORBIDDEN_PUBLIC_FILENAMES, FORBIDDEN_PUBLIC_PATHS, validatePublicArtifact } from "../tools/public-artifact-lib.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "deployment/public-assets.json"), "utf8"));
const WORKFLOW = readFileSync(join(ROOT, ".github", "workflows", "deploy-pages.yml"), "utf8");

function temporaryArtifact(callback) {
  const directory = mkdtempSync(join(tmpdir(), "promopalaces-public-artifact-"));
  const artifact = join(directory, "artifact");
  try {
    return callback(artifact);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function temporaryManifest(callback) {
  const root = mkdtempSync(join(tmpdir(), "promopalaces-public-manifest-"));
  try {
    mkdirSync(join(root, "deployment"), { recursive: true });
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function initializeGitRepository(root) {
  execFileSync("git", ["-C", root, "init", "-q"], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "config", "user.email", "test@example.invalid"], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "config", "user.name", "PromoPalaces Test"], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "add", "."], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "commit", "-qm", "fixture"], { stdio: "ignore" });
}

test("builds exactly the approved public artifact", () => temporaryArtifact((artifact) => {
  const actual = buildPublicSite({ root: ROOT, artifact, allowExternalArtifact: true });
  assert.deepEqual(actual, [...MANIFEST.files].sort());
  assert.deepEqual(validatePublicArtifact({ root: ROOT, artifact }), [...MANIFEST.files].sort());
  assert.deepEqual(readFileSync(join(artifact, "CNAME")), readFileSync(join(ROOT, "CNAME")));
}));

test("rejects internal files injected into a public artifact", () => temporaryArtifact((artifact) => {
  buildPublicSite({ root: ROOT, artifact, allowExternalArtifact: true });
  mkdirSync(join(artifact, "governance"), { recursive: true });
  writeFileSync(join(artifact, "governance", "decision-log.json"), "{}");
  assert.throws(
    () => validatePublicArtifact({ root: ROOT, artifact }),
    /internal path segment governance: governance\/decision-log\.json/
  );
}));

test("does not allow internal paths in the public manifest", () => {
  for (const forbidden of FORBIDDEN_PUBLIC_PATHS) {
    assert.ok(!MANIFEST.files.some((path) => path === forbidden || path.startsWith(forbidden + "/")), "Manifest exposes internal path " + forbidden);
  }
  for (const forbidden of FORBIDDEN_PUBLIC_FILENAMES) {
    assert.ok(!MANIFEST.files.some((path) => path.toLowerCase() === forbidden), "Manifest exposes internal filename " + forbidden);
  }
});

test("rejects hidden and copied internal paths in the public manifest", () => {
  for (const path of [".env", "archive/governance/decision-log.json", "public/decision-log.json"]) {
    temporaryManifest((root) => {
      writeFileSync(join(root, "deployment", "public-assets.json"), JSON.stringify({ schema_version: "1.0.0", files: [path] }));
      assert.throws(() => buildPublicSite({ root, artifact: join(root, "dist") }), /Public asset manifest cannot include/);
    });
  }
});

test("does not permit a local build to overwrite source or internal directories", () => {
  assert.throws(() => buildPublicSite({ root: ROOT, artifact: join(ROOT, "images") }), /cannot overlap a source or internal repository path/);
  assert.throws(() => buildPublicSite({ root: ROOT, artifact: resolve(ROOT, "..", "outside-artifact") }), /must be a non-source directory inside the repository/);
});

test("keeps Pages deployment manual, target-bound, and environment-protected", () => {
  assert.match(WORKFLOW, /^on:\r?\n  workflow_dispatch:/m);
  assert.doesNotMatch(WORKFLOW, /^\s*(?:push|pull_request):/m);
  assert.match(WORKFLOW, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(WORKFLOW, /environment:\r?\n      name: github-pages/);
  assert.match(WORKFLOW, /validate-deployment-authorization\.mjs/);
  assert.match(WORKFLOW, /validate-deployment-history\.mjs/);
  assert.match(WORKFLOW, /target_commit_sha:/);
  assert.match(WORKFLOW, /tooling_commit_sha:/);
  assert.match(WORKFLOW, new RegExp("CONTROL_COMMIT_SHA: " + "\\$\\{\\{ github\\.sha \\}\\}"));
  assert.match(WORKFLOW, /--target-commit-sha "\$TARGET_COMMIT_SHA"/);
  assert.match(WORKFLOW, /--tooling-commit-sha "\$TOOLING_COMMIT_SHA"/);
  assert.match(WORKFLOW, /--control-commit-sha "\$CONTROL_COMMIT_SHA"/);
  assert.match(WORKFLOW, /path: release-tooling/);
  assert.match(WORKFLOW, /path: release-tooling\/release-source/);
  assert.match(WORKFLOW, /git -C release-tooling rev-parse HEAD/);
  assert.match(WORKFLOW, /git -C release-tooling\/release-source rev-parse HEAD/);
  assert.match(WORKFLOW, /working-directory: release-tooling\r?\n        env:\r?\n          TARGET_COMMIT_SHA: \$\{\{ inputs\.target_commit_sha \}\}\r?\n        run: node tools\/build-public-site\.mjs --source-root release-source --artifact public-site --expected-commit-sha "\$TARGET_COMMIT_SHA"/);
  const toolingIntegrityCommands = [...WORKFLOW.matchAll(/git(?: -C release-control)? diff --exit-code [^\r\n]+/g)].map((match) => match[0]);
  assert.equal(toolingIntegrityCommands.length, 2);
  for (const command of toolingIntegrityCommands) {
    assert.match(command, /tools\/validate-orchestrator\.mjs/);
    assert.match(command, /tools\/validate-deployment-authorization\.mjs/);
  }
  assert.match(WORKFLOW, /tools\/build-public-site\.mjs --source-root release-source --artifact public-site/);
  assert.match(WORKFLOW, /tools\/validate-public-artifact\.mjs --source-root release-source --artifact public-site/);
  assert.match(WORKFLOW, /path: release-tooling\/release-source\/public-site/);
  assert.match(WORKFLOW, /Check out the current authoritative main state/);
  assert.match(WORKFLOW, /ref: refs\/heads\/main/);
  assert.match(WORKFLOW, /--governance-root authorization-state/);
  assert.match(WORKFLOW, /Revalidate current authorization immediately before deployment[\s\S]*uses: actions\/deploy-pages/);
  assert.doesNotMatch(WORKFLOW, /--commit-sha/);
  assert.match(WORKFLOW, /persist-credentials: false/);
  for (const action of ["actions/checkout", "actions/setup-node", "actions/upload-pages-artifact", "actions/deploy-pages"]) {
    assert.match(WORKFLOW, new RegExp("uses: " + action.replace("/", "\\/") + "@[0-9a-f]{40}"));
  }
});

test("accepts a separately checked-out Git regular-file source root but rejects escaping it", () => temporaryManifest((root) => {
  const target = join(root, "release-source");
  mkdirSync(join(target, "deployment"), { recursive: true });
  writeFileSync(join(target, "deployment", "public-assets.json"), JSON.stringify({ schema_version: "1.0.0", files: ["index.html"] }));
  writeFileSync(join(target, "index.html"), "<!doctype html>");
  initializeGitRepository(target);
  const files = buildPublicSite({ root: target, artifact: join(target, "public-site") });
  assert.deepEqual(files, ["index.html"]);
  assert.throws(
    () => buildPublicSite({ root: target, artifact: join(root, "outside-target") }),
    /must be a non-source directory inside the repository/
  );
}));

test("rejects a Git symlink entry even when the working-tree path is a regular file", () => temporaryManifest((root) => {
  const target = join(root, "release-source");
  mkdirSync(join(target, "deployment"), { recursive: true });
  writeFileSync(join(target, "deployment", "public-assets.json"), JSON.stringify({ schema_version: "1.0.0", files: ["index.html"] }));
  writeFileSync(join(target, "index.html"), "regular working-tree content");
  initializeGitRepository(target);
  const symlinkBlob = execFileSync("git", ["-C", target, "hash-object", "-w", "--stdin"], { input: "outside-target", encoding: "utf8" }).trim();
  execFileSync("git", ["-C", target, "update-index", "--add", "--cacheinfo", "120000," + symlinkBlob + ",index.html"], { stdio: "ignore" });
  execFileSync("git", ["-C", target, "commit", "-qm", "symlink tree entry"], { stdio: "ignore" });
  assert.throws(
    () => buildPublicSite({ root: target, artifact: join(target, "public-site") }),
    /must have Git regular-file mode 100644: index\.html/
  );
}));

test("treats a changed orchestrator validator as an approved-tooling integrity difference", () => temporaryManifest((root) => {
  mkdirSync(join(root, "tools"), { recursive: true });
  writeFileSync(join(root, "tools", "validate-orchestrator.mjs"), "export const revision = 'reviewed';\n");
  initializeGitRepository(root);
  const toolingCommitSha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  writeFileSync(join(root, "tools", "validate-orchestrator.mjs"), "export const revision = 'changed';\n");
  execFileSync("git", ["-C", root, "add", "tools/validate-orchestrator.mjs"], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "commit", "-qm", "changed control validator"], { stdio: "ignore" });
  const controlCommitSha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.throws(
    () => execFileSync("git", ["-C", root, "diff", "--exit-code", toolingCommitSha, controlCommitSha, "--", "tools/validate-orchestrator.mjs"], { stdio: "ignore" })
  );
}));

test("rejects a linked source directory that points outside the reviewed source root", () => temporaryManifest((root) => {
  const target = join(root, "release-source");
  const external = join(root, "external-content");
  mkdirSync(join(target, "deployment"), { recursive: true });
  mkdirSync(external, { recursive: true });
  writeFileSync(join(target, "deployment", "public-assets.json"), JSON.stringify({ schema_version: "1.0.0", files: ["images/injected.txt"] }));
  writeFileSync(join(external, "injected.txt"), "external content");
  symlinkSync(external, join(target, "images"), "junction");
  assert.throws(
    () => buildPublicSite({ root: target, artifact: join(target, "public-site") }),
    /source contains a symbolic link or junction: images\/injected\.txt/
  );
}));

test("rejects an approved path whose working-tree content differs from its Git revision", () => temporaryManifest((root) => {
  const target = join(root, "release-source");
  mkdirSync(join(target, "deployment"), { recursive: true });
  writeFileSync(join(target, "deployment", "public-assets.json"), JSON.stringify({ schema_version: "1.0.0", files: ["index.html"] }));
  writeFileSync(join(target, "index.html"), "reviewed");
  initializeGitRepository(target);
  writeFileSync(join(target, "index.html"), "modified after review");
  assert.throws(
    () => buildPublicSite({ root: target, artifact: join(target, "public-site") }),
    /differs from the checked-out Git revision: index\.html/
  );
}));

test("includes every local HTML asset reference in the manifest", () => {
  const approved = new Set(MANIFEST.files);
  const references = new Set();
  for (const page of MANIFEST.files.filter((path) => path.endsWith(".html"))) {
    const html = readFileSync(join(ROOT, ...page.split("/")), "utf8");
    for (const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const value = match[1].split(/[?#]/, 1)[0];
      if (!value || value.startsWith("/") || value.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(value)) continue;
      references.add(value);
    }
  }
  for (const reference of references) assert.ok(approved.has(reference), "Local HTML reference is not included in the public manifest: " + reference);
});
