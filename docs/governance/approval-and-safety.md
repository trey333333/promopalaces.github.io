# Approval and Safety System

## Default posture

All agents and affiliate partners are disabled planning records. The policy is deny by default. A task owner, task state, assigned tool, registry entry, or text plan does not grant authority to act.

## Enforced restricted-action gates

The validator requires every restricted action to map to one or more approved gates. Every gate is restricted, requires owner authorization, and has nonempty evidence requirements.

| Gate | Controlled actions |
| --- | --- |
| publishing | Publishing and public claims |
| deployment | Deployment and production testing |
| affiliate_applications | Affiliate applications |
| spending | Spending, contracting, paid promotion, asset licensing, and ad-platform changes |
| affiliate_tracking_changes | Affiliate link and attribution changes |
| production_configuration | Production configuration and credentials |
| third_party_integrations | Third-party integrations and personal-data processing |
| execution_enablement | Agent execution enablement |
| external_communication | External communication and legal-advice requests |
| data_export | Data exports and external reporting |

## Canonical owner decisions

The only machine-valid approval source is governance/decision-log.json. It is intentionally empty. A future authorization must contain an owner approver, task ID, valid gate IDs, exact scope, nonempty evidence, UTC timestamps, expiry, and approved/revoked status. The decision timestamp must not predate its task, its expiry must follow its timestamp, and a decision used at completion or partner promotion must have been active at that exact time. A revocation names the original decision and takes precedence from its own timestamp onward. Execution-enable decisions additionally require a named registry agent, allowlisted tools, and a stop condition.

Changing task metadata cannot substitute for a decision: a restricted task cannot become complete unless a matching, active owner decision covers every required gate.

Partner publication and promotion of affiliate, coupon, or attribution verification require a matching active owner decision for the partner's authorization task. That task must itself require both publishing and affiliate_tracking_changes gates, and the decision must cover both. A plan, reachable URL, or changed partner status is not authorization.

## Safety boundaries

- No publishing, deployment, merge, push, spend, affiliate application, tracking alteration, third-party connection, external communication, or data export is authorized by this repository state.
- Never invent credentials, affiliate IDs, analytics data, revenue, approval decisions, or production access.
- Preserve existing affiliate links and disclosures unless an approved task and matching owner decision authorize a reviewed change.
- Do not enable an agent. See docs/governance/execution-enablement.md for the future authorization requirements.

## Residual control limitation

JSON validation can detect an inconsistent repository state, but it cannot prevent an authorized repository editor from deliberately changing both the validator or rules and the governed JSON data. Branch protection, independent review, protected release settings, and owner-controlled records outside the editable working tree remain required safeguards.
