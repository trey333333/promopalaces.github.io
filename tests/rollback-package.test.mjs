import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { buildPublicSite, validatePublicArtifact } from "../tools/public-artifact-lib.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const PACKAGE_ROOT = join(ROOT, "docs", "rollback", "PP-017-historical-site");
const SOURCE_ROOT = join(PACKAGE_ROOT, "source");
const PACKAGE = JSON.parse(readFileSync(join(PACKAGE_ROOT, "restoration-package.json"), "utf8"));
const MANIFEST = JSON.parse(readFileSync(join(PACKAGE_ROOT, "legacy-public-assets.json"), "utf8"));

function walkFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix ? prefix + "/" + entry.name : entry.name;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath, path);
    return [path];
  }).sort();
}

function historicalFile(path) {
  return execFileSync("git", ["show", PACKAGE.historical_source_commit + ":" + path], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
}

function packageFile(path) {
  return execFileSync("git", ["show", "HEAD:docs/rollback/PP-017-historical-site/" + path], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
}

function temporaryRestorationRepository(callback) {
  const root = mkdtempSync(join(tmpdir(), "promopalaces-rollback-package-"));
  try {
    mkdirSync(join(root, "deployment"), { recursive: true });
    writeFileSync(join(root, "deployment", "public-assets.json"), JSON.stringify(MANIFEST));
    for (const path of MANIFEST.files) {
      const target = join(root, ...path.split("/"));
      mkdirSync(resolve(target, ".."), { recursive: true });
      copyFileSync(join(SOURCE_ROOT, ...path.split("/")), target);
    }
    execFileSync("git", ["-C", root, "init", "-q"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "config", "user.email", "test@example.invalid"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "config", "user.name", "PromoPalaces Test"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "add", "."], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "commit", "-qm", "restoration fixture"], { stdio: "ignore" });
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("pins the historical source, marketplace target, and tooling baseline without creating an approval", () => {
  assert.deepEqual(PACKAGE, {
    schema_version: "1.0.0",
    package_id: "PP-017-historical-site-restoration",
    internal_only: true,
    historical_source_commit: "a1f732de923d90767a0a7236afeb1ac72342292b",
    current_marketplace_target_commit: "2f607bba20ce8591d9a5d15509cd4699d06e80b9",
    approved_deployment_tooling_baseline: "419fa0ccb9d3edde36bd9cff1148de41444097ef",
    source_directory: "source",
    manifest: "legacy-public-assets.json",
    public_file_count: 31,
    historical_asset_exclusions: [{ path: "images/Apparel.png", reason: "This unreferenced asset conflicts by case with the referenced images/apparel.png on case-insensitive filesystems. The portable restoration package preserves the referenced lowercase asset instead." }],
    promotion_requirements: [
      "Create a new reviewed restoration target commit on main from this package; do not deploy this package directly.",
      "Create a later reviewed tooling-binding commit after the restoration target.",
      "Create a still-later authorization-control commit containing a genuine owner decision for PP-017.",
      "Use the protected github-pages environment review before deployment."
    ]
  });
});

test("contains an exact, portable 31-file copy of the historical public source", () => {
  assert.equal(MANIFEST.schema_version, "1.0.0");
  assert.equal(MANIFEST.files.length, 31);
  assert.equal(new Set(MANIFEST.files).size, 31);
  assert.ok(MANIFEST.files.includes("CNAME"));
  assert.ok(MANIFEST.files.includes("google91250e6e2fdfde57.html"));
  assert.ok(MANIFEST.files.includes("images/apparel.png"));
  assert.ok(!MANIFEST.files.includes("images/Apparel.png"));
  assert.deepEqual(walkFiles(SOURCE_ROOT), [...MANIFEST.files].sort());
  assert.equal(createHash("sha256").update(packageFile("legacy-public-assets.json")).digest("hex"), "cf982cdc6e7f8edd7210d038c5ca5859325b392c50682267d66313e4af5fb1e7");
  for (const path of MANIFEST.files) {
    assert.deepEqual(packageFile("source/" + path), historicalFile(path), "Historical Git blob mismatch: " + path);
    assert.ok(!path.split("/").some((segment) => ["agents", "affiliates", "governance", "tests", "tools", "docs", "deployment"].includes(segment)));
  }
});

test("preserves historical domain, Search Console, and Executive Advertising references", () => {
  assert.equal(readFileSync(join(SOURCE_ROOT, "CNAME"), "utf8").trim(), "promopalaces.com");
  assert.match(readFileSync(join(SOURCE_ROOT, "index.html"), "utf8"), /google-site-verification.*_PmGPjlrrsZPdBH-g_4dNeMzWwzHzXWD7X5C1pDrjA0/);
  assert.ok(readFileSync(join(SOURCE_ROOT, "google91250e6e2fdfde57.html"), "utf8").length > 0);
  const source = readFileSync(join(SOURCE_ROOT, "index.html"), "utf8") + readFileSync(join(SOURCE_ROOT, "shop.html"), "utf8");
  const historical = historicalFile("index.html").toString("utf8") + historicalFile("shop.html").toString("utf8");
  assert.equal((source.match(/executiveadvertising\.com/gi) ?? []).length, 50);
  assert.equal((source.match(/executiveadvertising\.com/gi) ?? []).length, (historical.match(/executiveadvertising\.com/gi) ?? []).length);
});

test("builds a legacy restoration artifact without internal files or marketplace-manifest changes", () => temporaryRestorationRepository((root) => {
  const artifact = join(root, "public-site");
  const files = buildPublicSite({ root, artifact });
  assert.deepEqual(files, [...MANIFEST.files].sort());
  assert.deepEqual(validatePublicArtifact({ root, artifact }), [...MANIFEST.files].sort());
  for (const path of MANIFEST.files) assert.deepEqual(readFileSync(join(artifact, ...path.split("/"))), readFileSync(join(SOURCE_ROOT, ...path.split("/"))), "Artifact changed: " + path);
  const currentManifest = JSON.parse(readFileSync(join(ROOT, "deployment", "public-assets.json"), "utf8"));
  assert.equal(currentManifest.files.length, 49);
  assert.ok(!currentManifest.files.some((path) => path.startsWith("docs/rollback/")));
  assert.equal(relative(ROOT, PACKAGE_ROOT).replaceAll("\\", "/"), "docs/rollback/PP-017-historical-site");
}));
