# Keepical — Edit what matters. Keep the rest.

- [Hosted app (GitHub Pages)](https://clavicarius.github.io/keepical/)
- [GitHub Wiki](https://github.com/clavicarius/keepical/wiki)


**Keepical** is a static, fully client-side web app for **loss-minimizing** editing of
`.ics` files (iCalendar). The core idea is that the app does **not** transform the
calendar into a simplified internal model and then serialize it from scratch.
Instead, every component is stored twice — as **original lines** (`rawLines`) and as
**interpreted data** (`parsed`).

> **Core promise:** If you only change an event title, all other properties of that
> event **and** all other `VEVENT`s remain as byte-identical as possible.

![logo](./docs/wiki/assets/keepical-applogo.png)

## Name

| | |
| --- | --- |
| Display | Keepical |
| Slug | `keepical` |
| Pronunciation | KEEP-ih-cal |
| Tagline | Edit what matters. Keep the rest. |

Keepical combines keep and iCal: the app edits `.ics` files while preserving as much
of the original as possible — untouched events, properties, and structure stay in
place instead of being reserialized. The name expresses exactly that promise:
edit what matters and keep the rest.

Short version: Keepical = keep + iCal. Edit without rewriting the calendar
unnecessarily.

## Why not just use ICAL.js?

A full roundtrip `ICS → library model → regeneration` can change or remove unknown
`X-*` properties, property order, parameters, HTML in `X-ALT-DESC`, multiple
`VALARM` blocks, special `VTIMEZONE` data, and formatting/folding. This editor avoids
that with a **raw/patch strategy**:

- **Unchanged `VEVENT`s** are emitted from the original lines.
- **Changed properties** are rewritten selectively while the rest stays original.
- **Unknown properties, `VALARM`, `VTIMEZONE`** pass through unchanged.
- **Deleted events** remove only their own `VEVENT` block.
- **New events** are generated in a standards-compliant way.

## Privacy

Everything runs locally in the browser: no uploads, no backend, no tracking. Files
are read via the File System Access API (with a `FileReader` fallback) and exported
as downloads.

## Development

```bash
npm install
npm run dev        # Dev server
npm test           # Vitest (including roundtrip tests)
npm run build      # Production build to dist/
```

A pre-commit hook (Husky) runs `npm test` and `npm run build` before every commit.
If either step fails, the commit is aborted. Emergency exit: `git commit --no-verify`.

## Documentation

Public documentation is the single source of truth under https://github.com/clavicarius/keepical/wiki
The GitHub Wiki is synchronized only from `docs/wiki/**` via the workflow in [`.github/workflows/wiki.yml`](.github/workflows/wiki.yml).

Internal or non-public notes belong in [`docs/internal/`](docs/internal/README.md), including the archived plan and local setup notes. 


## Architecture (short overview)

```text
src/
  model/     Data model (rawLines + parsed) and CalendarModel
  parser/    Unfolding, content-line split, component tree, VEVENT interpretation
  export/    Folding, raw-vs-patch serialization
  validate/  Structural checks + export report/diff
  ui/        Web Components (list, editor, RRULE, report)
docs/        Repository docs; public wiki source is docs/wiki/
```

## Status

Early stage. Order: parser + lossless roundtrip (milestone) → editing → recurrence →
validation/diff → deployment (GitHub Pages). See [Roadmap](docs/wiki/Roadmap.md) and the
GitHub issues for the individual phases.

## License

MIT
