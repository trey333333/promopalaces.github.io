(function () {
  "use strict";

  function initialize() {
    var config = window.PromoPalacesMarketplace;
    var id = document.body.dataset.departmentId;
    if (!config || !id) return;
    var department = config.departments.find(function (candidate) { return candidate.id === id && candidate.published; });
    var target = document.querySelector("[data-department-detail]");
    if (!department || !target) return;

    document.title = department.name + " for Small Businesses | PromoPalaces";
    target.querySelector("[data-department-name]").textContent = department.name;
    target.querySelector("[data-department-summary]").textContent = department.summary;
    target.querySelector("[data-department-status]").textContent = "Marketplace category available";

    var policy = config.affiliatePolicy.promotionalMerchandisePartner;
    var partnerStatus = target.querySelector("[data-partner-status]");
    partnerStatus.textContent = policy.name + " is our featured promotional products partner. Affiliate attribution and offer terms remain unverified, so no offer, discount, commission, or Tool Finder recommendation is shown.";
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
    else initialize();
  }
}());
