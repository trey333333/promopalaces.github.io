# GitHub Pages Deployment Isolation

## What this change does

The repository now has an exact public-asset manifest at `deployment/public-assets.json`. The local build copies only the listed files to a clean artifact directory; it does not publish the repository root. The manifest preserves the current static pages, stylesheet, logo, all existing image and video assets, `CNAME`, and the existing Google verification file.

The artifact validator rejects any file not listed in the manifest. As a result, `agents/`, `affiliates/`, `governance/`, `tests/`, `tools/`, `docs/`, `deployment/`, and `AGENTS.md` cannot enter the Pages artifact. Before every copy, the build rejects symlinks and junctions in the source root or any source parent, resolves canonical paths inside the verified source root, and requires each approved source to be a clean regular file tracked by the checked-out Git revision. Files are copied byte-for-byte and no HTML, CSS, tracking link, or affiliate content is rewritten.

`.github/workflows/deploy-pages.yml` is manual-only (`workflow_dispatch`); it has no push or pull-request trigger and its jobs run only from `refs/heads/main`. It separates the checked-out **authorization control commit** from the immutable **target commit** whose site artifact will be published and the immutable **tooling commit** used to build it. Target and tooling must be reviewed first-parent `main` commits and precede the control commit. The control commit contains the owner decision, is never the target artifact, and must not alter the workflow or release-tooling files relative to the bound tooling commit. The target is checked out by exact SHA and built only with the exact tooling SHA. The decision log is a local audit record used to bind scope, task, gates, expiry, target, and tooling; it is not GitHub authorization. After the protected-environment pause, the workflow checks out current `main` and revalidates the decision against that authoritative state immediately before the deploy action. The protected `github-pages` environment, with a required GitHub reviewer, is the real authorization boundary before the deploy action receives Pages write permission.

## Local validation

Run:

~~~powershell
node tools/validate-orchestrator.mjs
node --test tests/orchestrator-validation.test.mjs
node --test tests/public-artifact.test.mjs
node --test tests/deployment-safety.test.mjs
node tools/build-public-site.mjs --artifact dist
node tools/validate-public-artifact.mjs --artifact dist
~~~

The `dist/` directory is generated, ignored by Git, and safe to remove and rebuild. It is the complete locally inspectable Pages artifact.

## Required GitHub Pages settings

Before merging these deployment changes or allowing a future deployment, an owner must perform this sequence:

1. Create or configure the `github-pages` environment with a required owner reviewer. Limit who can deploy to that environment and do not grant an administrator bypass for this gate.
2. Protect `main` so workflow and manifest changes receive independent review.
3. In GitHub repository **Settings → Pages**, switch the source to **GitHub Actions**. Do not select branch/root publishing.
4. In GitHub Pages settings, preserve the custom domain `promopalaces.com`, verify its DNS records, and enforce HTTPS when available.
5. Only then merge the reviewed deployment changes into `main`.

The `CNAME` file is included in the artifact for Pages, but it does not configure or preserve the GitHub Pages custom-domain setting by itself. The domain configuration and certificate state must be verified in GitHub Pages settings.

The public GitHub Pages REST endpoint returned `404` during the 2026-10-07 read-only inspection. That can mean Pages is disabled or the setting is inaccessible without repository authentication; it does not establish the live setting. The owner must verify the current settings in the GitHub UI before changing anything.

## Non-circular approval model

The previous design attempted to store a decision's deployed commit SHA in the same commit that carried the decision. That was self-referential: committing the SHA changed the SHA. This workflow avoids that loop with three reviewed commits:

1. Merge the immutable website target commit to `main`; it contains the exact site source to publish.
2. Merge a reviewed release-tooling commit to `main` after that target. It contains the exact workflow and artifact-validator tooling approved for the release. The target and tooling commits must be on `main`'s first-parent history.
3. After reviewing target and tooling, create a separate authorization-control commit on `main`. It contains a genuine owner decision with `target_commit_sha` and `tooling_commit_sha` set to those already-existing SHAs. It must not modify the deployment workflow or the seven bound artifact/authorization tooling files.
4. Dispatch the workflow from the later control commit, selecting the decision ID, task ID, exact target SHA, and exact tooling SHA. The workflow rejects self-reference, target or tooling substitution, non-first-parent history, unreviewed tooling changes, expiry, revocation, missing approval, incomplete gates, or unmet task prerequisites.

No decision is recorded by this change. A future owner must first record a genuine approved, unrevoked deployment decision in `governance/decision-log.json` for the selected backlog task. The record must be owned by `owner`, cover every gate required by that task, bind exact lowercase 40-character `target_commit_sha` and `tooling_commit_sha` values, contain nonempty evidence, and expire within seven days. The selected task's prerequisites must be complete. For a Pages-source, environment, domain, or workflow permission change, the authorization task must also cover `production_configuration`; PP-017 is the current task for that change.

The JSON log is evidence and an audit record for repository-side checks; it cannot authenticate a person or authorize GitHub Pages. A required reviewer approval in the protected `github-pages` environment is the real deployment authorization and cannot be bypassed by a JSON edit.

Then, and only then:

1. Review the manifest diff and the locally generated artifact.
2. Run the local validation commands above.
3. Record release and rollback evidence in the authorized task.
4. Merge the reviewed tooling commit after the target. Confirm it is on `main` first-parent history and contains the exact release tooling to bind in the owner decision.
5. Create and merge the reviewed authorization-control commit containing that decision. It must be later than target and tooling, and it must not modify the bound workflow or release-tooling files.
6. Manually run **Deploy allowlisted GitHub Pages artifact** from the control commit on `main`, providing the exact decision ID, task ID, target SHA, and tooling SHA. The workflow checks first-parent history, checks out target and tooling by SHA, builds only with the bound tooling, and uploads only the validated target artifact.
7. Approve the protected `github-pages` environment after reviewing the uploaded artifact. The deploy job then obtains current `main` afresh and rejects the run if the decision has expired, been revoked, no longer matches target/tooling/task/gates, or if the control commit is no longer on `main`.

The workflow validates the supplied decision ID, task ID, target SHA, tooling SHA, and control SHA against the canonical decision log at build time and again immediately before deployment. With the intentionally empty decision log, a manual workflow run fails before artifact upload or deployment.

## Rollback

Treat rollback as a new restricted deployment action: select a reviewed prior first-parent `main` target, select a later reviewed tooling commit capable of building it, then create a later authorization-control commit containing a current owner decision bound to both SHAs and the rollback scope. Deploy it through the protected environment. Do not use a branch/root Pages setting as a rollback shortcut.
