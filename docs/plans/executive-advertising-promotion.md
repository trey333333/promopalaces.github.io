# Executive Advertising Featured-Partner Promotion Plan

**Partner:** Executive Advertising (`EA-001`)  
**Status:** Development backlog only — no page, component, link, tracking change, publication, or deployment is authorized.  
**Dependencies:** PP-011 and PP-012 in `agents/backlog.json`

## Verification record

| Item | Evidence | Status |
| --- | --- | --- |
| Candidate catalog destination | `https://www.executiveadvertising.com/promotional-products/?aid=1056` returned HTTP 200 to a read-only request on 2026-10-07. | Reachable, not approved for implementation |
| Affiliate parameter | The requested URL retained `aid=1056`; the existing site also uses that value. No response evidence shows a conversion being attributed. | **Unverified** |
| Coupon `PALACE` | Supplied in the owner requirement. The public Executive Advertising homepage did not expose a matching coupon or offer in the reviewed content. | **Unverified** |
| $25 off $300 / one use per account | Supplied in the owner requirement. No public partner confirmation was located in the reviewed content. | **Unverified** |

Do not represent the coupon, offer, attribution, or eligibility as live until PP-012 has attached partner or owner-controlled evidence. A reachable destination is not proof of referral attribution.

## Proposed homepage promotion

**Location:** A clearly labeled featured-partner panel immediately above the existing featured-product grid, subject to an approved homepage design.

**Proposed copy (not approved for publication):**

> Executive Advertising: use code `PALACE` for $25 off orders of $300 or more. Limit one use per ordering account. Terms and availability apply.

**Required adjacent disclosure:**

> PromoPalaces may earn a commission from qualifying purchases made through Executive Advertising links, at no additional cost to you.

The final offer copy must be checked against written partner terms. The component must not claim that a coupon is automatically applied, guaranteed, stackable, or perpetual unless those details are verified.

## Dedicated landing-page design

**Proposed future path:** `executive-advertising.html` (not created by this plan).

| Section | Purpose | Required control |
| --- | --- | --- |
| Partner identity | Identify Executive Advertising and the promotional-product catalog. | Do not imply ownership or endorsement beyond verified program terms. |
| Offer panel | Present the approved coupon, amount, threshold, and one-use limit. | Render only after PP-012 verification; include terms language. |
| Catalog call to action | Link to the exact approved attributed URL. | Preserve the approved `aid` parameter; use `rel="noopener noreferrer"` for a new-tab link. |
| Affiliate disclosure | Explain the commission relationship. | Visible before or adjacent to the call to action; link to the full disclosure. |
| Terms and support | State that partner terms control and identify a support path. | Avoid inventing expiry, exclusions, or support promises. |

## Reusable coupon-display component specification

This is a design specification only, not a live HTML component.

```html
<section class="coupon-offer" aria-labelledby="coupon-offer-title" data-partner="executive-advertising">
  <p class="coupon-offer__eyebrow">Featured partner offer</p>
  <h2 id="coupon-offer-title">Save on Executive Advertising orders</h2>
  <p class="coupon-offer__value">$25 off orders of $300 or more</p>
  <p class="coupon-offer__code">Use code <code>PALACE</code></p>
  <p class="coupon-offer__terms">One use per ordering account. Terms and availability apply.</p>
  <p class="coupon-offer__disclosure">PromoPalaces may earn a commission from qualifying purchases made through this link, at no additional cost to you.</p>
  <a class="coupon-offer__cta" href="APPROVED_ATTRIBUTED_URL">Shop Executive Advertising</a>
</section>
```

Implementation requirements: the CTA URL must come from a verified partner record, the disclosure must remain visible in all responsive layouts, the coupon text must be selectable/copyable, and the component must not emit analytics or third-party requests by itself.

## Attribution and coupon-tracking plan

1. Treat the partner URL and `aid=1056` as controlled affiliate-tracking data. Do not add, remove, normalize, redirect, or append parameters without the `affiliate_tracking_changes` gate.
2. Obtain written confirmation of the destination URL, attribution method, attribution window, coupon eligibility, and whether coupon use affects referral credit.
3. Perform an owner-approved, no-purchase test using the exact final URL. Confirm the query value is accepted and obtain partner-side attribution evidence; do not create an ordering account, submit an order, or spend money.
4. Keep PromoPalaces first-party click metrics **Unconfigured** until analytics configuration is separately authorized. Do not introduce UTM parameters or a tracking service merely for this promotion.
5. Record final verification evidence and any exception in the decision log before page/component implementation, then require separate publishing and deployment approvals for release.

## Release guardrails

- PP-011 must close the Master Orchestrator validation gaps before any affiliated promotion work proceeds.
- PP-012 must verify landing-page attribution and coupon terms before implementation.
- Publishing, deployment, and affiliate-tracking changes each require explicit owner authorization under their respective gates.
- This plan does not authorize modifying `index.html`, creating a public landing page, altering existing affiliate links, or sending partner communications.
