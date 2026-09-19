# Export & Validation

## Folding — `src/export/fold.ts`

`foldLine()` folds logical lines at **75 octets** and inserts CRLF + a single space.
UTF-8 octets are counted, and line breaks only happen at character boundaries so no
multibyte sequence is split. The leading space on the continuation line counts
against the limit.

## Serializing a property — `src/export/serialize.ts`

`renderContentLine()` rebuilds `NAME;PARAM=VALUE:VALUE` (parameters in original
order, quoting for special characters). `serializeContentLine()` then folds the
result. This is used only for **changed** properties.

## Patch serializer — `src/export/patch.ts`

`serializeCalendar()` is the core:

- Not `dirty` -> emit `rawLines` 1:1.
- `dirty` -> rebuild the block, but emit every **unchanged** property from its own
  `rawLines`; only properties in `changedProperties` are rerendered.
- Deleted `VEVENT`s are skipped.
- Output uses CRLF, with an optional trailing line break matching the original.

## Validation & report — `src/validate/validator.ts`

`validate()` checks conservatively without rewriting anything:

- exactly one `VCALENDAR`
- every `VEVENT` has `UID` and `DTSTART`
- not both `DTEND` and `DURATION`
- TZID consistency (no TZID together with UTC `Z`)

`buildReport()` returns the export report: counts of unchanged/changed/new/deleted,
preserved UIDs, preserved `VTIMEZONE`/`VALARM`/unknown properties, plus a diff per
UID (which property names changed).

Continue to [UI](UI.md).
