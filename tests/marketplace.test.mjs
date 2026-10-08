import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import vm from "node:vm";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const configSource = readFileSync(join(ROOT, "assets/js/marketplace-config.js"), "utf8");
const finderSource = readFileSync(join(ROOT, "assets/js/tool-finder.js"), "utf8");
const manifest = JSON.parse(readFileSync(join(ROOT, "deployment/public-assets.json"), "utf8"));

function marketplaceRuntime() {
  const sandbox = { window: {} };
  vm.runInNewContext(configSource, sandbox);
  vm.runInNewContext(finderSource, sandbox);
  return sandbox.window;
}

function page(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

test("defines the complete 16-department marketplace without publishing empty departments", () => {
  const config = marketplaceRuntime().PromoPalacesMarketplace;
  assert.equal(config.departments.length, 16);
  assert.equal(new Set(config.departments.map((department) => department.id)).size, 16);
  assert.deepEqual(
    JSON.parse(JSON.stringify(config.departments.map((department) => department.name))),
    [
      "Promotional Products", "Websites & Ecommerce", "Email Marketing", "Social Media Marketing",
      "SEO & Advertising", "Branding & Design", "Sales & CRM", "Accounting & Finance",
      "AI & Automation", "Business Operations", "HR & Payroll", "Customer Support",
      "Security & IT", "Training & Education", "Shipping & Logistics", "Business Services"
    ]
  );
  const published = config.departments.filter((department) => department.published);
  assert.equal(published.length, 1);
  assert.equal(published[0].id, "promotional-products");
  assert.match(page("departments.html"), /not published as empty directories/);
});

test("enforces Executive Advertising exclusivity and preserves legacy affiliate-link integrity", () => {
  const config = marketplaceRuntime().PromoPalacesMarketplace;
  const partner = config.affiliatePolicy.promotionalMerchandisePartner;
  assert.equal(partner.name, "Executive Advertising");
  assert.equal(partner.affiliateId, "1056");
  assert.equal(partner.exclusive, true);
  assert.equal(partner.attributionStatus, "unverified");
  assert.equal(partner.offerStatus, "unverified");
  assert.deepEqual(JSON.parse(JSON.stringify(partner.approvedAffiliateRecommendations)), []);

  const publicHtml = ["index.html", "departments.html", "promotional-products.html", "tool-finder.html", "resources.html", "about.html", "affiliate-disclosure.html", "shop.html", "legacy-promotional-products.html"].map(page).join("\n");
  assert.doesNotMatch(publicHtml, /(4imprint|vistaprint|customink|discountmugs|zazzle)\./i);
  const legacyEaUrls = [...page("legacy-promotional-products.html").matchAll(/href="(https:\/\/www\.executiveadvertising\.com[^"]+)"/g)].map((match) => match[1]);
  assert.equal(legacyEaUrls.length, 46);
  assert.ok(legacyEaUrls.includes("https://www.executiveadvertising.com/made-in-usa?aid="));
  const eaUrls = [...publicHtml.matchAll(/href="(https:\/\/www\.executiveadvertising\.com[^"]+)"/g)].map((match) => match[1]);
  assert.ok(eaUrls.length >= legacyEaUrls.length);
  for (const url of eaUrls) assert.match(url, /[?&]aid=(?:1056)?(?:&|$)/);
});

test("returns deterministic Tool Finder results with no unapproved affiliate recommendations", () => {
  const runtime = marketplaceRuntime();
  const input = { businessType: "local-service", businessStage: "starting", primaryNeed: "marketing", budget: "under-500" };
  const first = runtime.PromoPalacesToolFinder.find(input, runtime.PromoPalacesMarketplace);
  const second = runtime.PromoPalacesToolFinder.find(input, runtime.PromoPalacesMarketplace);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  assert.deepEqual(JSON.parse(JSON.stringify(first.departments.map((department) => department.id))), ["promotional-products"]);
  assert.ok(first.plannedDepartments.length > 0);
  assert.ok(first.guides.length > 0);
  assert.deepEqual(JSON.parse(JSON.stringify(first.affiliateRecommendations)), []);
});

test("provides consistent marketplace navigation and essential SEO metadata", () => {
  const pages = [
    "index.html", "departments.html", "promotional-products.html", "tool-finder.html",
    "resources.html", "about.html", "affiliate-disclosure.html", "shop.html"
  ];
  for (const path of pages) {
    const html = page(path);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.match(html, /<link rel="canonical" href="https:\/\/promopalaces\.com\//);
    assert.match(html, /<main id="main-content">/);
    assert.match(html, /<h1(?:\s[^>]*)?>/);
    assert.match(html, /aria-label="Primary navigation"/);
  }
  const home = page("index.html");
  for (const link of ["departments.html", "tool-finder.html", "resources.html", "affiliate-disclosure.html"]) {
    assert.match(home, new RegExp('href="' + link + '"'));
  }
  assert.match(page("legacy-promotional-products.html"), /<meta name="robots" content="noindex,follow">/);
  assert.match(page("robots.txt"), /Sitemap: https:\/\/promopalaces\.com\/sitemap\.xml/);
  assert.match(page("sitemap.xml"), /https:\/\/promopalaces\.com\/tool-finder\.html/);
});

test("allowlists marketplace assets while keeping configuration and governance internal paths out", () => {
  for (const asset of [
    "assets/css/marketplace.css", "assets/js/marketplace-config.js", "assets/js/site.js",
    "assets/js/tool-finder.js", "assets/js/department-page.js", "departments.html",
    "promotional-products.html", "tool-finder.html", "resources.html", "robots.txt", "sitemap.xml"
  ]) assert.ok(manifest.files.includes(asset), "Missing public asset: " + asset);
  for (const internal of ["agents/registry.json", "governance/decision-log.json", "docs/content-briefs/PP-002-initial-content-briefs.md", "tests/marketplace.test.mjs"]) {
    assert.ok(!manifest.files.includes(internal), "Internal file exposed: " + internal);
  }
  const publicCode = [page("index.html"), page("assets/js/site.js"), page("assets/js/tool-finder.js")].join("\n");
  assert.doesNotMatch(publicCode, /(googletagmanager|gtag\()/i);
  assert.doesNotMatch(publicCode, /G-[A-Z0-9]{6,}/);
});
