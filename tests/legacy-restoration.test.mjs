import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { PACKAGE_PATH, REQUIRED_RISK_IDS, validateRestorationMode } from "../tools/validate-restoration-mode.mjs";

const ROOT = resolve(import.meta.dirname, "..");

function file(path) {
  return readFileSync(join(ROOT, ...path.split("/")), "utf8");
}

function activeRestoration() {
  const restoration = validateRestorationMode(ROOT);
  if (!restoration.active) return null;
  return restoration;
}

test("does not treat the normal marketplace as a historical restoration", () => {
  const restoration = validateRestorationMode(ROOT);
  if (!restoration.active) assert.equal(restoration.mode, "marketplace");
});

test("validates the complete historical package and restoration public tree", () => {
  const restoration = activeRestoration();
  if (!restoration) return;
  assert.equal(restoration.packageManifest.files.length, 31);
  assert.equal(file("CNAME").trim(), "promopalaces.com");
  assert.match(file("index.html"), /google-site-verification.*_PmGPjlrrsZPdBH-g_4dNeMzWwzHzXWD7X5C1pDrjA0/);
  assert.ok(file("google91250e6e2fdfde57.html").length > 0);
  assert.ok(!restoration.packageManifest.files.some((path) => path.startsWith("docs/") || path.startsWith("governance/") || path.startsWith("agents/") || path.startsWith("affiliates/")));
});

test("keeps required legacy pages, navigation, and Executive Advertising references", () => {
  const restoration = activeRestoration();
  if (!restoration) return;
  const pages = ["about.html", "affiliate-disclosure.html", "shop.html"];
  for (const page of pages) {
    const html = file(page);
    for (const href of ["index.html", "shop.html", "about.html", "affiliate-disclosure.html"]) assert.match(html, new RegExp('href="' + href + '"'));
  }
  const historicalPublic = file("index.html") + file("shop.html");
  assert.equal((historicalPublic.match(/executiveadvertising\.com/gi) ?? []).length, 50);
  assert.ok((historicalPublic.match(/https:\/\/www\.executiveadvertising\.com[^"\s]+/g) ?? []).length > 0);
});

test("records external dependencies and legacy compliance regressions for owner acknowledgement", () => {
  const restoration = activeRestoration();
  if (!restoration) return;
  const home = file("index.html");
  const packageReadme = file(PACKAGE_PATH + "/README.md");
  assert.match(home, /https:\/\/trey333333\.github\.io\/promopalaces\.github\.io\/images\//);
  assert.match(home, /https:\/\/cdn\.jsdelivr\.net\/npm\/bootstrap@5\.3\.0/);
  assert.match(home, /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/animate\.css\/4\.1\.1/);
  assert.match(packageReadme, /Missing adjacent affiliate disclosure/);
  assert.match(packageReadme, /blank `aid` parameter/);
  assert.match(packageReadme, /Missing sponsored-link attributes/);
  assert.match(home, /https:\/\/www\.executiveadvertising\.com\/made-in-usa\?aid="/);
  assert.doesNotMatch(home, /sponsored noopener noreferrer/);
  assert.deepEqual(restoration.config.owner_acknowledgement.risk_ids, REQUIRED_RISK_IDS);
});
