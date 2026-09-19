# Deployment

Static publishing to GitHub Pages. The Vite `base` path is `/keepical/`
(`vite.config.ts`); override via `VITE_BASE`.

## Local commands

The following commands are relative to the project root directory (where
`package.json` is located).

```bash
npm install
npm test
npm run build    # creates dist/
```

## GitHub Pages

1. Workflow file `.github/workflows/deploy.yml` (source of truth).
2. In GitHub -> Settings -> Pages, set the source to **GitHub Actions**.
3. The site is then available at `https://clavicarius.github.io/keepical/`.

### When deployment runs

- **After merge to `main`:** [Versioning](VERSIONING.md) creates a full tag
  `v*.*.*` and then calls `deploy.yml` via `workflow_call`
  (with input `version-tag`). This ensures deployment still starts even when the
  tag push made with `GITHUB_TOKEN` does not trigger its own workflows.
- **Manually:** `workflow_dispatch` on the deploy workflow.
- **External tag push:** `on.push.tags: v*.*.*` (for example tags created manually
  with a user token).

The deploy workflow builds, runs tests, and deploys `dist/` via
`actions/upload-pages-artifact` + `actions/deploy-pages`. There is **no** deploy
trigger on `push` to `main` (this avoids builds with fallback version
`development` before the tag exists).

Upload and deploy intentionally run for all workflow entry points **without**
`github.event_name` guards: with `workflow_call`, the reusable workflow inherits the
caller context (`push` / `refs/heads/main`), so checking for `workflow_call` or tag
refs would incorrectly skip Pages upload/deploy.

Pages job concurrency stays on the deploy job itself (`group: pages`); a top-level
`concurrency: pages` is intentionally **not** set (deadlock with the deploy job; see
PR #10).

Current workflow definitions:

- [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
- [`.github/workflows/versioning.yml`](../.github/workflows/versioning.yml)

## Git and issues

Phase issues live in the GitHub repository. See [Roadmap](Roadmap.md).

## Privacy

The app is fully client-side: no uploads, no backend, no tracking. Files are read
via FileReader / File System Access API and exported as downloads.

Back to [Home](Home.md).
