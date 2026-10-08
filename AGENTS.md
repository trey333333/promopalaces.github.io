# PromoPalaces Agent Operating Rules

## Purpose and scope

This repository hosts a static affiliate-marketing website. The files in `agents/` describe a proposed workforce for planning and governance; they do **not** create autonomous agents, credentials, external access, or permission to act. Every registry entry begins with execution disabled.

These rules apply equally to Codex, Claude, ChatGPT, Forge, and any human-operated automation working in this repository.

## Non-negotiable boundaries

- Do not modify or deploy the live website unless the owner explicitly authorizes that exact action.
- Do not commit directly to `main`; work on a named feature branch.
- Do not push, merge, publish, spend money, submit affiliate applications, alter affiliate tracking, or connect a third-party service without the applicable owner approval gate.
- Preserve existing HTML, CSS, images, disclosures, and affiliate links unless an approved task explicitly changes them.
- Never invent analytics credentials, affiliate IDs, revenue, traffic, legal approval, production access, or operational capabilities.
- Keep all execution statuses disabled unless the owner authorizes the named agent, scope, duration, tools, and stop condition in the decision log.

## Work process

1. Read `agents/registry.json`, `agents/backlog.json`, and `governance/approval-gates.json` before work that affects the orchestrator foundation.
2. Associate work with a backlog task ID and its owner. Add clear acceptance criteria, evidence, dependencies, timestamps, and approval requirements before treating a task as complete.
3. Make the smallest scoped change. Do not include unrelated formatting or live-site edits in infrastructure work.
4. Run the local validation command after changing orchestration metadata:

   ```powershell
   node tools/validate-orchestrator.mjs
   node --test tests/orchestrator-validation.test.mjs
   ```

5. Record actual validation results and limitations. The canonical decision record is governance/decision-log.json; the Markdown decision-log template is a human-readable view only. Unavailable measurements must be written as **Unconfigured**, not estimated.

## Canonical decision records

The decision log starts empty. Do not create a placeholder approval. It is a repository audit record used by local validation; it does not authenticate an owner or grant GitHub permissions. Every future restricted completion must have a machine-valid record with the exact task ID, required gates, bounded scope, nonempty evidence, UTC expiry, and owner approver. GitHub Pages deployment additionally requires protected-environment review in GitHub, which is the actual authorization boundary. Execution enablement also requires named agent, tool allowlist, and stop condition; see docs/governance/execution-enablement.md.

## Branch discipline

- Begin from the requested feature branch or create an approved `feature/` branch; never develop directly on `main`.
- Inspect `git status` before editing. Preserve unrelated user work in a dirty tree.
- A commit is a repository change, not release authorization. Do not commit, push, merge, or open a release unless the owner separately asks.
- Do not treat a pull request, review comment, task assignment, or code review as authorization to publish or deploy.

## Approval gates

`governance/approval-gates.json` is the machine-readable gate source and `docs/governance/approval-and-safety.md` explains the process. Explicit owner authorization is mandatory for publishing, deployment, affiliate applications, spending, affiliate-tracking changes, production configuration, third-party integrations, and execution enablement.

The authorization must name the gate and exact scope, and cite the evidence required by that gate. Record it in the decision log before acting. If a request is ambiguous, stop at the draft, plan, or local-validation stage and ask the owner.

## Release gates

A future release request must not proceed until all applicable evidence is complete:

1. Approved scope and owner authorization for the deployment gate.
2. Local validation and relevant page/link/accessibility checks pass with recorded results.
3. Affiliate URLs, disclosures, and tracking impacts are reviewed; tracking changes need their separate gate.
4. Security and production-configuration impacts are reviewed, with a rollback plan.
5. The decision log identifies the approver, timestamp, exact immutable deployment target, and exact reviewed artifact-tooling commit. For GitHub Pages, record both in a later authorization-control commit; never make a decision authorize the commit that contains the decision itself. The target and tooling must be reviewed first-parent `main` commits, the control commit must not modify bound release tooling, and the protected-environment review must pass before deployment.

GitHub Pages release automation is manual-only, target-bound, and protected by the `github-pages` environment. It is not an authorization to deploy by itself.
