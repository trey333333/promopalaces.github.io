# Governance Validation Regression Matrix

Run the suite with:

~~~powershell
node --test tests/orchestrator-validation.test.mjs
~~~

The suite contains one baseline acceptance case, 60 negative cases, and two positive authorization acceptance cases. Cases 01–53 derive from Independent Review 001 and Correction Assignment 002. Cases 54–60 and the two authorization acceptance cases cover the final corrections:

1. Registry count, disabled defaults, unique IDs/names, closed agent records, typed tools and permissions, controlled vocabularies, non-overlap, owner authority, and complete gate mapping (cases 01–14).
2. Mandatory, non-null, restricted, owner-authorized gate definitions with nonempty evidence and controlled actions (15–22).
3. Closed task records, identity, owner, strict timestamps, dependencies, cycles, advancement rules, completion evidence, blocked reasons, gate references, multiple gate requirements, and status history (23–44).
4. Canonical decision-log parsing, gate references, owner approval, evidence, and execution-enablement fields (45–49).
5. Partner identity/order, HTTPS and verified hostname, affiliate-ID matching, permitted activation status, disabled execution, and publication restrictions while data is unverified (50–53).
6. Decision expiry ordering, task references, decision timing relative to completion, revocation precedence, dual publishing/tracking authorization for partner promotion, duplicate `aid` parameters, and dual-gate partner authorization tasks (54–60).
7. Valid active dual-gate partner authorization and valid pre-completion authorization for a restricted task (acceptance cases).

Intentionally unsupported: network-side proof that a partner records a referral, real coupon eligibility, production deployment settings, signature-based authorization, and prevention of a deliberately authorized editor changing both rules and governed data cannot be established from local metadata. They remain explicitly blocked in the backlog and require owner or partner-controlled evidence, branch protections, and independent review.
