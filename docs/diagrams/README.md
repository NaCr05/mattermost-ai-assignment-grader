# README diagram sources

The English and Chinese README diagrams are generated from the four JSON files in this directory using [Archify](https://github.com/tt-a1i/archify). The reviewed exports used Archify `2.17.0-dev.1` and repository evidence at commit `dd417057e1a0c85e9c82b503a9bba860226addf1`.

- `overview.*.architecture.json`: application relationships, with offline Mock as the default and DeepSeek requiring explicit live configuration. This is not a production port map.
- `review.*.sequence.json`: the successful Mattermost submission and teacher-review flow, including submission persistence before evaluation, version-checked review, and audit history. HTTP submission and evaluation are separate requests; regrading calls Agent again.
- Published light and dark PNGs live in `../../assets/readme/`. Keep both locales and themes synchronized with any behavior change.

## Regenerate

Install Archify separately; it is not an application runtime dependency. From the repository root, set `ARCHIFY_DIR` to its installation directory, then run this example in PowerShell:

```powershell
$archifyCli = Join-Path $env:ARCHIFY_DIR 'bin/archify.mjs'
New-Item -ItemType Directory -Force .test-runs/readme-diagrams | Out-Null
node $archifyCli validate architecture docs/diagrams/overview.en.architecture.json --quality showcase --repo-root . --json
node $archifyCli deliver architecture docs/diagrams/overview.en.architecture.json .test-runs/readme-diagrams/overview.en.html --quality showcase --repo-root . --json
node $archifyCli visual-check .test-runs/readme-diagrams/overview.en.html --json
node $archifyCli validate sequence docs/diagrams/review.en.sequence.json --quality showcase --json
node $archifyCli deliver sequence docs/diagrams/review.en.sequence.json .test-runs/readme-diagrams/review.en.html --quality showcase --json
node $archifyCli visual-check .test-runs/readme-diagrams/review.en.html --json
```

Repeat with `zh-CN` in place of `en`. Open each delivered HTML, select each theme, and use its native PNG export to update the matching README asset. Review the exported images and both rendered READMEs at desktop and mobile widths. Structural validation, browser checks, and visual inspection are separate checks; none replaces the others.

These diagrams document the existing implementation. They do not establish live DeepSeek acceptance, sandbox guarantees, or new product capabilities.
