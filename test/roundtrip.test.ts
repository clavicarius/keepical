import { describe, it, expect } from "vitest";
import { SAMPLE_ICS } from "./fixtures/sample.js";
import { parseIcs } from "../src/parser/index.js";
import { serializeCalendar } from "../src/export/index.js";
import { renderContentLine } from "../src/export/serialize.js";
import { parseContentLine } from "../src/parser/contentline.js";
import { setEventProperty, setEventProperties, addEvent, deleteEvent } from "../src/model/calendar.js";
import { encodeIcalText } from "../src/parser/text.js";

function roundtrip(input: string): string {
  const model = parseIcs(input);
  return serializeCalendar(model, {
    eol: "\r\n",
    trailingNewline: model.hadTrailingNewline,
  });
}

describe("lossless roundtrip", () => {
  it("re-emits an unchanged calendar byte-for-byte", () => {
    expect(roundtrip(SAMPLE_ICS)).toBe(SAMPLE_ICS);
  });

  it("preserves all UIDs", () => {
    const model = parseIcs(SAMPLE_ICS);
    const uids = model.events.map((e) => e.parsed.uid);
    expect(uids).toEqual([
      "allday-0001@example.org",
      "midnight-0002@example.org",
      "weekly-0003@example.org",
    ]);
  });

  it("keeps VALUE=DATE all-day events", () => {
    const out = roundtrip(SAMPLE_ICS);
    expect(out).toContain("DTSTART;VALUE=DATE:20261224");
  });

  it("keeps TZID=Europe/Berlin", () => {
    const out = roundtrip(SAMPLE_ICS);
    expect(out).toContain("DTSTART;TZID=Europe/Berlin:20261224T231500");
  });

  it("preserves folded X-ALT-DESC HTML exactly", () => {
    const out = roundtrip(SAMPLE_ICS);
    expect(out).toContain("X-ALT-DESC;FMTTYPE=text/html:<html><body><p>Ein <b>langer</b> HTML-Text der");
    // continuation line must keep its single leading space
    expect(out).toContain("\r\n ische Zeilen gefaltet wird");
  });

  it("preserves X-MICROSOFT-* properties", () => {
    const out = roundtrip(SAMPLE_ICS);
    expect(out).toContain("X-MICROSOFT-CDO-BUSYSTATUS:FREE");
    expect(out).toContain("X-MICROSOFT-CDO-BUSYSTATUS:BUSY");
  });

  it("preserves every VALARM block", () => {
    const out = roundtrip(SAMPLE_ICS);
    const count = (out.match(/BEGIN:VALARM/g) ?? []).length;
    expect(count).toBe(2);
  });

  it("keeps the midnight-spanning event's local times", () => {
    const out = roundtrip(SAMPLE_ICS);
    expect(out).toContain("DTSTART;TZID=Europe/Berlin:20261224T231500");
    expect(out).toContain("DTEND;TZID=Europe/Berlin:20261225T010000");
  });
});

describe("selective editing", () => {
  it("only rewrites SUMMARY when the title changes; other events untouched", () => {
    const model = parseIcs(SAMPLE_ICS);
    const target = model.events.find((e) => e.parsed.uid === "midnight-0002@example.org")!;
    setEventProperty(target, "SUMMARY", "Christmette (geändert)");

    const out = serializeCalendar(model, { eol: "\r\n", trailingNewline: true });

    expect(out).toContain("SUMMARY:Christmette (geändert)");
    // untouched event stays exactly as before
    expect(out).toContain("UID:allday-0001@example.org");
    expect(out).toContain("SUMMARY:Heiligabend (ganztägig)");
    // untouched properties of the same event remain original
    expect(out).toContain("DESCRIPTION:Über Mitternacht hinaus.");
    expect(out).toContain("X-MICROSOFT-CDO-BUSYSTATUS:BUSY");
    // alarms remain
    expect((out.match(/BEGIN:VALARM/g) ?? []).length).toBe(2);
  });

  it("assigns a fresh UID to a new event", () => {
    const model = parseIcs(SAMPLE_ICS);
    const before = model.events.length;
    const ev = addEvent(model, { summary: "Neu", dtstart: "20260201T100000", tzid: "Europe/Berlin" });
    expect(model.events.length).toBe(before + 1);
    expect(ev.parsed.uid).toMatch(/@keepical\.local$/);
    const out = serializeCalendar(model, { eol: "\r\n", trailingNewline: true });
    expect(out).toContain("SUMMARY:Neu");
  });

  it("deleting an event does not alter other events", () => {
    const model = parseIcs(SAMPLE_ICS);
    const target = model.events.find((e) => e.parsed.uid === "weekly-0003@example.org")!;
    deleteEvent(target);
    const out = serializeCalendar(model, { eol: "\r\n", trailingNewline: true });
    expect(out).not.toContain("UID:weekly-0003@example.org");
    expect(out).toContain("UID:allday-0001@example.org");
    expect(out).toContain("UID:midnight-0002@example.org");
  });

  it("writes edited DESCRIPTION line breaks back as escaped newline sequences", () => {
    const model = parseIcs(SAMPLE_ICS);
    const target = model.events.find((e) => e.parsed.uid === "midnight-0002@example.org")!;
    setEventProperty(target, "DESCRIPTION", encodeIcalText("Zeile 1\nZeile 2"));

    const out = serializeCalendar(model, { eol: "\r\n", trailingNewline: true });
    expect(out).toContain("DESCRIPTION:Zeile 1\\nZeile 2");
  });

  it("edits EXDATE while keeping existing parameters and allowing multiple lines", () => {
    const model = parseIcs(SAMPLE_ICS);
    const target = model.events.find((e) => e.parsed.uid === "weekly-0003@example.org")!;
    const existing = target.component.properties.find((p) => p.name === "EXDATE")!;
    const edited = renderContentLine(existing).replace("20260119T180000", "20260120T180000");
    setEventProperties(target, "EXDATE", [
      parseContentLine(edited, []),
      parseContentLine("EXDATE;VALUE=DATE:20260126", []),
    ]);

    const out = serializeCalendar(model, { eol: "\r\n", trailingNewline: true });
    expect(out).toContain("EXDATE;TZID=Europe/Berlin:20260120T180000");
    expect(out).toContain("EXDATE;VALUE=DATE:20260126");
  });

  it("edits RDATE with multi-values without changing untouched EXDATE", () => {
    const model = parseIcs(SAMPLE_ICS);
    const target = model.events.find((e) => e.parsed.uid === "weekly-0003@example.org")!;
    setEventProperties(target, "RDATE", [
      parseContentLine("RDATE;TZID=Europe/Berlin:20260113T180000,20260127T180000", []),
      parseContentLine("RDATE;VALUE=DATE:20260202", []),
    ]);

    const out = serializeCalendar(model, { eol: "\r\n", trailingNewline: true });
    expect(out).toContain("RDATE;TZID=Europe/Berlin:20260113T180000,20260127T180000");
    expect(out).toContain("RDATE;VALUE=DATE:20260202");
    expect(out).toContain("EXDATE;TZID=Europe/Berlin:20260119T180000");
  });
});
