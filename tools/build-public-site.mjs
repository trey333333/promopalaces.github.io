#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPublicSite, parseArtifactArgument } from "./public-artifact-lib.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const artifactArgument = parseArtifactArgument(process.argv.slice(2), "dist");
  const artifact = resolve(repositoryRoot, artifactArgument);
  const files = buildPublicSite({ root: repositoryRoot, artifact });
  console.log("Built public artifact with " + files.length + " approved files at " + artifact);
} catch (error) {
  console.error("Public artifact build failed: " + error.message);
  process.exitCode = 1;
}
