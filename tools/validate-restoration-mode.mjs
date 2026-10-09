#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RESTORATION_MODE_PATH = "deployment/restoration-mode.json";
export const PACKAGE_PATH = "docs/rollback/PP-017-historical-site";
export const APPROVED_RESTORATION_PACKAGE_ID = "PP-017-historical-site-restoration";
export const APPROVED_HISTORICAL_SOURCE_COMMIT = "a1f732de923d90767a0a7236afeb1ac72342292b";
export const APPROVED_LEGACY_MANIFEST_SHA256 = "cf982cdc6e7f8edd7210d038c5ca5859325b392c50682267d66313e4af5fb1e7";
export const RESTORATION_AUTHORIZATION_TASK_ID = "PP-017";
export const REQUIRED_RISK_IDS = [
  "missing_adjacent_affiliate_disclosure",
  "blank_affiliate_aid_parameter",
  "missing_sponsored_link_attributes"
];

const COMMIT_SHA = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(message);
}

function object(value) {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

function exactShape(value, label, required) {
  if (!object(value)) fail(label + " must be an object.");
  for (const key of required) if (!Object.hasOwn(value, key)) fail(label + "." + key + " is required.");
  for (const key of Object.keys(value)) if (!required.includes(key)) fail(label + "." + key + " is not allowed.");
  return value;
}

function text(value, label, pattern) {
  if (typeof value !== "string" || value.trim() === "") fail(label + " must be a nonempty string.");
  if (pattern && !pattern.test(value)) fail(label + " has an invalid format.");
  return value;
}

function sameList(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    fail(label + " must exactly match the required ordered values.");
  }
}

function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
  } catch (error) {
    fail("Cannot verify restoration Git revision: " + (error.stderr?.toString().trim() || error.message));
  }
}

function gitBytes(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    fail("Cannot verify restoration Git revision: " + (error.stderr?.toString().trim() || error.message));
  }
}

function gitPathExists(root, revision, relativePath) {
  try {
    execFileSync("git", ["-C", root, "cat-file", "-e", revision + ":" + relativePath], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function gitRegularFileBytes(root, revision, relativePath) {
  const tree = git(root, ["ls-tree", revision, "--", relativePath]);
  if (!/^100644 blob [0-9a-f]{40}\t/.test(tree)) fail("Restoration target must contain a Git-tracked regular file: " + relativePath);
  return gitBytes(root, ["show", revision + ":" + relativePath]);
}

function targetHasHistoricalRestorationFingerprint(root, targetCommitSha) {
  const manifestPath = "deployment/public-assets.json";
  if (gitPathExists(root, targetCommitSha, manifestPath)) {
    const manifest = gitRegularFileBytes(root, targetCommitSha, manifestPath);
    if (createHash("sha256").update(manifest).digest("hex") === APPROVED_LEGACY_MANIFEST_SHA256) return true;
  }
  if (!gitPathExists(root, targetCommitSha, "index.html")) return false;
  git(root, ["cat-file", "-e", APPROVED_HISTORICAL_SOURCE_COMMIT + "^{commit}"]);
  return gitRegularFileBytes(root, targetCommitSha, "index.html")
    .equals(gitBytes(root, ["show", APPROVED_HISTORICAL_SOURCE_COMMIT + ":index.html"]));
}

function trackedRegularFile(root, relativePath) {
  const fullPath = resolve(root, ...relativePath.split("/"));
  if (!existsSync(fullPath) || !lstatSync(fullPath).isFile() || lstatSync(fullPath).isSymbolicLink()) fail(relativePath + " must be a regular unlinked file.");
  const tree = git(root, ["ls-tree", "HEAD", "--", relativePath]);
  if (!/^100644 blob [0-9a-f]{40}\t/.test(tree)) fail(relativePath + " must be a Git-tracked regular file in HEAD.");
  try {
    execFileSync("git", ["-C", root, "diff", "--quiet", "HEAD", "--", relativePath], { stdio: "ignore" });
  } catch {
    fail(relativePath + " differs from the checked-out Git revision.");
  }
  return fullPath;
}

function trackedGitBytes(root, revision, relativePath) {
  // Keep the filesystem checks so a missing, linked, or modified worktree file
  // fails locally, but verify raw bytes from the immutable Git revision. This
  // avoids accepting platform-specific CRLF checkout conversion as source drift.
  trackedRegularFile(root, relativePath);
  return gitRegularFileBytes(root, revision, relativePath);
}

function safeManifestPath(path) {
  if (typeof path !== "string" || !path || path.includes("\\") || path.startsWith("/") || path.split("/").some((segment) => !segment || segment === "." || segment === ".." || segment.startsWith("."))) {
    fail("Legacy manifest contains an unsafe path: " + String(path));
  }
  if (path.split("/").some((segment) => ["agents", "affiliates", "governance", "tests", "tools", "docs", "deployment"].includes(segment.toLowerCase()))) {
    fail("Legacy manifest contains an internal path: " + path);
  }
}

function validateRestorationRevision(repositoryRoot, bytesForPath, targetCommitSha) {
  const config = exactShape(JSON.parse(bytesForPath(RESTORATION_MODE_PATH).toString("utf8")), "restoration_mode", ["schema_version", "mode", "package", "owner_acknowledgement"]);
  if (config.schema_version !== "1.0.0") fail("restoration_mode.schema_version must be 1.0.0.");
  if (config.mode !== "historical_restoration") fail("restoration_mode.mode must be historical_restoration.");

  const packageConfig = exactShape(config.package, "restoration_mode.package", ["package_id", "historical_source_commit", "manifest_sha256", "source_directory", "source_file_count"]);
  if (packageConfig.package_id !== APPROVED_RESTORATION_PACKAGE_ID) fail("restoration_mode.package.package_id is not approved.");
  const historicalCommit = text(packageConfig.historical_source_commit, "restoration_mode.package.historical_source_commit", COMMIT_SHA);
  if (historicalCommit !== APPROVED_HISTORICAL_SOURCE_COMMIT) fail("restoration_mode.package.historical_source_commit is not the approved historical revision.");
  if (packageConfig.source_directory !== "source") fail("restoration_mode.package.source_directory must be source.");
  if (packageConfig.source_file_count !== 31) fail("restoration_mode.package.source_file_count must be 31.");
  const expectedManifestHash = text(packageConfig.manifest_sha256, "restoration_mode.package.manifest_sha256", /^[0-9a-f]{64}$/);
  if (expectedManifestHash !== APPROVED_LEGACY_MANIFEST_SHA256) fail("restoration_mode.package.manifest_sha256 is not the approved legacy manifest.");

  const acknowledgement = exactShape(config.owner_acknowledgement, "restoration_mode.owner_acknowledgement", ["required", "risk_ids"]);
  if (acknowledgement.required !== true) fail("restoration_mode.owner_acknowledgement.required must be true.");
  sameList(acknowledgement.risk_ids, REQUIRED_RISK_IDS, "restoration_mode.owner_acknowledgement.risk_ids");

  const packageMetadataPath = PACKAGE_PATH + "/restoration-package.json";
  const packageManifestPath = PACKAGE_PATH + "/legacy-public-assets.json";
  const packageMetadata = exactShape(JSON.parse(bytesForPath(packageMetadataPath).toString("utf8")), "restoration_package", ["schema_version", "package_id", "internal_only", "historical_source_commit", "current_marketplace_target_commit", "approved_deployment_tooling_baseline", "source_directory", "manifest", "public_file_count", "historical_asset_exclusions", "promotion_requirements"]);
  if (packageMetadata.schema_version !== "1.0.0" || packageMetadata.package_id !== packageConfig.package_id || packageMetadata.internal_only !== true) fail("Restoration package metadata is not approved.");
  if (packageMetadata.historical_source_commit !== historicalCommit || packageMetadata.source_directory !== packageConfig.source_directory || packageMetadata.manifest !== "legacy-public-assets.json" || packageMetadata.public_file_count !== packageConfig.source_file_count) fail("Restoration package metadata does not match restoration mode.");

  const packageManifestBytes = bytesForPath(packageManifestPath);
  if (createHash("sha256").update(packageManifestBytes).digest("hex") !== expectedManifestHash) fail("restoration_mode.package.manifest_sha256 does not match the approved legacy manifest.");
  const packageManifest = exactShape(JSON.parse(packageManifestBytes.toString("utf8")), "legacy_manifest", ["schema_version", "files"]);
  if (packageManifest.schema_version !== "1.0.0" || !Array.isArray(packageManifest.files) || packageManifest.files.length !== packageConfig.source_file_count) fail("Legacy manifest must contain exactly 31 files.");
  if (new Set(packageManifest.files).size !== packageManifest.files.length) fail("Legacy manifest contains duplicate paths.");
  for (const path of packageManifest.files) safeManifestPath(path);
  if (packageManifest.files.includes("images/Apparel.png") || !packageManifest.files.includes("images/apparel.png")) fail("Legacy manifest must retain only the referenced lowercase apparel image.");

  git(repositoryRoot, ["cat-file", "-e", historicalCommit + "^{commit}"]);
  for (const path of packageManifest.files) {
    const packageSource = bytesForPath(PACKAGE_PATH + "/source/" + path);
    const historical = gitBytes(repositoryRoot, ["show", historicalCommit + ":" + path]);
    if (!packageSource.equals(historical)) fail("Restoration package source differs from historical revision: " + path);
    if (!bytesForPath(path).equals(packageSource)) fail("Restoration target differs from approved package source: " + path);
  }

  const deployedManifest = bytesForPath("deployment/public-assets.json");
  if (!deployedManifest.equals(packageManifestBytes)) fail("deployment/public-assets.json must exactly match the approved legacy manifest in restoration mode.");
  return { active: true, mode: config.mode, config, packageManifest, target_commit_sha: targetCommitSha };
}

export function validateRestorationMode(root) {
  const repositoryRoot = resolve(root);
  const modePath = resolve(repositoryRoot, RESTORATION_MODE_PATH);
  if (!existsSync(modePath)) {
    const head = git(repositoryRoot, ["rev-parse", "HEAD"]);
    if (gitPathExists(repositoryRoot, head, RESTORATION_MODE_PATH)) {
      fail("deployment/restoration-mode.json is missing from the working tree but present in HEAD.");
    }
    return validateRestorationTarget(repositoryRoot, head);
  }

  const head = git(repositoryRoot, ["rev-parse", "HEAD"]);
  trackedRegularFile(repositoryRoot, RESTORATION_MODE_PATH);
  return validateRestorationRevision(repositoryRoot, (relativePath) => trackedGitBytes(repositoryRoot, head, relativePath), head);
}

export function validateRestorationTarget(root, targetCommitSha) {
  const repositoryRoot = resolve(root);
  if (typeof targetCommitSha !== "string" || !COMMIT_SHA.test(targetCommitSha)) fail("Restoration target commit SHA must be a lowercase 40-character SHA-1.");
  git(repositoryRoot, ["cat-file", "-e", targetCommitSha + "^{commit}"]);
  if (!gitPathExists(repositoryRoot, targetCommitSha, RESTORATION_MODE_PATH)) {
    if (targetHasHistoricalRestorationFingerprint(repositoryRoot, targetCommitSha)) {
      fail("Target appears to be a historical restoration but has no validated deployment/restoration-mode.json.");
    }
    return { active: false, mode: "marketplace", target_commit_sha: targetCommitSha };
  }
  return validateRestorationRevision(repositoryRoot, (relativePath) => gitRegularFileBytes(repositoryRoot, targetCommitSha, relativePath), targetCommitSha);
}

export function validateRestorationAcknowledgement(decision, restorationMode, taskId, targetCommitSha) {
  if (!restorationMode.active) return;
  if (taskId !== RESTORATION_AUTHORIZATION_TASK_ID || decision.task_id !== RESTORATION_AUTHORIZATION_TASK_ID) fail("Historical restoration acknowledgement is only valid for " + RESTORATION_AUTHORIZATION_TASK_ID + ".");
  if (targetCommitSha !== restorationMode.target_commit_sha || decision.target_commit_sha !== targetCommitSha) fail("Historical restoration acknowledgement must bind the exact restoration target commit SHA.");
  const acknowledgement = exactShape(decision.restoration_acknowledgement, "decision.restoration_acknowledgement", ["acknowledged_by", "task_id", "target_commit_sha", "risk_ids"]);
  if (acknowledgement.acknowledged_by !== "owner") fail("Historical restoration requires owner acknowledgement.");
  if (acknowledgement.task_id !== taskId) fail("Historical restoration acknowledgement must bind the authorized task ID.");
  if (acknowledgement.target_commit_sha !== targetCommitSha) fail("Historical restoration acknowledgement must bind the exact restoration target commit SHA.");
  sameList(acknowledgement.risk_ids, REQUIRED_RISK_IDS, "decision.restoration_acknowledgement.risk_ids");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const index = process.argv.indexOf("--root");
  const root = index === -1 ? repositoryRoot : resolve(process.argv[index + 1] ?? "");
  try {
    const result = validateRestorationMode(root);
    console.log(result.active ? "Historical restoration mode validation passed." : "Restoration mode inactive; marketplace validation remains required.");
  } catch (error) {
    console.error("Restoration mode validation failed: " + error.message);
    process.exitCode = 1;
  }
}
