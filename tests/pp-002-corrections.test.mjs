import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const ROOT = resolve(import.meta.dirname, "..");
const BASELINE_COMMIT = "d35f83f";
const GOOGLE_VERIFICATION = "_PmGPjlrrsZPdBH-g_4dNeMzWwzHzXWD7X5C1pDrjA0";
const LEGACY_BLANK_AID_URL = "https://www.executiveadvertising.com/made-in-usa?aid=";
const MARKETPLACE_PAGES = [
  "index.html",
  "departments.html",
  "promotional-products.html",
  "tool-finder.html",
  "resources.html",
  "about.html",
  "affiliate-disclosure.html",
  "shop.html"
];

function page(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function runtime() {
  const sandbox = { window: {} };
  vm.runInNewContext(page("assets/js/marketplace-config.js"), sandbox);
  vm.runInNewContext(page("assets/js/tool-finder.js"), sandbox);
  return sandbox.window;
}

function executiveAdvertisingHrefs(html) {
  return [...html.matchAll(/<a\b[^>]*\bhref="(https:\/\/www\.executiveadvertising\.com[^"]+)"[^>]*>/g)].map((match) => match[1]);
}

function executiveAdvertisingTags(html) {
  return [...html.matchAll(/<a\b[^>]*\bhref="https:\/\/www\.executiveadvertising\.com[^"]+"[^>]*>/g)].map((match) => match[0]);
}

function primaryNavigation(html) {
  const navigation = html.match(/<nav\b(?=[^>]*\bclass="site-nav")(?=[^>]*\baria-label="Primary navigation")[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(navigation, "Expected the shared primary navigation.");
  return navigation[1];
}

test("restores verification and places an accurate disclosure before the legacy catalog links", () => {
  assert.match(page("index.html"), new RegExp('<meta name="google-site-verification" content="' + GOOGLE_VERIFICATION + '">'));

  const legacy = page("legacy-promotional-products.html");
  const disclosure = "PromoPalaces is a participant in the Executive Advertising Affiliate Program and may earn commissions from qualifying purchases made through our affiliate links at no additional cost to you.";
  assert.ok(legacy.includes(disclosure));
  assert.ok(legacy.indexOf(disclosure) < legacy.indexOf("https://www.executiveadvertising.com/on-sale?aid=1056"));
  assert.ok(page("affiliate-disclosure.html").includes(disclosure));
  assert.match(page("docs/affiliate/PP-002-disclosure-wording-for-owner-approval.md"), /Draft for owner approval/);
});

test("uses featured-partner public language while retaining the internal EA-only policy", () => {
  const publicMarkup = [...MARKETPLACE_PAGES, "legacy-promotional-products.html"].map(page).join("\n");
  assert.doesNotMatch(publicMarkup, /\bexclusive promotional merchandise partner\b/i);
  assert.match(page("promotional-products.html"), /featured promotional products partner/i);

  const config = runtime().PromoPalacesMarketplace;
  const partner = config.affiliatePolicy.promotionalMerchandisePartner;
  assert.equal(partner.name, "Executive Advertising");
  assert.equal(partner.exclusive, true);
  assert.equal(partner.attributionStatus, "unverified");
  assert.equal(partner.offerStatus, "unverified");
});

test("preserves every pre-PP-002 EA href and restricts promotional referrals to EA", () => {
  const legacy = page("legacy-promotional-products.html");
  const originalHomepage = execFileSync("git", ["show", BASELINE_COMMIT + ":index.html"], { cwd: ROOT, encoding: "utf8" });
  const originalUrls = executiveAdvertisingHrefs(originalHomepage);
  const legacyUrls = executiveAdvertisingHrefs(legacy);
  assert.deepEqual(legacyUrls, originalUrls);
  assert.equal(legacyUrls.length, 46);

  const pageSources = [...MARKETPLACE_PAGES, "legacy-promotional-products.html"].map((path) => ({ path, html: page(path) }));
  for (const source of pageSources) {
    for (const href of executiveAdvertisingHrefs(source.html)) {
      const parsed = new URL(href);
      assert.equal(parsed.hostname, "www.executiveadvertising.com");
      const aidValues = parsed.searchParams.getAll("aid");
      assert.equal(aidValues.length, 1, "Expected exactly one aid parameter in " + href);
      if (aidValues[0] === "") {
        assert.equal(source.path, "legacy-promotional-products.html");
        assert.equal(href, LEGACY_BLANK_AID_URL);
      } else {
        assert.equal(aidValues[0], "1056");
      }
    }

    for (const href of [...source.html.matchAll(/<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>/g)].map((match) => match[1])) {
      assert.equal(new URL(href).hostname, "www.executiveadvertising.com", "Unexpected external referral: " + href);
    }
  }

  assert.match(legacy, /<form\b[^>]*action="https:\/\/www\.executiveadvertising\.com\/promotional-products\/search\/"[^>]*>[\s\S]*?<input type="hidden" name="aid" value="1056">/);
});

test("marks all existing EA outbound links as proposed sponsored links without changing destinations", () => {
  for (const source of ["legacy-promotional-products.html", "shop.html"]) {
    const html = page(source);
    const tags = executiveAdvertisingTags(html);
    assert.ok(tags.length > 0);
    for (const tag of tags) {
      assert.match(tag, /\btarget="_blank"/);
      assert.match(tag, /\brel="sponsored noopener noreferrer"/);
    }
  }

  assert.match(page("legacy-promotional-products.html"), /<form\b[^>]*\btarget="_blank"[^>]*\brel="sponsored noopener noreferrer"[^>]*>/);
  assert.match(page("docs/affiliate/PP-002-disclosure-wording-for-owner-approval.md"), /affiliate-tracking impact review and owner authorization/);
});

test("returns useful, explained, non-affiliate results for every valid Tool Finder combination", () => {
  const window = runtime();
  const config = window.PromoPalacesMarketplace;
  const finder = window.PromoPalacesToolFinder;

  for (const businessType of Object.keys(config.finderRules.businessTypes)) {
    for (const businessStage of Object.keys(config.finderRules.stages)) {
      for (const primaryNeed of Object.keys(config.finderRules.needs)) {
        const result = finder.find({ businessType, businessStage, primaryNeed }, config);
        assert.ok(result.departments.length + result.guides.length > 0);
        assert.ok(result.guides.length > 0);
        for (const recommendation of [...result.departments, ...result.plannedDepartments, ...result.guides]) {
          assert.ok(recommendation.reasons.length > 0, "Missing explanation for " + recommendation.id);
        }
        assert.deepEqual(JSON.parse(JSON.stringify(result.affiliateRecommendations)), []);
      }
    }
  }

  const finderPage = page("tool-finder.html");
  assert.doesNotMatch(finderPage, /name="budget"/);
  assert.doesNotMatch(page("assets/js/tool-finder.js"), /\bbudget\b/);
  assert.match(finderPage, /data-finder-results aria-live="polite" hidden/);
  assert.doesNotMatch(page("assets/js/tool-finder.js"), /target\.focus\(\)/);
  assert.match(page("assets/js/tool-finder.js"), /Why this is shown:/);
});

test("keeps published navigation usable without JavaScript and confines indexing to canonical pages", () => {
  for (const path of MARKETPLACE_PAGES) {
    const navigation = primaryNavigation(page(path));
    for (const href of ["index.html", "departments.html", "tool-finder.html", "resources.html", "affiliate-disclosure.html"]) {
      assert.match(navigation, new RegExp('href="' + href + '"'));
    }
  }
  const legacyNavigation = page("legacy-promotional-products.html").match(/<nav[^>]*aria-label="Primary navigation"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(legacyNavigation, "Expected the retained catalog to have the shared primary navigation.");
  for (const href of ["index.html", "departments.html", "tool-finder.html", "resources.html", "affiliate-disclosure.html"]) {
    assert.match(legacyNavigation[1], new RegExp('href="' + href + '"'));
  }

  const home = page("index.html");
  assert.match(home, /<article class="department-card department-card--active" data-home-department="promotional-products">[\s\S]*?href="promotional-products\.html"/);
  assert.doesNotMatch(home, /Enable JavaScript to load currently available/);
  const departments = page("departments.html");
  assert.match(departments, /<article class="card department-card">[\s\S]*?href="promotional-products\.html"/);
  assert.doesNotMatch(departments, /Enable JavaScript to load currently available/);

  const sitemap = page("sitemap.xml");
  for (const path of ["legacy-promotional-products.html", "shop.html"]) {
    assert.doesNotMatch(sitemap, new RegExp(path.replace(".", "\\.")));
    const html = page(path);
    assert.match(html, /<meta name="robots" content="noindex,follow">/);
    assert.match(html, new RegExp('<link rel="canonical" href="https://promopalaces\\.com/' + path.replace(".", "\\.") + '">'));
  }

  const manifest = JSON.parse(page("deployment/public-assets.json"));
  for (const department of runtime().PromoPalacesMarketplace.departments.filter((department) => !department.published)) {
    assert.ok(!manifest.files.includes(department.id + ".html"), "Unpublished department is in the public artifact: " + department.id);
  }
});
