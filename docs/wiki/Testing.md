# Testing

Tests run with Vitest (`npm test`). They are the contract for loss minimization.

## Fixture — `test/fixtures/sample.ts`

The sample calendar is built programmatically as a CRLF string (not read from an
`.ics` file) so exact line endings and folding remain guaranteed independent of
Git `autocrlf`. It includes: `VALUE=DATE`, `TZID=Europe/Berlin` with `VTIMEZONE`,
multiple `VALARM`s, folded `X-ALT-DESC;FMTTYPE=text/html`, `X-MICROSOFT-*`, and an
overnight event.

## Roundtrip tests — `test/roundtrip.test.ts`

- Import to export is byte-identical.
- All UIDs stay stable; VALUE=DATE, TZID, folded X-ALT-DESC, X-MICROSOFT-*, and
  every VALARM are preserved; the overnight event keeps local times.
- Selective editing: changing only SUMMARY leaves everything else untouched.
- A new event gets a fresh UID (`@keepical.local`); deleting one event does not
  affect any other event.

## Parser unit tests — `test/parser.test.ts`

- `parseContentLine`: quoted and multi-value parameters.
- `unfold`: continuation lines, LF-only.
- `foldLine`: 75-octet limit with leading space.

## Core acceptance criterion

If only the title changes, all other properties of that event and of all other
`VEVENT`s remain as byte-identical as possible.

Continue to [Roadmap](Roadmap.md).
