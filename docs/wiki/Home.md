# Keepical — Wiki

Welcome to the code wiki for **Keepical**.

Keepical = keep + iCal. Edit without rewriting the calendar unnecessarily.

> **Core promise:** If you only change an event title, all other properties of that
> event **and** all other `VEVENT`s remain as byte-identical as possible.

![logo](https://raw.githubusercontent.com/wiki/clavicarius/keepical/assets/keepical-applogo.png)

**Keepical** is a static, fully client-side web app for **loss-minimizing** editing of
`.ics` files (iCalendar). The core idea is that the app does **not** transform the
calendar into a simplified internal model and then serialize it from scratch.
Instead, every component is stored twice — as **original lines** (`rawLines`) and as
**interpreted data** (`parsed`).

## Live links

- [Hosted app (GitHub Pages)](https://clavicarius.github.io/keepical/)
- [GitHub Wiki](https://github.com/clavicarius/keepical/wiki)


## Navigation

| Page | Content |
| --- | --- |
| [Architecture](Architecture.md) | Guiding principle (raw/patch), data model, export strategy |
| [Parser](Parser.md) | Unfolding, content-line split, component tree, VEVENT interpretation |
| [Export & Validation](Export-and-Validation.md) | Folding, patch serializer, validation, export report |
| [UI](UI.md) | Web Components structure, list, editor, RRULE, report |
| [Field reference](Field-reference.md) | Event fields, accepted values, parameters, and examples |
| [Decision records](Decision-Records.md) | Small implementation decisions that affect editor behavior |
| [Testing](Testing.md) | Fixtures, roundtrip tests, acceptance criteria |
| [Roadmap](Roadmap.md) | Development phases 1–6 and status |
| [Deployment](Deployment.md) | GitHub Pages, Actions workflow, setup commands |
| [Versioning](VERSIONING.md) | Automatic SemVer tags and Pages deploy |

## Quick start

```bash
npm install
npm run dev       # Dev server
npm test          # Roundtrip and parser tests
npm run build     # Production build to dist/
```

## Directory overview

```text
src/
  model/     Data model (rawLines + parsed) and editing operations
  parser/    Unfolding, content-line split, component tree, VEVENT interpretation
  export/    Folding, raw-vs-patch serialization
  validate/  Structural checks + export report/diff
  ui/        Web Components (list, editor, RRULE, report)
test/        Vitest fixtures and tests
docs/        This wiki
```

## Wiki conventions

- Each page describes **one** topic and links to the relevant source files.
- Code references use paths relative to the project root, for example `src/export/patch.ts`.
- Diagrams use Mermaid and are rendered directly by GitHub.
