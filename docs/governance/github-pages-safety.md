# GitHub Pages Governance-File Safety: Mandatory Merge and Deployment Blocker

## Current exposure risk

If GitHub Pages publishes directly from the repository root, JSON and Markdown governance records under `agents/`, `affiliates/`, `governance/`, `docs/`, and `tools/` can be requested as static files. They are not credentials, but internal workflow, affiliate-planning, and approval metadata should not be treated as public web content.

## Required architecture before merge or deployment

Use a dedicated deployment workflow that builds an allowlisted site artifact from a dedicated `site/` source directory (or equivalent static-site output directory). Upload only that output artifact to GitHub Pages. Keep governance files outside the site source and exclude them by construction, not by `robots.txt`, obscurity, or a client-side rule.

The workflow should run from an approved release branch, validate the artifact contains only intended public files, use least-privilege Pages permissions, and require the repository's deployment gate before publishing. Maintain a documented rollback artifact or prior release reference.

## Mandatory blocker and non-action

No merge to a release or default branch and no deployment may proceed while GitHub Pages can publish the repository root or otherwise expose governance paths. PP-017 must be completed with explicit owner authorization, implementation evidence, and rollback evidence before either action is eligible. This does not block a local feature-branch commit.

This document does not add a workflow, change GitHub Pages settings, move files, alter the CNAME, or deploy the website. PP-017 records the required future work.
