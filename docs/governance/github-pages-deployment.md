# GitHub Pages Deployment Isolation

## What this change does

The repository now has an exact public-asset manifest at `deployment/public-assets.json`. The local build copies only the listed files to a clean artifact directory; it does not publish the repository root. The manifest preserves the current static pages, stylesheet, logo, all existing image and video assets, `CNAME`, and the existing Google verification file.

The artifact validator rejects any file not listed in the manifest. As a result, `agents/`, `affiliates/`, `governance/`, `tests/`, `tools/`, `docs/`, `deployment/`, and `AGENTS.md` cannot enter the Pages artifact. Files are copied byte-for-byte and no HTML, CSS, tracking link, or affiliate content is rewritten.

`.github/workflows/deploy-pages.yml` is manual-only (`workflow_dispatch`); it has no push or pull-request trigger and its jobs run only from `refs/heads/main`. It checks out the exact `github.sha` and compares it with the SHA recorded in the deployment decision. The decision log is a local audit record used to bind scope, task, expiry, and commit; it is not GitHub authorization. The protected `github-pages` environment, with a required GitHub reviewer, is the real authorization boundary before the deploy action receives Pages write permission.

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

## Required owner approval before a workflow run

No decision is recorded by this change. A future owner must first record a genuine approved, unrevoked deployment decision in `governance/decision-log.json` for the selected backlog task. The record must be owned by `owner`, cover the `deployment` gate, bind the exact 40-character commit SHA to be deployed, contain nonempty evidence, and expire within seven days. The selected task's prerequisites must be complete. For a Pages-source, environment, domain, or workflow permission change, the authorization task must also cover `production_configuration`; PP-017 is the current task for that change.

The JSON log is evidence and an audit record for repository-side checks; it cannot authenticate a person or authorize GitHub Pages. A required reviewer approval in the protected `github-pages` environment is the real deployment authorization and cannot be bypassed by a JSON edit.

Then, and only then:

1. Review the manifest diff and the locally generated artifact.
2. Run the local validation commands above.
3. Record release and rollback evidence in the authorized task.
4. Manually run **Deploy allowlisted GitHub Pages artifact** from `main`, providing the exact decision ID and task ID. The workflow binds it to the checked-out `github.sha`.
5. Approve the protected `github-pages` environment after reviewing the uploaded artifact.

The workflow validates the supplied decision ID, task ID, and commit SHA against the canonical decision log at run time. With the intentionally empty decision log, a manual workflow run fails before artifact upload or deployment.

## Rollback

Treat rollback as a new restricted deployment action: select a reviewed prior revision, validate its generated artifact, record a current owner decision and rollback scope, and deploy it through the protected environment. Do not use a branch/root Pages setting as a rollback shortcut.
