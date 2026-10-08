(function () {
  "use strict";

  function unique(values) {
    return values.filter(function (value, index) { return values.indexOf(value) === index; });
  }

  function addReason(reasonsById, id, reason) {
    if (!reasonsById[id]) reasonsById[id] = [];
    if (reasonsById[id].indexOf(reason) === -1) reasonsById[id].push(reason);
  }

  function addRuleReasons(reasonsById, ids, reason) {
    ids.forEach(function (id) {
      addReason(reasonsById, id, reason);
    });
  }

  function attachReasons(items, reasonsById) {
    return items.map(function (item) {
      return Object.assign({}, item, { reasons: reasonsById[item.id] || [] });
    });
  }

  function find(input, config) {
    var rules = config.finderRules;
    var departmentReasons = {};
    addRuleReasons(departmentReasons, rules.businessTypes[input.businessType] || [], "Matches your selected business type.");
    addRuleReasons(departmentReasons, rules.stages[input.businessStage] || [], "Matches your selected business stage.");
    addRuleReasons(departmentReasons, rules.needs[input.primaryNeed] || [], "Matches your selected primary need.");

    var departmentIds = unique(Object.keys(departmentReasons));
    var selectedGuideIds = rules.guideIds[input.primaryNeed] || [];
    var guideIds = unique(selectedGuideIds.concat(["tool-selection"]));
    var guideReasons = {};
    addRuleReasons(guideReasons, selectedGuideIds, "Supports your selected primary need.");
    addReason(guideReasons, "tool-selection", selectedGuideIds.indexOf("tool-selection") === -1
      ? "Helps you compare next steps without relying on an unverified recommendation."
      : "Supports your selected primary need.");

    var departments = departmentIds.map(function (id) {
      return config.departments.find(function (department) { return department.id === id; });
    }).filter(Boolean);
    var publishedDepartments = attachReasons(departments.filter(function (department) { return department.published; }), departmentReasons);
    var plannedDepartments = attachReasons(departments.filter(function (department) { return !department.published; }), departmentReasons);
    var guides = attachReasons(guideIds.map(function (id) {
      return config.guides.find(function (guide) { return guide.id === id; });
    }).filter(Boolean), guideReasons);
    var approvedAffiliateRecommendations = publishedDepartments.flatMap(function (department) {
      return department.approvedAffiliateRecommendations || [];
    }).filter(function (recommendation) { return recommendation.approved === true; });

    return {
      input: input,
      departments: publishedDepartments,
      plannedDepartments: plannedDepartments,
      guides: guides,
      affiliateRecommendations: approvedAffiliateRecommendations
    };
  }

  function listItems(items, label, renderer) {
    if (!items.length) return "<p class=\"muted\">" + label + "</p>";
    return "<ul class=\"result-list\">" + items.map(renderer).join("") + "</ul>";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function reasonsText(item) {
    if (!item.reasons || !item.reasons.length) return "";
    return "<br><span class=\"muted\"><strong>Why this is shown:</strong> " + item.reasons.map(escapeHtml).join(" ") + "</span>";
  }

  function render(result, target) {
    var available = listItems(result.departments, "No live departments match this combination yet.", function (department) {
      return "<li><a href=\"" + escapeHtml(department.path) + "\">" + escapeHtml(department.name) + "</a><br><span class=\"muted\">" + escapeHtml(department.summary) + "</span>" + reasonsText(department) + "</li>";
    });
    var guides = listItems(result.guides, "No guide is available for this selection yet.", function (guide) {
      return "<li><a href=\"" + escapeHtml(guide.path) + "\">" + escapeHtml(guide.title) + "</a><br><span class=\"muted\">" + escapeHtml(guide.summary) + "</span>" + reasonsText(guide) + "</li>";
    });
    var planned = result.plannedDepartments.length
      ? "<section><h2>Planned categories, not yet published</h2>" + listItems(result.plannedDepartments, "", function (department) {
        return "<li><strong>" + escapeHtml(department.name) + "</strong><br><span class=\"muted\">" + escapeHtml(department.summary) + "</span>" + reasonsText(department) + "</li>";
      }) + "</section>"
      : "";
    var affiliates = result.affiliateRecommendations.length
      ? listItems(result.affiliateRecommendations, "", function (recommendation) { return "<li>" + escapeHtml(recommendation.name) + "</li>"; })
      : "<p class=\"muted\">No approved affiliate recommendations are available for this result.</p>";

    target.innerHTML = "<div class=\"result-layout\"><section><h2>Relevant departments</h2>" + available + "</section><section><h2>Useful planning resources</h2>" + guides + "</section></div>" + planned + "<section><h2>Approved affiliate recommendations</h2>" + affiliates + "</section>";
    target.hidden = false;
  }

  function initialize() {
    var form = document.querySelector("[data-tool-finder]");
    var target = document.querySelector("[data-finder-results]");
    var config = window.PromoPalacesMarketplace;
    if (!form || !target || !config) return;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(form);
      render(find({
        businessType: data.get("business-type"),
        businessStage: data.get("business-stage"),
        primaryNeed: data.get("primary-need")
      }, config), target);
    });
  }

  window.PromoPalacesToolFinder = { find: find };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
    else initialize();
  }
}());
