import { describe, expect, it } from "vitest";
import { setEventProperty } from "../src/model/calendar.js";
import { parseIcs } from "../src/parser/index.js";
import { buildReport, validate } from "../src/validate/validator.js";

function modelFromEvent(event: string) {
  return parseIcs(
    ["BEGIN:VCALENDAR", "VERSION:2.0", event, "END:VCALENDAR", ""].join("\r\n"),
  );
}

describe("validate", () => {
  it("reports structural and recurrence errors without changing the model", () => {
    const model = modelFromEvent(
      [
        "BEGIN:VEVENT",
        "UID:invalid@example.org",
        "DTSTART:20260106T180000Z",
        "DTEND:20260106T190000Z",
        "DURATION:PT1H",
        "RRULE:INTERVAL=0;BYHOUR=9",
        "EXDATE:invalid",
        "END:VEVENT",
      ].join("\r\n"),
    );
    const before = model.events[0].component.rawLines.join("\n");

    const issues = validate(model);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VEVENT_END_CONFLICT", severity: "error" }),
        expect.objectContaining({ code: "RRULE_MISSING_FREQ", severity: "error" }),
        expect.objectContaining({ code: "RRULE_INVALID_INTEGER", severity: "error" }),
        expect.objectContaining({ code: "RRULE_UNSUPPORTED_PART", severity: "warning" }),
        expect.objectContaining({ code: "EXDATE_INVALID_VALUE", severity: "error" }),
      ]),
    );
    expect(model.events[0].component.rawLines.join("\n")).toBe(before);
  });

  it("warns about a recurrence instance carrying its own RRULE", () => {
    const model = modelFromEvent(
      [
        "BEGIN:VEVENT",
        "UID:instance@example.org",
        "RECURRENCE-ID:20260113T180000Z",
        "DTSTART:20260113T190000Z",
        "RRULE:FREQ=WEEKLY",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(validate(model)).toContainEqual(
      expect.objectContaining({ code: "RECURRENCE_INSTANCE_RRULE", severity: "warning" }),
    );
  });

  it("reports invalid RRULE lists and duplicate recurrence instances", () => {
    const model = parseIcs(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:series@example.org",
        "DTSTART:20260106T180000Z",
        "RRULE:FREQ=WEEKLY;BYDAY=NO;BYMONTHDAY=oops",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:orphan@example.org",
        "RECURRENCE-ID:20260113T180000Z",
        "DTSTART:20260113T190000Z",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:orphan@example.org",
        "RECURRENCE-ID:20260113T180000Z",
        "DTSTART:20260113T200000Z",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ].join("\r\n"),
    );

    const issues = validate(model);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "RRULE_INVALID_BYDAY", severity: "error" }),
        expect.objectContaining({ code: "RRULE_INVALID_INTEGER_LIST", severity: "error" }),
        expect.objectContaining({ code: "RECURRENCE_ORPHAN_INSTANCE", severity: "warning" }),
        expect.objectContaining({ code: "RECURRENCE_DUPLICATE_ID", severity: "error" }),
      ]),
    );
  });

  it("warns when RRULE combines COUNT and UNTIL", () => {
    const model = modelFromEvent(
      [
        "BEGIN:VEVENT",
        "UID:count-until@example.org",
        "DTSTART:20260106T180000Z",
        "RRULE:FREQ=WEEKLY;COUNT=5;UNTIL=20260203T180000Z",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(validate(model)).toContainEqual(
      expect.objectContaining({ code: "RRULE_COUNT_UNTIL_CONFLICT", severity: "warning" }),
    );
  });
});

describe("buildReport", () => {
  it("includes actual before and after values per changed property", () => {
    const model = modelFromEvent(
      [
        "BEGIN:VEVENT",
        "UID:diff@example.org",
        "DTSTART:20260106T180000Z",
        "SUMMARY:Before",
        "LOCATION:Room A",
        "END:VEVENT",
      ].join("\r\n"),
    );
    setEventProperty(model.events[0], "SUMMARY", "After");

    const report = buildReport(model);

    expect(report.changed).toBe(1);
    expect(report.perEvent[0].changed).toEqual(["SUMMARY"]);
    expect(report.perEvent[0].details).toEqual([
      { name: "SUMMARY", before: "SUMMARY:Before", after: "SUMMARY:After" },
    ]);
  });
});
