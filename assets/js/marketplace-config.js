(function () {
  "use strict";

  var departments = [
    { id: "promotional-products", name: "Promotional Products", summary: "Branded merchandise for customer appreciation, events, and team visibility.", published: true, path: "promotional-products.html", needs: ["marketing", "brand-awareness", "events"], guideIds: ["marketing-basics", "budget-planning"] },
    { id: "websites-ecommerce", name: "Websites & Ecommerce", summary: "Website and online-store planning for a clear digital front door.", published: false, needs: ["website", "sales"], guideIds: ["launch-planning", "tool-selection"] },
    { id: "email-marketing", name: "Email Marketing", summary: "Audience, campaign, and retention planning for email.", published: false, needs: ["marketing", "customer-retention"], guideIds: ["marketing-basics", "tool-selection"] },
    { id: "social-media-marketing", name: "Social Media Marketing", summary: "Channel planning and content systems for social presence.", published: false, needs: ["marketing", "brand-awareness"], guideIds: ["marketing-basics", "local-growth"] },
    { id: "seo-advertising", name: "SEO & Advertising", summary: "Search visibility and paid-media planning with measurable goals.", published: false, needs: ["marketing", "customer-acquisition"], guideIds: ["marketing-basics", "local-growth"] },
    { id: "branding-design", name: "Branding & Design", summary: "Brand foundations, design systems, and consistent customer touchpoints.", published: false, needs: ["brand-awareness", "website"], guideIds: ["launch-planning", "budget-planning"] },
    { id: "sales-crm", name: "Sales & CRM", summary: "Lead management and sales-process planning.", published: false, needs: ["sales", "customer-retention"], guideIds: ["tool-selection", "local-growth"] },
    { id: "accounting-finance", name: "Accounting & Finance", summary: "Financial operations planning for sustainable small businesses.", published: false, needs: ["finance", "operations"], guideIds: ["launch-planning", "budget-planning"] },
    { id: "ai-automation", name: "AI & Automation", summary: "Practical workflow-automation planning without unnecessary complexity.", published: false, needs: ["automation", "operations"], guideIds: ["tool-selection", "operations-basics"] },
    { id: "business-operations", name: "Business Operations", summary: "Repeatable systems for day-to-day business management.", published: false, needs: ["operations", "automation"], guideIds: ["operations-basics", "launch-planning"] },
    { id: "hr-payroll", name: "HR & Payroll", summary: "People-process planning as a business begins to hire.", published: false, needs: ["hiring", "operations"], guideIds: ["operations-basics", "launch-planning"] },
    { id: "customer-support", name: "Customer Support", summary: "Support workflows that build confidence and repeat business.", published: false, needs: ["customer-retention", "operations"], guideIds: ["operations-basics", "local-growth"] },
    { id: "security-it", name: "Security & IT", summary: "Basic technology and security planning for small organizations.", published: false, needs: ["security", "operations"], guideIds: ["operations-basics", "tool-selection"] },
    { id: "training-education", name: "Training & Education", summary: "Training plans and business learning resources.", published: false, needs: ["training", "operations"], guideIds: ["launch-planning", "operations-basics"] },
    { id: "shipping-logistics", name: "Shipping & Logistics", summary: "Fulfillment and delivery planning for goods-based businesses.", published: false, needs: ["shipping", "operations"], guideIds: ["operations-basics", "tool-selection"] },
    { id: "business-services", name: "Business Services", summary: "Specialist-service planning for tasks that need outside expertise.", published: false, needs: ["operations", "finance", "legal"], guideIds: ["launch-planning", "tool-selection"] }
  ];

  var guides = [
    { id: "launch-planning", title: "Business launch planning worksheet", summary: "Clarify the customer, offer, first operating systems, and next actions.", path: "resources.html#launch-planning" },
    { id: "marketing-basics", title: "Small-business marketing foundations", summary: "Choose one audience, one message, and a measurable next marketing step.", path: "resources.html#marketing-basics" },
    { id: "local-growth", title: "Local business growth checklist", summary: "Organize visibility, referrals, follow-up, and customer experience priorities.", path: "resources.html#local-growth" },
    { id: "operations-basics", title: "Operations readiness checklist", summary: "Document repeatable work before adding more tools or complexity.", path: "resources.html#operations-basics" },
    { id: "tool-selection", title: "Tool selection questions", summary: "Compare business tools by workflow fit, data needs, cost, and support.", path: "resources.html#tool-selection" },
    { id: "budget-planning", title: "Business budget planning prompts", summary: "Prioritize essential work before optional subscriptions or promotions.", path: "resources.html#budget-planning" }
  ];

  var finderRules = {
    businessTypes: {
      "local-service": ["promotional-products", "social-media-marketing", "seo-advertising", "sales-crm"],
      "retail-ecommerce": ["websites-ecommerce", "shipping-logistics", "email-marketing", "promotional-products"],
      "professional-service": ["websites-ecommerce", "branding-design", "sales-crm", "accounting-finance"],
      "creator-freelancer": ["websites-ecommerce", "branding-design", "email-marketing", "ai-automation"],
      "product-business": ["promotional-products", "shipping-logistics", "websites-ecommerce", "business-operations"]
    },
    stages: {
      starting: ["websites-ecommerce", "branding-design", "accounting-finance", "business-operations"],
      operating: ["sales-crm", "email-marketing", "customer-support", "security-it"],
      growing: ["seo-advertising", "ai-automation", "hr-payroll", "training-education"]
    },
    needs: {
      marketing: ["promotional-products", "email-marketing", "social-media-marketing", "seo-advertising", "branding-design"],
      sales: ["sales-crm", "websites-ecommerce", "business-services"],
      operations: ["business-operations", "ai-automation", "accounting-finance", "customer-support"],
      "online-presence": ["websites-ecommerce", "branding-design", "seo-advertising"],
      "customer-growth": ["promotional-products", "email-marketing", "sales-crm", "customer-support"],
      "team-management": ["hr-payroll", "training-education", "business-operations"],
      "shipping-fulfillment": ["shipping-logistics", "business-operations"],
      security: ["security-it", "business-operations"]
    },
    guideIds: {
      marketing: ["marketing-basics", "budget-planning", "local-growth"],
      sales: ["tool-selection", "local-growth"],
      operations: ["operations-basics", "tool-selection"],
      "online-presence": ["launch-planning", "tool-selection"],
      "customer-growth": ["marketing-basics", "local-growth"],
      "team-management": ["operations-basics", "launch-planning"],
      "shipping-fulfillment": ["operations-basics", "tool-selection"],
      security: ["operations-basics", "tool-selection"]
    }
  };

  window.PromoPalacesMarketplace = Object.freeze({
    brand: "PromoPalaces",
    positioning: "Everything Your Business Needs to Succeed.",
    departments: departments,
    guides: guides,
    finderRules: finderRules,
    affiliatePolicy: {
      promotionalMerchandisePartner: {
        name: "Executive Advertising",
        affiliateId: "1056",
        exclusive: true,
        attributionStatus: "unverified",
        offerStatus: "unverified",
        approvedAffiliateRecommendations: []
      }
    }
  });
}());
