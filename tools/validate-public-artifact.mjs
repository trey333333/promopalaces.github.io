#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArtifactArgument, parseSourceRootArgument, validatePublicArtifact } from "./public-artifact-lib.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const args = process.argv.slice(2);
  const sourceRoot = resolve(repositoryRoot, parseSourceRootArgument(args));
  const artifactArgument = parseArtifactArgument(args, "dist");
  const artifact = resolve(sourceRoot, artifactArgument);
  const files = validatePublicArtifact({ root: sourceRoot, artifact });
  console.log("Public artifact validation passed: " + files.length + " approved files and no internal paths.");
} catch (error) {
  console.error("Public artifact validation failed: " + error.message);
  process.exitCode = 1;
}
