/**
 * Conversion helpers between RRULE raw text and field-based editor values.
 *
 * The editor only understands a small supported subset. Unknown or unsupported
 * rule parts stay in `unsupportedParts` so structured edits can preserve them.
 */

export interface RRuleEditorModel {
  freq: string;
  interval: string;
  count: string;
  until: string;
  byday: string;
  bymonthday: string;
  bysetpos: string;
  unsupportedParts: string[];
}

const FREQ_VALUES = new Set([
  "SECONDLY",
  "MINUTELY",
  "HOURLY",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
]);

function emptyModel(): RRuleEditorModel {
  return {
    freq: "",
    interval: "",
    count: "",
    until: "",
    byday: "",
    bymonthday: "",
    bysetpos: "",
    unsupportedParts: [],
  };
}

function splitPart(part: string): [string, string] | null {
  const idx = part.indexOf("=");
  if (idx <= 0) return null;
  return [part.slice(0, idx).toUpperCase(), part.slice(idx + 1)];
}

function isPositiveInteger(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}

function isUntilValue(value: string): boolean {
  return /^\d{8}(T\d{6}Z?)?$/.test(value);
}

function normalizeCsv(
  value: string,
  itemValidator: (item: string) => boolean,
  transformer: (item: string) => string = (item) => item,
): string | null {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) return "";
  if (items.some((item) => !itemValidator(item))) return null;
  return items.map(transformer).join(",");
}

function normalizeByDay(value: string): string | null {
  return normalizeCsv(
    value,
    (item) => /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/i.test(item),
    (item) => item.toUpperCase(),
  );
}

function normalizeIntList(value: string): string | null {
  return normalizeCsv(value, (item) => /^[+-]?\d+$/.test(item));
}

export function parseRRule(raw: string): RRuleEditorModel {
  const model = emptyModel();
  const parts = (raw ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const entry = splitPart(part);
    if (!entry) {
      model.unsupportedParts.push(part);
      continue;
    }

    const [name, value] = entry;
    switch (name) {
      case "FREQ":
        if (!model.freq && FREQ_VALUES.has(value.toUpperCase())) model.freq = value.toUpperCase();
        else model.unsupportedParts.push(part);
        break;
      case "INTERVAL":
        if (!model.interval && isPositiveInteger(value)) model.interval = value;
        else model.unsupportedParts.push(part);
        break;
      case "COUNT":
        if (!model.count && isPositiveInteger(value)) model.count = value;
        else model.unsupportedParts.push(part);
        break;
      case "UNTIL":
        if (!model.until && isUntilValue(value)) model.until = value;
        else model.unsupportedParts.push(part);
        break;
      case "BYDAY":
        if (!model.byday && normalizeByDay(value) !== null) model.byday = value.toUpperCase();
        else model.unsupportedParts.push(part);
        break;
      case "BYMONTHDAY":
        if (!model.bymonthday && normalizeIntList(value) !== null) model.bymonthday = normalizeIntList(value) ?? "";
        else model.unsupportedParts.push(part);
        break;
      case "BYSETPOS":
        if (!model.bysetpos && normalizeIntList(value) !== null) model.bysetpos = normalizeIntList(value) ?? "";
        else model.unsupportedParts.push(part);
        break;
      default:
        model.unsupportedParts.push(part);
        break;
    }
  }

  return model;
}

export function rruleModelToIcal(model: RRuleEditorModel, fallbackRaw: string): string {
  const parts: string[] = [];
  const freq = model.freq.trim().toUpperCase();
  const interval = model.interval.trim();
  const count = model.count.trim();
  const until = model.until.trim().toUpperCase();
  const byday = normalizeByDay(model.byday.trim());
  const bymonthday = normalizeIntList(model.bymonthday.trim());
  const bysetpos = normalizeIntList(model.bysetpos.trim());

  if (freq) {
    if (!FREQ_VALUES.has(freq)) return fallbackRaw;
    parts.push(`FREQ=${freq}`);
  }
  if (interval) {
    if (!isPositiveInteger(interval)) return fallbackRaw;
    parts.push(`INTERVAL=${interval}`);
  }
  if (count) {
    if (!isPositiveInteger(count)) return fallbackRaw;
    parts.push(`COUNT=${count}`);
  }
  if (until) {
    if (!isUntilValue(until)) return fallbackRaw;
    parts.push(`UNTIL=${until}`);
  }
  if (byday === null || bymonthday === null || bysetpos === null) return fallbackRaw;
  if (byday) parts.push(`BYDAY=${byday}`);
  if (bymonthday) parts.push(`BYMONTHDAY=${bymonthday}`);
  if (bysetpos) parts.push(`BYSETPOS=${bysetpos}`);

  const unsupported = model.unsupportedParts
    .map((part) => part.trim())
    .filter(Boolean);

  return [...parts, ...unsupported].join(";");
}
