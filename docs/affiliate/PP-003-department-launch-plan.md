# PP-003 affiliate department launch plan

## Common launch criteria

A department may move from planning to a public, affiliate-supported page only when it has original useful content; an accepted provider program; an assigned and verified exact tracking link; active owner decisions for affiliate tracking and publishing; an adjacent disclosure; accessibility and link QA; and a public-artifact check. Unpublished departments remain non-linkable and unindexed. None of the research entries below is approved or active.

| Candidate | Department(s) | Proposed initial content | Readiness at 2026-10-08 |
| --- | --- | --- | --- |
| GetResponse | Email Marketing | Email marketing platform selection checklist | Researched only; owner application approval required. |
| Hostinger | Websites & Ecommerce | Small-business website launch planning guide | Researched only; owner application approval required. |
| Shopify | Websites & Ecommerce | Ecommerce launch decision guide | Researched only; owner application approval required. |
| Semrush | SEO & Advertising | SEO research workflow guide | Researched only; owner application approval required. |
| HubSpot | Sales & CRM | CRM workflow planning guide | Researched only; owner application approval required. |
| FreshBooks | Accounting & Finance | Bookkeeping workflow checklist, not financial/tax advice | Researched only; owner application approval required. |
| Adobe | Branding & Design | Brand asset and visual consistency planning guide | Researched only; owner application approval required. |
| Make | AI & Automation; Business Operations | Workflow automation readiness guide | Researched only; owner application approval required. |
| ZenBusiness | Business Services | Business-formation planning checklist, not legal advice | Researched only; owner application approval required. |

## Remaining department research queues

- Promotional Products: no new candidate research; Executive Advertising remains exclusive and separately blocked pending attribution verification.
- Social Media Marketing: identify official publisher programs and review social-platform, paid-media, and disclosure rules.
- HR & Payroll: assess official programs alongside jurisdiction, privacy, and employment-claim limitations.
- Customer Support: assess provider data-processing practices and customer-service claims before selecting a candidate.
- Security & IT: require a security-claims review and verified regional/product terms before candidate selection.
- Training & Education: verify educator eligibility, credential claims, refund terms, and audience fit.
- Shipping & Logistics: verify service areas, commercial account requirements, and shipping-claim limitations.

## Proposed dependencies

```text
official research → owner approves application → manual application → provider acceptance
  → exact tracking link verified → owner approves tracking + publication → reviewed content and disclosure → local QA → release review
```

The research registry at `affiliates/research-backlog.json` is the implementation backlog for these dependencies. It deliberately keeps all candidates outside `affiliates/partners.json` until the final controlled stage.
