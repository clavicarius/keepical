# Versioning

Keepical uses automated semantic versioning via
`.github/workflows/versioning.yml`.

## Trigger behavior

The workflow runs on every push to `main`. It also runs for pull requests
targeting `main`, but pull-request runs are always dry runs.

After a successful versioning run for `main`, the workflow publishes the full
version tag and then **calls** the GitHub Pages workflow via `workflow_call`
(with `version-tag` set to that tag). This avoids relying on a `GITHUB_TOKEN`
tag push to start another workflow — those pushes do not trigger `on.push.tags`
listeners.

The reusable deploy workflow must **not** gate upload/deploy on
`github.event_name == 'workflow_call'`: reusable workflows inherit the caller
event (here `push` on `main`), so that check never matches and would skip Pages.

Manual Pages deployments remain available through `workflow_dispatch` on
`.github/workflows/deploy.yml`. External or manually created `v*.*.*` tags can
still trigger deploy directly via `on.push.tags`.

## Tags and increments

Full release tags use the `v<major>.<minor>.<patch>` format, for example
`v0.1.0`. Only tags with the `v` prefix and three numeric components are
considered version tags. If no such tag exists, the first version is `v0.1.0`.
Otherwise, the workflow finds the greatest semantic version across all major
lines and increments its patch component by one. Minor and major components
are not automatically incremented.

The global ordering means a newly generated version is greater than every
previous semantic version, even when version lines or tags have gaps.

## Safety behavior

- The workflow only mutates tags on pushes to `main`; pull requests only report
  the computed tags.
- Branch and actor guards prevent tag operations from recursively triggering
  versioning. Tag pushes do not match the `main` branch trigger.
- Before publishing, the workflow checks whether the computed full tag already
  exists on `origin`. If it does, no duplicate full tag is created and no
  deploy is invoked.
- Pages deploy after versioning runs only when a **new** tag was published
  (`published == true`).

## Operational examples

| Existing semantic tags | Computed full tag |
| ---------------------- | ----------------- |
| none                   | `v0.1.0`          |
| `v0.1.0`               | `v0.1.1`          |
| `v0.1.1`, `v2.0.0`     | `v2.0.1`          |

To inspect versions locally:

```sh
git ls-remote --tags origin 'refs/tags/v*'
```
