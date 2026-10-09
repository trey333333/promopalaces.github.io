# PP-017 historical-site restoration package

## Status and boundary

This is an **internal, non-public recovery package**. It is not a Pages artifact, deployment target, approval, decision record, or instruction to replace the marketplace. The current deployment manifest does not include `docs/`, and the package must remain excluded from every public artifact.

The package reconstructs the portable public assets from historical commit `a1f732de923d90767a0a7236afeb1ac72342292b`, the immediate pre-marketplace first-parent `main` commit. Repository history identifies it as the rollback source candidate; GitHub deployment history is still needed to prove it was the previously served Pages revision.

## Package contents

| Path | Purpose |
| --- | --- |
| `source/` | Exact historical public-file copies used by the restoration package. |
| `legacy-public-assets.json` | 31-file allowlist for a future restoration target. |
| `restoration-package.json` | Immutable source/tooling references and promotion constraints. |
| `restoration-mode.template.json` | The only permitted restoration-mode configuration for a future target. |

All package source files are compared byte-for-byte with the pinned historical Git tree by `tests/rollback-package.test.mjs`. The only historical tracked file intentionally omitted is `images/Apparel.png`: it is unreferenced, while `images/apparel.png` is referenced and preserved. Keeping both is not portable to case-insensitive filesystems.

The package preserves:

- `CNAME` with `promopalaces.com`;
- `google91250e6e2fdfde57.html` and the historical Search Console verification markup;
- historical `index.html`, `shop.html`, disclosures, styles, logos, images, and video;
- all 50 `executiveadvertising.com` references in the historical homepage and shop files.

## Restoration-mode CI contract

Normal marketplace CI always runs every `tests/*.test.mjs` regression file, including all marketplace visual, Tool Finder, SEO, navigation, and affiliate-integrity checks. Historical restoration mode is not present in this branch and cannot be enabled by a workflow input or environment variable.

A future restoration target may add `deployment/restoration-mode.json` only by copying `restoration-mode.template.json` exactly. `tools/validate-restoration-mode.mjs` rejects the mode unless all of the following are true:

- the configuration, legacy manifest, package source, and proposed public files are clean Git-tracked regular files in the checked-out target revision;
- the mode is tied to this package ID, historical commit, exact 31-file manifest, and its SHA-256 (`cf982cdc6e7f8edd7210d038c5ca5859325b392c50682267d66313e4af5fb1e7`);
- each package source file exactly matches the historical Git object, and each proposed public file exactly matches the package source;
- the public `deployment/public-assets.json` exactly matches the package manifest; and
- the configuration requires all known legacy-compliance risks to be acknowledged by the owner decision.

Deployment authorization classifies the exact requested target commit, not the later tooling or authorization-control checkout. A target carrying the approved legacy manifest or historical homepage without a validated restoration-mode file is rejected as an unmarked historical restoration rather than treated as marketplace mode.

When the validated mode is active, `tools/run-site-ci.mjs` runs the legacy-appropriate suite: historical restoration integrity, affiliate links, required legacy pages and navigation, CNAME and Search Console verification, public-artifact isolation, governance, deployment security, affiliate-research isolation, and CI workflow security. It does not run marketplace-only presentation and Tool Finder tests against a deliberately restored historical site. A malformed, untracked, altered, or mismatched mode file fails before that suite is selected.

## Historical dependencies and acknowledged compliance regressions

The restored historical homepage depends on:

- GitHub Pages-hosted image URLs at `https://trey333333.github.io/promopalaces.github.io/images/…`;
- Bootstrap 5.3.0 from `cdn.jsdelivr.net`; and
- animate.css 4.1.1 from `cdnjs.cloudflare.com`.

These external dependencies must be browser-tested in the proposed restoration artifact; the local allowlist cannot guarantee their availability or integrity.

The historical content also carries known compliance regressions that are intentionally documented, not repaired by this package:

1. **Missing adjacent affiliate disclosure:** affiliate links on the historical homepage lack an adjacent affiliate disclosure.
2. **Blank `aid` parameter:** the existing USA-made Executive Advertising URL has a blank `aid` parameter.
3. **Missing sponsored-link attributes:** legacy outbound links lack `rel="sponsored noopener noreferrer"` attributes.

Before a historical restoration deployment, the owner must explicitly acknowledge all three risks in a genuine PP-017 decision using `restoration_acknowledgement`. The acknowledgement must state `acknowledged_by: "owner"`, `task_id: "PP-017"`, the exact restoration target SHA in `target_commit_sha`, and all three required risk IDs. The deployment authorization validator derives restoration status from that exact target's Git tree—not the later tooling or control revision—and rejects an active restoration release without this exact acknowledgement. This acknowledgement does not verify attribution, repair the blank parameter, or waive any applicable partner requirement.

## Required promotion sequence

The current deployment workflow requires three distinct reviewed first-parent `main` commits. This package is not one of them.

1. **Restoration target (`R`)** — create a new feature branch from current `main`; retain this internal package, copy its `source/` files to the public source root, copy `legacy-public-assets.json` to `deployment/public-assets.json`, and copy `restoration-mode.template.json` unchanged to `deployment/restoration-mode.json`. The latter must be Git-tracked in `R`; it is configuration, not a public asset. Run `node tools/validate-restoration-mode.mjs`, then run the applicable CI suite. Do not copy the package directory or restoration-mode file into the target artifact. Review the manifest, historical-content diff, and generated 31-file artifact. Merge only after independent review.
2. **Tooling binding (`T`)** — merge a later independently reviewed commit after `R` that contains the exact approved deployment tooling used for the restoration. It must retain the hardened workflow, validators, source-link protections, and manual-only `main` restriction. This separate commit is necessary because `T` must be later than `R`; the existing tooling baseline predates a future restoration target.
3. **Authorization control (`C`)** — after owner authorization, merge a still-later reviewed commit containing the genuine PP-017 decision record. It must bind exact `R` and `T` SHAs, cover `production_configuration` and `deployment`, include nonempty evidence and rollback plan, expire within seven days, and not change any bound release-tooling file.

The deployment command must be dispatched manually from `C` on `main`, with the exact decision ID, task ID `PP-017`, `R` target SHA, and `T` tooling SHA. The protected `github-pages` environment review is the real authorization boundary; the JSON decision log is an audit record only.

## Protected pull-request promotion

1. Open a restoration-target pull request; review only the intentional transition from marketplace public files to the package's 31 legacy assets and manifest.
2. Require the normal CI checks, full regression suite, artifact build, artifact validation, source-to-artifact byte checks, affiliate-link comparison, and browser smoke checks on a case-sensitive environment.
3. Merge `R` through protected `main`; never switch Pages back to branch/root publishing.
4. Open and independently review the later tooling-binding pull request. Verify it does not weaken or substitute deployment tooling.
5. Obtain the owner’s actual approval and GitHub configuration evidence. Open the authorization-control pull request only after that evidence exists; do not use placeholders.
6. Add the owner-supplied `restoration_acknowledgement` object to that genuine decision, with `acknowledged_by: "owner"`, `task_id: "PP-017"`, `target_commit_sha` equal to `R`, and all three required risk IDs. Do not create this field before actual owner authorization.
7. Merge `C`, manually dispatch the existing workflow, and have the required owner approve the `github-pages` environment after reviewing the uploaded artifact.

## Release verification checklist

- [ ] `R`, `T`, and `C` are exact, distinct, reviewed first-parent `main` commits in that order.
- [ ] The restoration manifest contains exactly the 31 package paths and no internal paths.
- [ ] The artifact validator reports exactly 31 files and no unexpected files.
- [ ] `CNAME` remains `promopalaces.com`; GitHub Pages custom-domain, DNS, and HTTPS settings are verified separately in GitHub.
- [ ] The Search Console verification file and historical verification meta tag are present.
- [ ] Historical Executive Advertising destinations and disclosures match the package source; no affiliate tracking value is repaired or substituted.
- [ ] The owner decision explicitly acknowledges the missing adjacent disclosure, blank `aid` parameter, and missing sponsored-link attributes.
- [ ] The active, unrevoked owner decision covers both PP-017 gates, exact `R`/`T` SHAs, evidence, and a seven-day-or-less validity period.
- [ ] GitHub Pages remains sourced from GitHub Actions and the protected `github-pages` environment requires owner review without bypass.

## Rollback procedure

Treat restoration as a new restricted deployment. Do not use `git checkout`, branch/root Pages publishing, or a reused/expired authorization as a shortcut.

1. Complete the promotion sequence above and validate the artifact locally.
2. The owner provides a genuine PP-017 approval and the required GitHub configuration evidence.
3. Dispatch **Deploy allowlisted GitHub Pages artifact** from `C` on `main` with the bound inputs.
4. Review the uploaded artifact and approve the protected environment.
5. After deployment, verify the public domain, HTTPS, expected legacy pages, Search Console verification, disclosures, and Executive Advertising links.
6. If the restoration must itself be rolled back, repeat this process with a new reviewed target, later tooling commit, owner decision, and environment approval.

## Limitations

- This package proves source and artifact integrity locally; it does not prove which revision GitHub Pages historically served.
- Historic pages include external CDN and GitHub Pages-hostname references that require browser verification before production use.
- The unreferenced case-conflicting asset is intentionally excluded for portable builds. Reintroducing it requires a case-sensitive build and independent review.
