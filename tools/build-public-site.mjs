#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPublicSite, parseArtifactArgument, parseExpectedCommitShaArgument, parseSourceRootArgument } from "./public-artifact-lib.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const args = process.argv.slice(2);
  const sourceRoot = resolve(repositoryRoot, parseSourceRootArgument(args));
  const artifactArgument = parseArtifactArgument(args, "dist");
  const artifact = resolve(sourceRoot, artifactArgument);
  const expectedCommitSha = parseExpectedCommitShaArgument(args);
  const files = buildPublicSite({ root: sourceRoot, artifact, expectedCommitSha });
  console.log("Built public artifact with " + files.length + " approved files at " + artifact);
} catch (error) {
  console.error("Public artifact build failed: " + error.message);
  process.exitCode = 1;
}
