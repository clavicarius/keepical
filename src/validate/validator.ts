/**
 * Structural validation and export reporting.
 *
 * Validation is intentionally conservative: it flags likely-invalid structures
 * without rewriting anything. The export report summarizes what was preserved
 * vs. changed so the user can trust the lossless guarantee.
 */

import type { CalendarModel, Component } from "../model/types.js";
import { renderContentLine } from "../export/serialize.js";
import { buildTree } from "../parser/tree.js";
import { unfold } from "../parser/unfold.js";
import { parseRRule } from "../ui/rrule.js";

export type Severity = "error" | "warning";

export interface ValidationIssue {
  severity: Severity;
  code: string;
  message: string;
  uid?: string;
}

export interface PropertyDiff {
  name: string;
  before: string;
  after: string;
}

export interface EventDiff {
  uid: string;
  changed: string[];
  details: PropertyDiff[];
}

export interface ExportReport {
  unchanged: number;
  changed: number;
  created: number;
  deleted: number;
  uidsPreserved: number;
  vtimezonePreserved: boolean;
  valarmsPreserved: number;
  unknownPropertiesPreserved: boolean;
  perEvent: EventDiff[];
}

function countComponents(root: Component, kind: string): number {
  let count = 0;
  const walk = (c: Component) => {
    if (c.kind === kind) count++;
    c.children.forEach(walk);
  };
  walk(root);
  return count;
}

const dateValuePattern = /^\d{8}(T\d{6}Z?)?$/;

function issue(
  severity: Severity,
  code: string,
  message: string,
  uid?: string,
): ValidationIssue {
  return { severity, code, message, uid };
}

function validateRule(raw: string, uid: string | undefined): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const parts = raw.split(";").map((part) => part.trim()).filter(Boolean);
  const names = new Set<string>();
  let hasFreq = false;

  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator <= 0 || separator === part.length - 1) {
      issues.push(issue("error", "RRULE_MALFORMED_PART", `RRULE part is malformed: ${part || "<empty>"}.`, uid));
      continue;
    }
    const name = part.slice(0, separator).toUpperCase();
    const value = part.slice(separator + 1);
    if (names.has(name)) {
      issues.push(issue("error", "RRULE_DUPLICATE_PART", `RRULE contains duplicate part ${name}.`, uid));
    }
    names.add(name);
    if (name === "FREQ") {
      hasFreq = true;
      if (!parseRRule(part).freq) {
        issues.push(issue("error", "RRULE_INVALID_FREQ", `RRULE has an invalid FREQ value: ${value}.`, uid));
      }
    } else if (["INTERVAL", "COUNT"].includes(name) && !/^[1-9]\d*$/.test(value)) {
      issues.push(issue("error", "RRULE_INVALID_INTEGER", `RRULE ${name} must be a positive integer.`, uid));
    } else if (name === "UNTIL" && !dateValuePattern.test(value)) {
      issues.push(issue("error", "RRULE_INVALID_UNTIL", "RRULE UNTIL has an invalid date/time value.", uid));
    } else if (name === "BYDAY" && !value.split(",").every((item) => /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/i.test(item))) {
      issues.push(issue("error", "RRULE_INVALID_BYDAY", "RRULE BYDAY contains an invalid weekday value.", uid));
    } else if (["BYMONTHDAY", "BYSETPOS"].includes(name) && !value.split(",").every((item) => /^[+-]?\d+$/.test(item))) {
      issues.push(issue("error", "RRULE_INVALID_INTEGER_LIST", `RRULE ${name} contains an invalid integer list.`, uid));
    } else if (!["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYSETPOS"].includes(name)) {
      issues.push(issue("warning", "RRULE_UNSUPPORTED_PART", `RRULE part ${name} is preserved but not interpreted by the editor.`, uid));
    }
  }

  if (!hasFreq) issues.push(issue("error", "RRULE_MISSING_FREQ", "RRULE must contain FREQ.", uid));
  return issues;
}

function validateDateList(name: "RDATE" | "EXDATE", value: string, uid: string | undefined): ValidationIssue[] {
  const values = value.split(",").map((item) => item.trim());
  if (values.length === 0 || values.some((item) => !dateValuePattern.test(item))) {
    return [issue("error", `${name}_INVALID_VALUE`, `${name} contains an invalid date/time value.`, uid)];
  }
  return [];
}

function originalProperties(event: CalendarModel["events"][number]): Component["properties"] {
  const wrapped = ["BEGIN:VCALENDAR", ...event.component.rawLines, "END:VCALENDAR"].join("\r\n");
  return buildTree(unfold(wrapped)).children.find((child) => child.kind === "VEVENT")?.properties ?? [];
}

function propertyText(properties: Component["properties"], name: string): string {
  return properties
    .filter((property) => property.name === name)
    .map((property) => renderContentLine(property))
    .join("\n");
}

export function validate(model: CalendarModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (model.root.kind !== "VCALENDAR") {
    issues.push(issue("error", "VCALENDAR_MISSING", "Exactly one VCALENDAR must be present."));
  }

  for (const ev of model.events) {
    if (ev.isDeleted) continue;
    const uid = ev.parsed.uid || undefined;

    if (!ev.parsed.uid) {
      issues.push(issue("error", "VEVENT_MISSING_UID", "VEVENT without UID.", uid));
    }
    if (!ev.parsed.dtstart) {
      issues.push(issue("error", "VEVENT_MISSING_DTSTART", "VEVENT without DTSTART.", uid));
    }
    if (ev.parsed.dtend && ev.parsed.duration) {
      issues.push(issue("error", "VEVENT_END_CONFLICT", "DTEND and DURATION must not be set at the same time.", uid));
    }

    for (const dt of [ev.parsed.dtstart, ev.parsed.dtend, ev.parsed.recurrenceId]) {
      if (dt?.tzid && dt.isUtc) {
        issues.push(issue("warning", "DATETIME_TZID_UTC_CONFLICT", "Date/time value has both TZID and UTC suffix (Z).", uid));
      }
    }

    for (const property of ev.component.properties) {
      if (property.name === "RRULE") issues.push(...validateRule(property.value, uid));
      if (property.name === "RDATE" || property.name === "EXDATE") {
        issues.push(...validateDateList(property.name, property.value, uid));
      }
    }
    if (ev.parsed.recurrenceId && ev.parsed.rrule.length > 0) {
      issues.push(issue("warning", "RECURRENCE_INSTANCE_RRULE", "A RECURRENCE-ID exception should not carry RRULE; the series master owns the rule.", uid));
    }
  }

  const seriesByUid = new Map<string, typeof model.events>();
  for (const event of model.events.filter((candidate) => !candidate.isDeleted && candidate.parsed.uid)) {
    const series = seriesByUid.get(event.parsed.uid) ?? [];
    series.push(event);
    seriesByUid.set(event.parsed.uid, series);
  }
  for (const [uid, series] of seriesByUid) {
    const masters = series.filter((event) => !event.parsed.recurrenceId);
    if (series.some((event) => event.parsed.recurrenceId) && masters.length === 0) {
      issues.push(issue("warning", "RECURRENCE_ORPHAN_INSTANCE", "RECURRENCE-ID instance has no series master.", uid));
    }
    const recurrenceIds = new Set<string>();
    for (const event of series) {
      const recurrenceId = event.parsed.recurrenceId?.raw;
      if (!recurrenceId) continue;
      if (recurrenceIds.has(recurrenceId)) {
        issues.push(issue("error", "RECURRENCE_DUPLICATE_ID", `Duplicate RECURRENCE-ID ${recurrenceId} in series.`, uid));
      }
      recurrenceIds.add(recurrenceId);
    }
  }

  return issues;
}

export function buildReport(model: CalendarModel): ExportReport {
  let unchanged = 0;
  let changed = 0;
  let created = 0;
  let deleted = 0;
  const perEvent: EventDiff[] = [];

  for (const ev of model.events) {
    if (ev.isDeleted) {
      deleted++;
      continue;
    }
    if (ev.isNew) {
      created++;
    } else if (ev.changedProperties.size > 0) {
      changed++;
      const before = originalProperties(ev);
      perEvent.push({
        uid: ev.parsed.uid,
        changed: [...ev.changedProperties],
        details: [...ev.changedProperties].map((name) => ({
          name,
          before: propertyText(before, name),
          after: propertyText(ev.component.properties, name),
        })),
      });
    } else {
      unchanged++;
    }
  }

  const survivingUids = model.events.filter((e) => !e.isDeleted && !e.isNew).length;

  return {
    unchanged,
    changed,
    created,
    deleted,
    uidsPreserved: survivingUids,
    vtimezonePreserved: countComponents(model.root, "VTIMEZONE") > 0,
    valarmsPreserved: countComponents(model.root, "VALARM"),
    unknownPropertiesPreserved: true,
    perEvent,
  };
}
