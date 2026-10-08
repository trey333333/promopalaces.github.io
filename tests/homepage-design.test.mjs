import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const ROOT = resolve(import.meta.dirname, "..");
const GOOGLE_VERIFICATION = "_PmGPjlrrsZPdBH-g_4dNeMzWwzHzXWD7X5C1pDrjA0";

function file(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function marketplaceConfig() {
  const sandbox = { window: {} };
  vm.runInNewContext(file("assets/js/marketplace-config.js"), sandbox);
  return sandbox.window.PromoPalacesMarketplace;
}

function runHomepageSearch(query) {
  const listeners = {};
  const attributes = {};
  const form = {
    addEventListener(type, handler) { listeners[type] = handler; }
  };
  const input = {
    value: query,
    focused: false,
    addEventListener() {},
    focus() { this.focused = true; },
    removeAttribute(name) { delete attributes[name]; },
    setAttribute(name, value) { attributes[name] = value; }
  };
  const feedback = { hidden: true, textContent: "" };
  const navigation = { destination: null, assign(destination) { this.destination = destination; } };
  const document = {
    readyState: "complete",
    documentElement: { classList: { add() {} } },
    addEventListener() {},
    querySelector(selector) {
      if (selector === "[data-marketplace-search]") return form;
      if (selector === "[data-marketplace-search-input]") return input;
      if (selector === "[data-search-feedback]") return feedback;
      return null;
    },
    querySelectorAll() { return []; }
  };
  const sandbox = {
    CustomEvent: function CustomEvent() {},
    document,
    window: {
      PromoPalacesMarketplace: marketplaceConfig(),
      dispatchEvent() {},
      location: navigation
    }
  };

  vm.runInNewContext(file("assets/js/site.js"), sandbox);
  listeners.submit({ preventDefault() {} });
  return { attributes, feedback, focused: input.focused, destination: navigation.destination };
}

test("builds a complete, accessible marketplace header and hero without changing SEO verification", () => {
  const home = file("index.html");
  assert.match(home, /<body class="home-page">/);
  assert.match(home, new RegExp('<meta name="google-site-verification" content="' + GOOGLE_VERIFICATION + '">'));
  assert.match(home, /<link rel="canonical" href="https:\/\/promopalaces\.com\/">/);
  assert.match(home, /<link rel="stylesheet" href="assets\/css\/homepage\.css">/);
  assert.match(home, /brand__crown/);
  assert.match(home, /data-marketplace-search/);
  assert.match(home, /data-marketplace-search-input/);
  assert.match(home, /data-menu-toggle[^>]*aria-controls="primary-navigation"/);
  assert.match(home, /<nav class="site-nav" aria-label="Primary navigation" id="primary-navigation">/);
  assert.doesNotMatch(home, /market-department-nav/);
  assert.match(home, /<h1>Everything Your Business Needs to Succeed\.<\/h1>/);
  assert.match(home, /images\/marketplace\/hero-workspace\.jpg" width="1672" height="941"/);
  assert.match(home, /fetchpriority="high"/);
  assert.match(home, /Find Your Next Business Tool/);
});

test("renders all configured departments with one live route and no unpublished empty-page links", () => {
  const home = file("index.html");
  const config = marketplaceConfig();
  const cards = [...home.matchAll(/<article class="department-card[^"]*" data-home-department="([^"]+)">([\s\S]*?)<\/article>/g)];
  assert.equal(cards.length, 16);
  assert.deepEqual(
    cards.map((card) => card[1]),
    JSON.parse(JSON.stringify(config.departments.map((department) => department.id)))
  );
  assert.equal((home.match(/department-card--active/g) || []).length, 1);
  assert.equal((home.match(/department-card--coming/g) || []).length, 15);
  assert.equal((home.match(/class="department-card__icon" aria-hidden="true"><svg/g) || []).length, 16);

  for (const card of cards) {
    const id = card[1];
    const body = card[2];
    if (id === "promotional-products") {
      assert.match(body, /Available now/);
      assert.match(body, /href="promotional-products\.html"/);
    } else {
      assert.match(body, /Coming soon/);
      assert.doesNotMatch(body, /<a\b[^>]*href=/);
    }
  }
});

test("keeps the Tool Finder, featured partner, resources, and disclosures conversion-focused but claim-safe", () => {
  const home = file("index.html");
  assert.match(home, /finder-feature/);
  assert.equal((home.match(/finder-step__icon/g) || []).length, 3);
  assert.match(home, /Share your starting point/);
  assert.match(home, /Get a focused match/);
  assert.match(home, /Take a clear next step/);
  assert.match(home, /href="tool-finder\.html"/);
  assert.match(home, /Executive Advertising is our featured promotional products partner\./);
  assert.match(home, /Promotional offers will appear once terms and attribution are verified/);
  assert.match(home, /images\/marketplace\/executive-advertising-merchandise\.jpg/);
  assert.match(home, /not a verified Executive Advertising catalog selection/);
  assert.match(home, /partner-feature__checklist/);
  assert.match(home, /loading="lazy"/);
  assert.match(home, /images\/marketplace\/resource-launch-planning\.jpg/);
  assert.match(home, /images\/marketplace\/resource-marketing-foundations\.jpg/);
  assert.match(home, /images\/marketplace\/resource-tool-selection\.jpg/);
  assert.equal((home.match(/class="resource-card__image"/g) || []).length, 3);
  assert.equal((home.match(/class="resource-card__media"/g) || []).length, 3);
  assert.match(home, /resources\.html#launch-planning/);
  assert.match(home, /resources\.html#marketing-basics/);
  assert.match(home, /resources\.html#tool-selection/);
  assert.match(home, /Affiliate Disclosure/);
  assert.doesNotMatch(home, /https:\/\/www\.executiveadvertising\.com/);
  assert.doesNotMatch(home, /\bPALACE\b/);
  assert.doesNotMatch(home, /\$25 off/i);
});

test("allowlists optimized local design assets and supplies responsive, keyboard-safe homepage styling", () => {
  const manifest = JSON.parse(file("deployment/public-assets.json"));
  const assets = [
    "assets/css/homepage.css",
    "images/marketplace/hero-workspace.jpg",
    "images/marketplace/executive-advertising-merchandise.jpg",
    "images/marketplace/resource-launch-planning.jpg",
    "images/marketplace/resource-marketing-foundations.jpg",
    "images/marketplace/resource-tool-selection.jpg"
  ];
  for (const asset of assets) assert.ok(manifest.files.includes(asset), "Missing public design asset: " + asset);
  for (const image of assets.slice(1)) {
    assert.ok(statSync(join(ROOT, image)).size < 300000, "Image is not optimized for a static homepage: " + image);
  }

  const css = file("assets/css/homepage.css");
  assert.match(css, /\.home-page \.department-grid/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.home-page \.department-grid,[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /overflow-x: clip/);
  assert.match(css, /\.home-page \.department-card__icon svg/);
  assert.match(css, /\.home-page \.department-card--active:hover/);
  assert.doesNotMatch(css, /\.home-page \.department-card:hover/);
  assert.match(css, /\.home-page \.department-card p:not\(\.department-card__status\) \{[\s\S]*?font-size: \.875rem/);
  assert.match(css, /\.home-page \.finder-step__icon svg/);
  assert.match(css, /\.home-page \.finder-feature \.eyebrow \{[\s\S]*?color: #083b86/);
  assert.match(css, /\.home-page \.resource-card__media \{[\s\S]*?aspect-ratio: 16 \/ 9/);
  assert.match(css, /\.home-page \.resource-card__image \{[\s\S]*?height: auto/);
  assert.match(css, /\.home-page \.resource-card \{[\s\S]*?min-height: 23\.4rem/);
  assert.match(css, /scroll-margin-top: 8\.75rem/);
  assert.match(css, /\.js \.home-page \.menu-toggle \{[\s\S]*?display: inline-flex/);
  assert.match(css, /\.js \.home-page \.site-nav/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 470px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(file("assets/js/site.js"), /initializeMobileMenu/);
  assert.match(file("assets/js/site.js"), /initializeMarketplaceSearch/);
  assert.match(file("assets/js/site.js"), /event\.key !== "Escape"/);
  assert.match(file("assets/js/site.js"), /toggle\.focus\(\)/);
});

test("keeps search assistance on-page for empty and unmatched searches", () => {
  const empty = runHomepageSearch("");
  assert.equal(empty.destination, null);
  assert.equal(empty.attributes["aria-invalid"], "true");
  assert.equal(empty.focused, true);
  assert.match(empty.feedback.textContent, /Enter a business need/);

  const unmatched = runHomepageSearch("unmatched phrase");
  assert.equal(unmatched.destination, null);
  assert.match(unmatched.feedback.textContent, /No exact result/);
  assert.match(unmatched.feedback.textContent, /promotional products, marketing, or business planning/);

  const matched = runHomepageSearch("promotional");
  assert.equal(matched.destination, "promotional-products.html");
});

test("records AI-image provenance and keeps illustrative merchandise separate from catalog claims", () => {
  const provenance = file("docs/content/PP-002-marketplace-image-provenance.md");
  const manifest = JSON.parse(file("deployment/public-assets.json"));
  const images = [
    "images/marketplace/hero-workspace.jpg",
    "images/marketplace/executive-advertising-merchandise.jpg",
    "images/marketplace/resource-launch-planning.jpg",
    "images/marketplace/resource-marketing-foundations.jpg",
    "images/marketplace/resource-tool-selection.jpg"
  ];
  for (const image of images) assert.match(provenance, new RegExp(image.replaceAll(".", "\\.")));
  assert.equal((provenance.match(/Yes — OpenAI built-in image generation/g) || []).length, 5);
  assert.match(provenance, /not a verified Executive Advertising catalog selection/);
  assert.equal(manifest.files.includes("docs/content/PP-002-marketplace-image-provenance.md"), false);
});
