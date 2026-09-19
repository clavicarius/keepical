# Roadmap

Development phases follow the order defined in the plan. Phases 1–2 are the hard
milestone (parser + lossless roundtrip). RRULE fields are modeled from the start,
even if the editor UI for them only arrives in phase 4.

| Phase | Topic | Status |
| --- | --- | --- |
| 1 | Parser (unfold, contentline, tree, vevent) with rawLines preservation | done |
| 2 | Read-only UI + lossless import/export roundtrip, tests | done |
| 3 | Editing / new / delete with patch export | done (MVP) |
| 4 | RRULE / RDATE / EXDATE / RECURRENCE-ID including raw-text fallback | open |
| 5 | Validation + export report + before/after diff | partial (foundation exists) |
| 6 | GitHub Pages + sample calendar + docs | done |

## Phase 1 — Parser

Read the file, unfold lines, build the component tree, interpret VEVENT.
Preserve unknown properties and components unchanged. See [Parser](Parser.md).

## Phase 2 — Read-only + roundtrip (milestone)

Load calendars and display events. **Import -> immediate export is byte-identical.**
Covered by `test/roundtrip.test.ts`. See [Testing](Testing.md).

## Phase 3 — Editing

Edit standard fields with selective patch export. New events use a configurable UID
suffix (`@keepical.local`). Deleting removes only the affected VEVENT block. UID is
read-only by default.

## Phase 4 — Recurrence

RRULE building-block UI (FREQ, INTERVAL, COUNT/UNTIL, BYDAY, BYMONTHDAY, BYSETPOS)
plus always-visible raw text. Do not silently delete unsupported parts: preserve /
edit raw / abort. Distinguish single instance vs. series via RECURRENCE-ID.

## Phase 5 — Validation + report

Structural checks, export report, and a diff per UID. Base implementation in
`src/validate/validator.ts`. See [Export & Validation](Export-and-Validation.md).

## Phase 6 — Deployment

GitHub Actions workflow, enable Pages, `vite` `base=/keepical/`. Sample calendar
without personal data. iOS subscription real-world test.
See [Deployment](Deployment.md).
