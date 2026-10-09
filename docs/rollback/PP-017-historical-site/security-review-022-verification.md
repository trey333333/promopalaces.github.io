# Security Review 022 verification guide

## Scope

This guide verifies the H1 correction for historical-restoration acknowledgement enforcement. It is a local test guide, not an approval, deployment instruction, or replacement for the protected GitHub Pages environment review.

## Root-cause regression

Run the focused authorization suite:

```powershell
node --test tests/deployment-safety.test.mjs
```

The test named **derives restoration status from the historical target and enforces a complete target-bound acknowledgement** constructs this exact sequence:

1. `R`: a committed historical restoration target containing the approved 31-file legacy manifest and `deployment/restoration-mode.json`.
2. `T`: a later first-parent commit with restoration mode removed (marketplace mode).
3. `C`: a later marketplace-mode authorization-control commit for PP-017.

It verifies that authorization fails when `C` contains a genuine-shaped PP-017 decision without `restoration_acknowledgement`, even though `T` and `C` are not restoration-mode commits. It then creates a later target-bound acknowledgement control commit and verifies authorization passes only with all required gates, exact `R` target SHA, exact `T` tooling SHA, valid timing, and non-revoked decision state.

The same test rejects an incomplete risk list, acknowledgement-target tampering, wrong deployment target input, expiration, and revocation.

## Target-derived validation checks

Review `tools/validate-deployment-authorization.mjs` and `tools/validate-restoration-mode.mjs`:

- `validateDeploymentAuthorization` calls `validateRestorationTarget(root, targetCommitSha)`.
- `validateRestorationTarget` reads the exact target Git tree and fails closed if the commit or a required restoration file cannot be verified.
- It does not use the control checkout's `deployment/restoration-mode.json` to determine the target classification.
- A target containing the approved legacy manifest or historical homepage without restoration mode is rejected as an unmarked historical restoration; it cannot fall back to marketplace authorization.
- A historical acknowledgement must name owner, PP-017, the exact target SHA, and all documented risk IDs.

## Workflow path checks

Run:

```powershell
node --test tests/public-artifact.test.mjs
```

The workflow assertion confirms the same deployment authorization validator runs in both the build job and deploy-job revalidation path. The deploy job rechecks the current authoritative `main` state immediately before `actions/deploy-pages` and retains the protected `github-pages` environment.

## Full local verification

```powershell
node tools/validate-orchestrator.mjs
node tools/validate-restoration-mode.mjs
node tools/run-site-ci.mjs
node tools/build-public-site.mjs --artifact artifact-ci-check
node tools/validate-public-artifact.mjs --artifact artifact-ci-check
git diff --check
```

Remove `artifact-ci-check` after validation. A separate simulated restoration commit is exercised by `tests/restoration-mode.test.mjs`; it selects the verified legacy suite and builds a 31-file artifact without internal files. The current workspace remains marketplace mode and builds the 49-file artifact.

## Manual review boundaries

No test creates an owner decision or environment approval. Before any real historical deployment, Claude should confirm that the real `R`, `T`, and `C` commits are distinct reviewed first-parent `main` commits, the genuine PP-017 decision has the exact acknowledgement fields, the decision is active and unrevoked, and the protected GitHub Pages environment requires an owner review.
