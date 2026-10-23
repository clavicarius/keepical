# Contributing

## Documentation is mandatory

Every change that affects behavior, workflows, configuration, or the developer
process **must** update the documentation in the same pull request.

- Public documentation lives in [`docs/wiki/`](docs/wiki/Home.md) (synced to the
  GitHub Wiki). Internal notes go in [`docs/internal/`](docs/internal/README.md).
- New or changed GitHub workflows must be described in
  [`docs/wiki/Deployment.md`](docs/wiki/Deployment.md) (or the matching wiki page).
- If no documentation change is needed, say so explicitly in the PR checklist.

## Checks

Pull requests to `main` must pass the `PR Build / build` check (tests and build).
Run `npm test` and `npm run build` locally before opening a PR.
