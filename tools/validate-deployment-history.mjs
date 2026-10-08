#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const COMMIT_SHA = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(message);
}

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1 || !argv[index + 1] || argv[index + 1].startsWith("--")) fail(name + " is required.");
  if (argv.filter((argument) => argument === name).length !== 1) fail(name + " may be supplied only once.");
  return argv[index + 1];
}

function repositoryRootOption(argv, defaultRepositoryRoot) {
  const index = argv.indexOf("--repository-root");
  if (index === -1) return defaultRepositoryRoot;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail("--repository-root requires a directory value.");
  if (argv.filter((argument) => argument === "--repository-root").length !== 1) fail("--repository-root may be supplied only once.");
  if (value.includes("..") || resolve(defaultRepositoryRoot, value) === defaultRepositoryRoot) fail("--repository-root must name a checked-out reviewed state below the control repository.");
  return resolve(defaultRepositoryRoot, value);
}

function git(repositoryRoot, args, message) {
  try {
    return execFileSync("git", ["-C", repositoryRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const detail = error.stderr?.toString().trim();
    fail(message + (detail ? ": " + detail : ""));
  }
}

function assertCommit(repositoryRoot, sha, label) {
  if (!COMMIT_SHA.test(sha)) fail(label + " must be a lowercase 40-character SHA-1.");
  git(repositoryRoot, ["cat-file", "-e", sha + "^{commit}"], label + " does not identify a commit in the reviewed repository");
}

function assertAncestor(repositoryRoot, earlier, later, message) {
  try {
    execFileSync("git", ["-C", repositoryRoot, "merge-base", "--is-ancestor", earlier, later], { stdio: "ignore" });
  } catch {
    fail(message);
  }
}

function assertFirstParent(repositoryRoot, candidate, controlCommitSha, label) {
  const firstParent = git(repositoryRoot, ["rev-list", "--first-parent", controlCommitSha], "Cannot read reviewed main first-parent history").split(/\r?\n/);
  if (!firstParent.includes(candidate)) fail(label + " is not a reviewed first-parent commit on main.");
}

export function validateDeploymentHistory({ repositoryRoot, targetCommitSha, toolingCommitSha, controlCommitSha }) {
  const root = resolve(repositoryRoot);
  if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) fail("Reviewed repository root must be an unlinked directory.");
  assertCommit(root, targetCommitSha, "Target commit SHA");
  assertCommit(root, toolingCommitSha, "Tooling commit SHA");
  assertCommit(root, controlCommitSha, "Control commit SHA");
  if (targetCommitSha === controlCommitSha) fail("Target commit SHA must differ from the control commit SHA.");
  if (toolingCommitSha === controlCommitSha) fail("Tooling commit SHA must differ from the control commit SHA.");

  assertFirstParent(root, targetCommitSha, controlCommitSha, "Target commit");
  assertFirstParent(root, toolingCommitSha, controlCommitSha, "Tooling commit");
  assertAncestor(root, targetCommitSha, toolingCommitSha, "Target commit must precede or equal the reviewed tooling commit.");
  assertAncestor(root, toolingCommitSha, controlCommitSha, "Reviewed tooling commit must precede the authorization-control commit.");
  return { targetCommitSha, toolingCommitSha, controlCommitSha };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const args = process.argv.slice(2);
    const result = validateDeploymentHistory({
      repositoryRoot: repositoryRootOption(args, repositoryRoot),
      targetCommitSha: option(args, "--target-commit-sha"),
      toolingCommitSha: option(args, "--tooling-commit-sha"),
      controlCommitSha: option(args, "--control-commit-sha")
    });
    console.log("Deployment history is valid for target " + result.targetCommitSha + ", tooling " + result.toolingCommitSha + ", and control " + result.controlCommitSha + ".");
  } catch (error) {
    console.error("Deployment history validation failed: " + error.message);
    process.exitCode = 1;
  }
}
