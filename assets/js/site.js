(function () {
  "use strict";

  function marketplace() {
    return window.PromoPalacesMarketplace;
  }

  function renderDepartmentCards() {
    var target = document.querySelector("[data-department-cards]");
    var config = marketplace();
    if (!target || !config) return;
    var published = config.departments.filter(function (department) { return department.published; });
    target.innerHTML = "";
    published.forEach(function (department) {
      var article = document.createElement("article");
      article.className = "card department-card";
      article.innerHTML = "<span class=\"icon-chip\">Available now</span><h3></h3><p></p><a></a>";
      article.querySelector("h3").textContent = department.name;
      article.querySelector("p").textContent = department.summary;
      var link = article.querySelector("a");
      link.href = department.path;
      link.textContent = "Explore " + department.name;
      target.appendChild(article);
    });
  }

  function initializeAffiliateClickPreparation() {
    document.addEventListener("click", function (event) {
      var link = event.target.closest("a[data-affiliate-link]");
      if (!link) return;
      window.dispatchEvent(new CustomEvent("promopalaces:affiliate-click", {
        detail: {
          partner: link.dataset.affiliatePartner || "unconfigured",
          destination: link.href
        }
      }));
    });
  }

  function initialize() {
    renderDepartmentCards();
    initializeAffiliateClickPreparation();
    document.querySelectorAll("[data-current-year]").forEach(function (element) {
      element.textContent = String(new Date().getFullYear());
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
    else initialize();
  }
}());
