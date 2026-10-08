import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("keeps Pages deployment manual and environment-protected", () => {
  assert.match(WORKFLOW, /^on:\r?\n  workflow_dispatch:/m);
  assert.doesNotMatch(WORKFLOW, /^\s*(?:push|pull_request):/m);
  assert.match(WORKFLOW, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(WORKFLOW, /environment:\r?\n      name: github-pages/);
  assert.match(WORKFLOW, /validate-deployment-authorization\.mjs/);
  assert.match(WORKFLOW, new RegExp("COMMIT_SHA: " + "\\$\\{\\{ github\\.sha \\}\\}"));
  assert.match(WORKFLOW, /--commit-sha "\$COMMIT_SHA"/);
  assert.match(WORKFLOW, /persist-credentials: false/);
  for (const action of ["actions/checkout", "actions/setup-node", "actions/upload-pages-artifact", "actions/deploy-pages"]) {
    assert.match(WORKFLOW, new RegExp("uses: " + action.replace("/", "\\/") + "@[0-9a-f]{40}"));
  }
});

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
