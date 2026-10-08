#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArtifactArgument, validatePublicArtifact } from "./public-artifact-lib.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const artifactArgument = parseArtifactArgument(process.argv.slice(2), "dist");
  const artifact = resolve(repositoryRoot, artifactArgument);
  const files = validatePublicArtifact({ root: repositoryRoot, artifact });
  console.log("Public artifact validation passed: " + files.length + " approved files and no internal paths.");
} catch (error) {
  console.error("Public artifact validation failed: " + error.message);
  process.exitCode = 1;
}
