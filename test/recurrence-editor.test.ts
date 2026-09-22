import { describe, expect, it } from "vitest";
import { parseContentLine } from "../src/parser/contentline.js";
import {
  recurrenceContentLinesToEntries,
  recurrenceEntriesToContentLines,
  summarizeRecurrenceEntries,
  validateRecurrenceEntries,
} from "../src/ui/recurrence.js";

describe("recurrence editor helpers", () => {
  it("roundtrips grouped EXDATE values with parameters", () => {
    const lines = [
      parseContentLine("EXDATE;TZID=Europe/Berlin:20260119T180000,20260126T180000", []),
      parseContentLine("EXDATE;VALUE=DATE;X-KEEP=1:20260202", []),
    ];

    const entries = recurrenceContentLinesToEntries(lines);
    const roundtrip = recurrenceEntriesToContentLines("EXDATE", entries);

    expect(roundtrip).toEqual([
      expect.objectContaining({
        name: "EXDATE",
        parameterOrder: ["TZID"],
        parameters: { TZID: ["Europe/Berlin"] },
        value: "20260119T180000,20260126T180000",
      }),
      expect.objectContaining({
        name: "EXDATE",
        parameterOrder: ["VALUE", "X-KEEP"],
        parameters: { VALUE: ["DATE"], "X-KEEP": ["1"] },
        value: "20260202",
      }),
    ]);
  });

  it("summarizes recurrence entries for compact display", () => {
    const entries = recurrenceContentLinesToEntries([
      parseContentLine("RDATE:20260120T200000Z,20260127T200000Z", []),
      parseContentLine("RDATE;VALUE=DATE:20260202", []),
    ]);

    expect(summarizeRecurrenceEntries(entries)).toContain("3 Einträge");
    expect(summarizeRecurrenceEntries(entries)).toContain("2026-01-20 20:00:00 UTC");
  });

  it("validates empty and malformed recurrence entries", () => {
    const issues = validateRecurrenceEntries("RDATE", [
      {
        value: "",
        valueType: "DATE",
        tzid: "",
        parameters: { VALUE: ["DATE"] },
        parameterOrder: ["VALUE"],
      },
      {
        value: "2026-01-20",
        valueType: "DATE-TIME",
        tzid: "Europe/Berlin",
        parameters: { TZID: ["Europe/Berlin"] },
        parameterOrder: ["TZID"],
      },
    ]);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "RDATE_EMPTY_VALUE", severity: "error" }),
        expect.objectContaining({ code: "RDATE_INVALID_DATETIME", severity: "error" }),
      ]),
    );
  });
});
