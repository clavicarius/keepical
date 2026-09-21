import type { ContentLine } from "../model/types.js";

export interface RecurrenceEditorEntry {
  value: string;
  valueType: "DATE" | "DATE-TIME";
  tzid: string;
  parameters: Record<string, string[]>;
  parameterOrder: string[];
}

export interface RecurrenceEditorIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  index?: number;
}

const DATE_VALUE_RE = /^\d{8}$/;
const DATE_TIME_VALUE_RE = /^\d{8}T\d{6}Z?$/;

export function recurrenceContentLinesToEntries(lines: ContentLine[]): RecurrenceEditorEntry[] {
  return lines.flatMap((line) => {
    const values = line.value.split(",").map((value) => value.trim());
    const valueType = line.parameters.VALUE?.[0] === "DATE" ? "DATE" : "DATE-TIME";
    const tzid = line.parameters.TZID?.[0] ?? "";
    const base = {
      valueType,
      tzid,
      parameters: cloneParameters(line.parameters),
      parameterOrder: [...line.parameterOrder],
    };
    return (values.length ? values : [""]).map((value) => ({ ...base, value }));
  });
}

export function recurrenceEntriesToContentLines(
  name: "EXDATE" | "RDATE",
  entries: RecurrenceEditorEntry[],
): ContentLine[] {
  const out: ContentLine[] = [];
  for (const entry of entries) {
    const line = contentLineFromEntry(name, entry);
    const prev = out[out.length - 1];
    if (prev && recurrenceLineSignature(prev) === recurrenceLineSignature(line)) {
      prev.value += `,${line.value}`;
    } else {
      out.push(line);
    }
  }
  return out;
}

export function summarizeRecurrenceEntries(entries: RecurrenceEditorEntry[]): string {
  if (entries.length === 0) return "Keine Einträge";
  const preview = entries.slice(0, 2).map(formatRecurrenceEntry);
  const more = entries.length > 2 ? ` +${entries.length - 2} weitere` : "";
  return `${entries.length} Eintrag${entries.length === 1 ? "" : "e"}: ${preview.join(" • ")}${more}`;
}

export function validateRecurrenceEntries(
  name: "EXDATE" | "RDATE",
  entries: RecurrenceEditorEntry[],
): RecurrenceEditorIssue[] {
  const issues: RecurrenceEditorIssue[] = [];
  entries.forEach((entry, index) => {
    const label = `${name} Eintrag ${index + 1}`;
    if (!entry.value.trim()) {
      issues.push({
        severity: "error",
        code: `${name}_EMPTY_VALUE`,
        message: `${label} ist leer.`,
        index,
      });
      return;
    }
    if (entry.valueType === "DATE") {
      if (!DATE_VALUE_RE.test(entry.value)) {
        issues.push({
          severity: "error",
          code: `${name}_INVALID_DATE`,
          message: `${label} muss ein Datum im Format YYYYMMDD sein.`,
          index,
        });
      }
      if (entry.tzid.trim()) {
        issues.push({
          severity: "warning",
          code: `${name}_DATE_WITH_TZID`,
          message: `${label} ist als Datum markiert; TZID wird dafür ignoriert.`,
          index,
        });
      }
      return;
    }
    if (!DATE_TIME_VALUE_RE.test(entry.value)) {
      issues.push({
        severity: "error",
        code: `${name}_INVALID_DATETIME`,
        message: `${label} muss ein Datum/Zeit-Wert im Format YYYYMMDDTHHMMSS oder ...Z sein.`,
        index,
      });
    }
  });
  return issues;
}

function contentLineFromEntry(name: "EXDATE" | "RDATE", entry: RecurrenceEditorEntry): ContentLine {
  const parameters = cloneParameters(entry.parameters);
  if (entry.valueType === "DATE") {
    parameters.VALUE = ["DATE"];
    delete parameters.TZID;
  } else {
    if (parameters.VALUE?.length === 1 && parameters.VALUE[0] === "DATE") delete parameters.VALUE;
    const tzid = entry.tzid.trim();
    if (tzid) parameters.TZID = [tzid];
    else delete parameters.TZID;
  }
  const parameterOrder = normalizeParameterOrder(entry.parameterOrder, parameters);
  return {
    name,
    parameters,
    parameterOrder,
    value: entry.value.trim(),
    rawLines: [],
  };
}

function normalizeParameterOrder(order: string[], parameters: Record<string, string[]>): string[] {
  const next: string[] = [];
  const seen = new Set<string>();
  for (const key of order) {
    if (parameters[key] && !seen.has(key)) {
      next.push(key);
      seen.add(key);
    }
  }
  for (const key of Object.keys(parameters)) {
    if (!seen.has(key)) {
      next.push(key);
      seen.add(key);
    }
  }
  return next;
}

function cloneParameters(parameters: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(parameters).map(([key, values]) => [key, [...values]]));
}

function recurrenceLineSignature(line: ContentLine): string {
  return JSON.stringify({
    parameterOrder: line.parameterOrder,
    parameters: line.parameterOrder.map((key) => [key, line.parameters[key] ?? []]),
  });
}

function formatRecurrenceEntry(entry: RecurrenceEditorEntry): string {
  const value = entry.valueType === "DATE" ? formatDate(entry.value) : formatDateTime(entry.value);
  const tz = entry.valueType === "DATE" || !entry.tzid.trim() ? "" : ` (${entry.tzid.trim()})`;
  return `${value}${tz}`.trim();
}

function formatDate(value: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : value;
}

function formatDateTime(value: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value);
  if (!m) return value;
  const suffix = m[7] ? " UTC" : "";
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}${suffix}`;
}
