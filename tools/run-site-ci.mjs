#!/usr/bin/env node
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRestorationMode } from "./validate-restoration-mode.mjs";

export const RESTORATION_TESTS = [
  "affiliate-growth.test.mjs",
  "ci-workflow.test.mjs",
  "deployment-safety.test.mjs",
  "legacy-restoration.test.mjs",
  "orchestrator-validation.test.mjs",
  "public-artifact.test.mjs"
];

function testFiles(root) {
  return readdirSync(resolve(root, "tests"))
    .filter((file) => file.endsWith(".test.mjs"))
    .sort();
}

export function selectSiteCiSuite(root) {
  const restoration = validateRestorationMode(root);
  if (!restoration.active) return { mode: "marketplace", tests: testFiles(root) };
  const available = new Set(testFiles(root));
  for (const file of RESTORATION_TESTS) if (!available.has(file)) throw new Error("Restoration CI test is missing: tests/" + file);
  return { mode: "historical_restoration", tests: [...RESTORATION_TESTS] };
}

function parseRoot(argv, defaultRoot) {
  const index = argv.indexOf("--root");
  if (index === -1) return defaultRoot;
  const value = argv[index + 1];
  if (!value || value.startsWith("--") || argv.filter((argument) => argument === "--root").length !== 1) throw new Error("--root requires one directory value.");
  return resolve(value);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const root = parseRoot(process.argv.slice(2), defaultRoot);
    const suite = selectSiteCiSuite(root);
    const paths = suite.tests.map((file) => "tests/" + file);
    console.log("Running " + suite.mode + " CI suite: " + paths.join(", "));
    const result = spawnSync(process.execPath, ["--test", ...paths], { cwd: root, stdio: "inherit" });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error("Site CI suite failed: " + error.message);
    process.exitCode = 1;
  }
}
