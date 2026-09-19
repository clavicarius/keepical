# Loss-minimizing ICS editor (Keepical) — architecture and implementation plan

_Archived plan version. The active public documentation lives in the wiki: [Home](../wiki/Home.md)._

No full roundtrip through a calendar library. Every component is stored twice: as
`rawLines` (untouched) and as `parsed` (interpreted). On export, the rule is:
**unchanged = emit original lines; changed = patch only affected properties**.
ICAL.js is used at most as an optional helper (recurrence expansion, time zones),
never as the export path.

## Technical stack (variant B)

- TypeScript, Vite (build + dev server), Vitest (tests)
- UI with native Web Components (custom elements), no framework
- CSS without a preprocessor
- File System Access API with `FileReader` fallback; download via Blob
- Target hosting: GitHub Pages (static, `base` configured in Vite)
- Default UID suffix: `@keepical.local`, configurable in the UI

## Project structure

```text
keepical/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.ts
│   ├── model/     types.ts, calendar.ts
│   ├── parser/    unfold.ts, contentline.ts, tree.ts, vevent.ts
│   ├── export/    fold.ts, serialize.ts, patch.ts
│   ├── validate/  validator.ts
│   ├── ui/        app-shell.ts (more components planned)
│   └── styles/app.css
├── test/          fixtures/, *.test.ts
└── docs/          code wiki
```

## Data model

See [Architecture](../wiki/Architecture.md) and `src/model/types.ts`.

## Critical parser rules

See [Parser](../wiki/Parser.md). In short:

- Line endings: CRLF/LF/CR on import, CRLF on export.
- Unfolding: continuation with space/tab; remove exactly one leading character.
  Preserve the physical raw lines as well.
- ContentLine split: state machine, not `split(';'/':')`.
- Tree: `BEGIN:X`/`END:X`; unknown components kept as generic `Component`.

## Export strategy

See [Architecture](../wiki/Architecture.md) (Mermaid) and [Export & Validation](../wiki/Export-and-Validation.md).

## Validation & report

See [Export & Validation](../wiki/Export-and-Validation.md).

## UI building blocks

See [UI](../wiki/UI.md). Planned: `event-list`, `event-editor`, `rrule-editor`,
`export-report` as standalone custom elements.

## Event behavior

- Existing: UID unchanged; untouched/unknown properties and alarms remain.
- New: `UID:<uuid>@keepical.local`, minimum fields UID/DTSTAMP/DTSTART/DTEND|DURATION/SUMMARY.
- Deleted: remove the entire VEVENT block and nothing else.

## Test strategy

See [Testing](../wiki/Testing.md).

**Core acceptance criterion:** If only the title changes, all other properties of
that event and of all other VEVENTs remain as byte-identical as possible.

## Deployment

See [Deployment](../wiki/Deployment.md).

## Implementation order

See [Roadmap](../wiki/Roadmap.md). Phases 1–2 come first as the hard milestone.
