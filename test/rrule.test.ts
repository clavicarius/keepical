import { describe, expect, it } from "vitest";
import { parseRRule, rruleModelToIcal } from "../src/ui/rrule.js";

describe("parseRRule", () => {
  it("extracts the supported editor fields", () => {
    expect(parseRRule("FREQ=WEEKLY;INTERVAL=2;COUNT=5;BYDAY=MO,WE;BYMONTHDAY=1,-1;BYSETPOS=1")).toEqual({
      freq: "WEEKLY",
      interval: "2",
      count: "5",
      until: "",
      byday: "MO,WE",
      bymonthday: "1,-1",
      bysetpos: "1",
      unsupportedParts: [],
    });
  });

  it("keeps unsupported rule parts for raw fallback", () => {
    expect(parseRRule("FREQ=MONTHLY;BYHOUR=9;WKST=MO;BYDAY=-1SU")).toEqual({
      freq: "MONTHLY",
      interval: "",
      count: "",
      until: "",
      byday: "-1SU",
      bymonthday: "",
      bysetpos: "",
      unsupportedParts: ["BYHOUR=9", "WKST=MO"],
    });
  });
});

describe("rruleModelToIcal", () => {
  it("rebuilds a rule and preserves unsupported parts", () => {
    const parsed = parseRRule("FREQ=WEEKLY;BYDAY=MO,WE;WKST=MO");
    const rebuilt = rruleModelToIcal(
      {
        ...parsed,
        interval: "2",
        count: "6",
      },
      "FREQ=WEEKLY;BYDAY=MO,WE;WKST=MO",
    );

    expect(rebuilt).toBe("FREQ=WEEKLY;INTERVAL=2;COUNT=6;BYDAY=MO,WE;WKST=MO");
  });

  it("returns the fallback raw value when a field is invalid", () => {
    expect(
      rruleModelToIcal(
        {
          freq: "WEEKLY",
          interval: "0",
          count: "",
          until: "",
          byday: "MO",
          bymonthday: "",
          bysetpos: "",
          unsupportedParts: [],
        },
        "FREQ=WEEKLY;BYDAY=MO",
      ),
    ).toBe("FREQ=WEEKLY;BYDAY=MO");
  });
});
