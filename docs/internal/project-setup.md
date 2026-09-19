# Project setup, GitHub issues, and deployment

The public project documentation lives under [`docs/wiki/`](../wiki/Home.md).
This document is intentionally internal and contains manual setup steps that do not
belong in the public GitHub Wiki. The sandbox blocks terminal commands such as
`git`, `gh`, and `npm`, so these instructions remain as repo-local maintainer notes.

## 1. Install dependencies and run tests

The following commands are relative to the project root directory (where
`package.json` is located).

```bash
npm install
npm test          # Roundtrip and parser tests
npm run dev       # Local dev server
npm run build     # Production build to dist/
```

## 2. Initialize Git and push to the repository

```bash
git init
git branch -M main
git add .
git commit -m "Initial scaffold: Keepical — loss-minimizing ICS editor (parser, raw/patch export, UI, tests)"
git remote add origin https://github.com/clavicarius/keepical.git
git push -u origin main
```

## 3. Create GitHub issues (via gh CLI)

The following commands create one issue per development phase. Prerequisite:
`gh auth login` has been completed.

```bash
gh issue create -R clavicarius/keepical \
  -t "Phase 1: Parser (loss-minimizing)" \
  -l "phase-1,parser" \
  -b "Read the file, unfold lines, build the component tree (BEGIN/END), interpret VEVENT. Preserve original lines (rawLines) per component/property. Keep unknown properties and components unchanged. Files: src/parser/*."

gh issue create -R clavicarius/keepical \
  -t "Phase 2: Read-only UI + lossless roundtrip" \
  -l "phase-2,milestone" \
  -b "Load calendars, show events, show details. Core milestone: import -> immediate export is byte-identical. Covered by test/roundtrip.test.ts (including VALUE=DATE, TZID, VALARM, X-ALT-DESC, X-MICROSOFT-*)."

gh issue create -R clavicarius/keepical \
  -t "Phase 3: Editing (title/date/location/description, new, delete)" \
  -l "phase-3,editor" \
  -b "Edit standard fields with selective patch export (rewrite only changed properties). New events use a configurable UID suffix (@keepical.local). Deleting removes only the affected VEVENT block. UID stays read-only by default."

gh issue create -R clavicarius/keepical \
  -t "Phase 4: Recurrence (RRULE/RDATE/EXDATE/RECURRENCE-ID)" \
  -l "phase-4,recurrence" \
  -b "RRULE building-block UI (FREQ, INTERVAL, COUNT/UNTIL, BYDAY, BYMONTHDAY, BYSETPOS) plus always-visible raw text. Do not silently delete unsupported parts: preserve / edit raw / abort. Distinguish single instance vs. series via RECURRENCE-ID."

gh issue create -R clavicarius/keepical \
  -t "Phase 5: Validation + export report + before/after diff" \
  -l "phase-5,validation" \
  -b "Structural checks (exactly one VCALENDAR, UID/DTSTART required, not DTEND+DURATION, TZID consistency, valid RRULE/RDATE/EXDATE, CRLF/folding). Export report and diff per UID. Base implementation in src/validate/validator.ts."

gh issue create -R clavicarius/keepical \
  -t "Phase 6: GitHub Pages deployment + docs + sample calendar" \
  -l "phase-6,deployment" \
  -b "GitHub Actions workflow (see .github/workflows/deploy.yml below), enable Pages (source: GitHub Actions), vite base=/keepical/. Sample calendar without personal data. iOS subscription real-world test."
```

## 4. GitHub Actions workflow for Pages

This environment could not write the workflow file. Create it manually at
`.github/workflows/deploy.yml`:

```yaml
name: Build and Deploy to GitHub Pages

on:
  push:
  pull_request:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    concurrency:
      group: ci-${{ github.workflow }}-${{ github.ref }}
      cancel-in-progress: true
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    concurrency:
      group: pages
      cancel-in-progress: true
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Then go to GitHub → Settings → Pages and set the source to "GitHub Actions".
The site will then be available at `https://clavicarius.github.io/keepical/`.
