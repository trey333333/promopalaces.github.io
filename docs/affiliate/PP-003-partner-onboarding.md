# PP-003 partner onboarding controls

## Purpose

This controlled workflow turns a candidate into a publishable affiliate partner only through evidence-backed, owner-approved transitions. It is not automation. Every partner starts inactive, and no local JSON record authenticates an owner or grants external-system authority.

## State sequence

| From | To | Required evidence and authority |
| --- | --- | --- |
| Candidate | Researched | Dated official program/application source; published terms, cookie or an explicit `unconfigured` notation, restrictions, department fit, and proposed original content. No application or link. |
| Researched | Application approved by owner | Active canonical owner decision for the exact candidate and `affiliate_applications` gate; reviewed application packet and then-current terms. |
| Application approved by owner | Applied | Manual submission by the owner or an explicitly authorized human; receipt or confirmation recorded. No claim of acceptance. |
| Applied | Accepted | Provider or network acceptance notice plus current terms and assigned affiliate identifier. Acceptance does not authorize public tracking or content. |
| Accepted | Tracking verified | Exact assigned link and identifier checked without a purchase; provider or owner-controlled reporting evidence; active owner decision covering `affiliate_tracking_changes`. |
| Tracking verified | Publication approved | Active owner decisions covering both `affiliate_tracking_changes` and `publishing`; disclosure review, approved content, link QA, and release evidence. |

## Stop states

- `paused`: research is stale, terms are incomplete, or owner review is deferred.
- `rejected`: the owner or provider declines the candidate. Keep the historical record but do not retry without a new owner-approved scope.
- `expired`: a decision, offer, or verification has expired. Return to the appropriate prior stage and refresh evidence.

No transition is implied by a task status, a source URL, an affiliate dashboard login, or an edit to the research backlog. The canonical decision log is an auditable local record only; it cannot substitute for provider acceptance, owner authentication, or GitHub authorization.

## Publication guardrails

1. Keep research candidates out of public HTML, JavaScript, CSS, sitemap, and the deployment manifest.
2. Do not assign an affiliate ID or construct a tracking URL until the provider assigns it after acceptance.
3. Test the exact link and disclosure only after the required tracking-change decision; do not buy, subscribe, or spend to validate attribution.
4. Add a hardened `affiliates/partners.json` entry only when the validator's partner conditions and the active owner decisions are satisfied.
5. Executive Advertising remains the sole permitted promotional merchandise affiliate. This workflow does not allow a competing merchandise candidate.
