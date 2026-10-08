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

  function initializeMobileMenu() {
    var toggle = document.querySelector("[data-menu-toggle]");
    var header = document.querySelector("[data-market-header]");
    if (!toggle || !header) return;
    document.documentElement.classList.add("js");

    function setMenu(open, restoreFocus) {
      header.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      if (restoreFocus && typeof toggle.focus === "function") toggle.focus();
    }

    toggle.addEventListener("click", function () {
      setMenu(!header.classList.contains("menu-open"), false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || !header.classList.contains("menu-open")) return;
      event.preventDefault();
      setMenu(false, true);
    });
  }

  function initializeMarketplaceSearch() {
    var form = document.querySelector("[data-marketplace-search]");
    var input = document.querySelector("[data-marketplace-search-input]");
    var feedback = document.querySelector("[data-search-feedback]");
    var config = marketplace();
    if (!form || !input || !config) return;

    function setFeedback(message, invalid) {
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = message;
      }
      if (invalid) {
        input.setAttribute("aria-invalid", "true");
        input.focus();
      }
    }

    function clearFeedback() {
      if (feedback) {
        feedback.hidden = true;
        feedback.textContent = "";
      }
      input.removeAttribute("aria-invalid");
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var enteredQuery = input.value.trim();
      if (!enteredQuery) {
        setFeedback("Enter a business need, tool, or resource to search.", true);
        return;
      }

      clearFeedback();
      var query = enteredQuery.toLowerCase();
      var department = config.departments.find(function (candidate) {
        return candidate.published && (candidate.name + " " + candidate.summary + " " + candidate.needs.join(" ")).toLowerCase().indexOf(query) !== -1;
      });
      var guide = config.guides.find(function (candidate) {
        return (candidate.title + " " + candidate.summary).toLowerCase().indexOf(query) !== -1;
      });

      if (department) {
        window.location.assign(department.path);
      } else if (guide) {
        window.location.assign(guide.path);
      } else {
        setFeedback("No exact result for \u201c" + enteredQuery + "\u201d. Try promotional products, marketing, or business planning.", false);
      }
    });

    input.addEventListener("input", clearFeedback);
  }

  function initialize() {
    renderDepartmentCards();
    initializeAffiliateClickPreparation();
    initializeMobileMenu();
    initializeMarketplaceSearch();
    document.querySelectorAll("[data-current-year]").forEach(function (element) {
      element.textContent = String(new Date().getFullYear());
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
    else initialize();
  }
}());
