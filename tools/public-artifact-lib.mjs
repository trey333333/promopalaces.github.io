import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isAbsolute, relative, resolve, sep } from "node:path";

const COMMIT_SHA = /^[0-9a-f]{40}$/;

export const FORBIDDEN_PUBLIC_PATHS = [
  "agents",
  "affiliates",
  "governance",
  "tests",
  "tools",
  "docs",
  "deployment"
];

export const FORBIDDEN_PUBLIC_FILENAMES = [
  "agents.md",
  "registry.json",
  "backlog.json",
  "approval-gates.json",
  "decision-log.json",
  "public-assets.json"
];

function fail(message) {
  throw new Error(message);
}

function isWithin(parent, candidate) {
  return candidate === parent || candidate.startsWith(parent + sep);
}

function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const detail = error.stderr?.toString().trim();
    fail("Cannot verify approved Git revision: " + (detail || error.message));
  }
}

function assertUnlinkedSourcePath(root, repositoryPath) {
  const repositoryRoot = resolve(root);
  if (!existsSync(repositoryRoot)) fail("Source root is missing: " + repositoryRoot);
  const rootInfo = lstatSync(repositoryRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) fail("Source root must be an unlinked directory: " + repositoryRoot);

  let current = repositoryRoot;
  for (const segment of repositoryPath.split("/")) {
    current = resolve(current, segment);
    if (!isWithin(repositoryRoot, current)) fail("Resolved source escapes repository root: " + repositoryPath);
    if (!existsSync(current)) fail("Approved public asset is missing: " + repositoryPath);
    const info = lstatSync(current);
    if (info.isSymbolicLink()) fail("Approved public asset source contains a symbolic link or junction: " + repositoryPath);
    if (segment !== repositoryPath.split("/").at(-1) && !info.isDirectory()) fail("Approved public asset source has a non-directory parent: " + repositoryPath);
  }

  const canonicalRoot = realpathSync.native(repositoryRoot);
  const source = resolve(repositoryRoot, ...repositoryPath.split("/"));
  const canonicalSource = realpathSync.native(source);
  if (!isWithin(canonicalRoot, canonicalSource)) fail("Canonical source escapes repository root: " + repositoryPath);
  return source;
}

function assertApprovedGitFile(root, source, repositoryPath, expectedCommitSha) {
  const head = git(root, ["rev-parse", "HEAD"]);
  if (!COMMIT_SHA.test(head)) fail("Source root does not resolve to a full Git commit SHA.");
  if (expectedCommitSha && head !== expectedCommitSha) fail("Source root HEAD does not match the approved target commit SHA.");

  const treeEntry = git(root, ["ls-tree", "HEAD", "--", repositoryPath]);
  if (!/^100644 blob [0-9a-f]{40}\t/.test(treeEntry)) fail("Approved public asset must have Git regular-file mode 100644: " + repositoryPath);
  try {
    execFileSync("git", ["-C", root, "diff", "--quiet", "HEAD", "--", repositoryPath], { stdio: "ignore" });
  } catch {
    fail("Approved public asset differs from the checked-out Git revision: " + repositoryPath);
  }
  const info = lstatSync(source);
  if (!info.isFile() || info.isSymbolicLink()) fail("Approved public asset must be a regular file: " + repositoryPath);
}

function normalizeManifestPath(path) {
  if (typeof path !== "string" || path.length === 0) fail("Manifest paths must be nonempty strings.");
  if (path.includes("\\") || isAbsolute(path) || path.startsWith("/") || path.split("/").includes("..") || path.split("/").includes(".")) {
    fail("Manifest path is not a safe repository-relative POSIX path: " + path);
  }
  return path;
}

function publicPathIssue(path) {
  const segments = path.split("/");
  const hiddenSegment = segments.find((segment) => segment.startsWith("."));
  if (hiddenSegment) return "hidden path segment " + hiddenSegment;
  const internalSegment = segments.find((segment) => FORBIDDEN_PUBLIC_PATHS.includes(segment.toLowerCase()));
  if (internalSegment) return "internal path segment " + internalSegment;
  const filename = segments.at(-1).toLowerCase();
  if (FORBIDDEN_PUBLIC_FILENAMES.includes(filename)) return "internal governance filename " + segments.at(-1);
  return "";
}

function loadManifest(root) {
  const manifestPath = resolve(root, "deployment/public-assets.json");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail("Cannot read deployment/public-assets.json: " + error.message);
  }
  if (!manifest || Array.isArray(manifest) || typeof manifest !== "object") fail("Public asset manifest must be an object.");
  const keys = Object.keys(manifest);
  if (keys.some((key) => key !== "schema_version" && key !== "files")) fail("Public asset manifest contains an unsupported field.");
  if (manifest.schema_version !== "1.0.0") fail("Public asset manifest schema_version must be 1.0.0.");
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) fail("Public asset manifest files must be a nonempty array.");

  const files = [];
  const seen = new Set();
  for (const path of manifest.files) {
    const normalized = normalizeManifestPath(path);
    if (seen.has(normalized)) fail("Public asset manifest contains a duplicate path: " + normalized);
    const issue = publicPathIssue(normalized);
    if (issue) fail("Public asset manifest cannot include " + issue + ": " + normalized);
    seen.add(normalized);
    files.push(normalized);
  }
  return files.sort();
}

function sourcePath(root, repositoryPath) {
  return assertUnlinkedSourcePath(root, repositoryPath);
}

function walkFiles(directory, prefix = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const repositoryPath = prefix ? prefix + "/" + entry.name : entry.name;
    const fullPath = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) fail("Published artifact must not contain symbolic links: " + repositoryPath);
    if (entry.isDirectory()) files.push(...walkFiles(fullPath, repositoryPath));
    else if (entry.isFile()) files.push(repositoryPath);
    else fail("Published artifact contains unsupported filesystem entry: " + repositoryPath);
  }
  return files.sort();
}

export function validatePublicArtifact({ root, artifact }) {
  const repositoryRoot = resolve(root);
  const artifactRoot = resolve(artifact);
  const expected = loadManifest(repositoryRoot);
  if (!existsSync(artifactRoot) || !lstatSync(artifactRoot).isDirectory() || lstatSync(artifactRoot).isSymbolicLink()) fail("Published artifact directory is missing or linked: " + artifactRoot);

  const actual = walkFiles(artifactRoot);
  const expectedSet = new Set(expected);
  for (const path of actual) {
    const issue = publicPathIssue(path);
    if (issue) fail("Published artifact contains " + issue + ": " + path);
  }
  const unexpected = actual.filter((path) => !expectedSet.has(path));
  const missing = expected.filter((path) => !actual.includes(path));
  if (unexpected.length) fail("Published artifact contains unapproved paths: " + unexpected.join(", "));
  if (missing.length) fail("Published artifact is missing approved paths: " + missing.join(", "));
  return actual;
}

export function buildPublicSite({ root, artifact, allowExternalArtifact = false, expectedCommitSha }) {
  const repositoryRoot = resolve(root);
  const artifactRoot = resolve(artifact);
  if (expectedCommitSha !== undefined && (typeof expectedCommitSha !== "string" || !COMMIT_SHA.test(expectedCommitSha))) {
    fail("Expected target commit SHA must be a lowercase 40-character SHA-1.");
  }
  const approvedFiles = loadManifest(repositoryRoot);
  const artifactRelative = relative(repositoryRoot, artifactRoot);
  const artifactTopLevel = artifactRelative.split(sep)[0];
  const sourceTopLevels = new Set(approvedFiles.map((path) => path.split("/")[0]));
  if (!allowExternalArtifact && (!artifactRelative || artifactRelative.startsWith("..") || isAbsolute(artifactRelative))) {
    fail("Artifact directory must be a non-source directory inside the repository.");
  }
  if (!allowExternalArtifact && (sourceTopLevels.has(artifactTopLevel) || FORBIDDEN_PUBLIC_PATHS.includes(artifactTopLevel))) {
    fail("Artifact directory cannot overlap a source or internal repository path.");
  }
  if (existsSync(artifactRoot) && lstatSync(artifactRoot).isSymbolicLink()) fail("Artifact directory must not be a symbolic link.");

  rmSync(artifactRoot, { recursive: true, force: true });
  mkdirSync(artifactRoot, { recursive: true });
  if (lstatSync(artifactRoot).isSymbolicLink()) fail("Artifact directory must not be a symbolic link.");
  for (const repositoryPath of approvedFiles) {
    const source = sourcePath(repositoryRoot, repositoryPath);
    assertApprovedGitFile(repositoryRoot, source, repositoryPath, expectedCommitSha);
    const target = resolve(artifactRoot, ...repositoryPath.split("/"));
    if (!isWithin(artifactRoot, target)) fail("Resolved artifact target escapes artifact root: " + repositoryPath);
    mkdirSync(resolve(target, ".."), { recursive: true });
    copyFileSync(source, target);
  }
  return validatePublicArtifact({ root: repositoryRoot, artifact: artifactRoot });
}

export function parseArtifactArgument(argv, defaultArtifact) {
  const index = argv.indexOf("--artifact");
  if (index === -1) return defaultArtifact;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail("--artifact requires a directory value.");
  if (argv.filter((argument) => argument === "--artifact").length !== 1) fail("--artifact may be supplied only once.");
  return value;
}

export function parseSourceRootArgument(argv, defaultSourceRoot = ".") {
  const index = argv.indexOf("--source-root");
  if (index === -1) return defaultSourceRoot;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail("--source-root requires a directory value.");
  if (argv.filter((argument) => argument === "--source-root").length !== 1) fail("--source-root may be supplied only once.");
  if (isAbsolute(value) || value.split(/[\\/]/).includes("..")) fail("--source-root must stay within the control repository.");
  return value;
}

export function parseExpectedCommitShaArgument(argv) {
  const index = argv.indexOf("--expected-commit-sha");
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail("--expected-commit-sha requires a commit SHA value.");
  if (argv.filter((argument) => argument === "--expected-commit-sha").length !== 1) fail("--expected-commit-sha may be supplied only once.");
  if (!COMMIT_SHA.test(value)) fail("--expected-commit-sha must be a lowercase 40-character SHA-1.");
  return value;
}
