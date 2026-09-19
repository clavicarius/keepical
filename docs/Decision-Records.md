# Decision records

## 2026-09-19 — Hybrid RRULE editor with visible raw fallback

- **Context:** Phase 4a adds RRULE editing for common cases, but Keepical must not
  silently drop unsupported recurrence parts.
- **Decision:** The UI offers dedicated fields for `FREQ`, `INTERVAL`, `COUNT`,
  `UNTIL`, `BYDAY`, `BYMONTHDAY`, and `BYSETPOS` while always keeping the raw
  `RRULE` text visible and editable.
- **Consequence:** Supported changes can be made without editing the full rule, and
  unsupported tokens remain preserved in the raw value during structured edits.
