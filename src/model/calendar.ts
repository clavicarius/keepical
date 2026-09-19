/**
 * Editing operations over a CalendarModel.
 *
 * These helpers keep the raw/patch invariant intact: edits mark the affected
 * property names in `changedProperties` and set the component `dirty`, so the
 * serializer only re-renders what actually changed.
 */

import type {
  CalendarModel,
  Component,
  ContentLine,
  VEvent,
} from "./types.js";

export interface NewEventInput {
  summary: string;
  dtstart: string; // e.g. "20261224T231500" or "20261225" for all-day
  dtend?: string;
  duration?: string;
  allDay?: boolean;
  tzid?: string;
}

/** Configurable suffix for generated UIDs (see project rules). */
export const DEFAULT_UID_SUFFIX = "keepical.local";

/** RFC 4122 v4 UID using the platform crypto when available. */
export function generateUid(suffix: string = DEFAULT_UID_SUFFIX): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : fallbackUuid();
  return `${uuid}@${suffix}`;
}

function fallbackUuid(): string {
  // Simple fallback; only used where crypto.randomUUID is unavailable.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Format a Date as an iCalendar UTC timestamp: YYYYMMDDTHHMMSSZ. */
export function formatUtcStamp(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}

function line(
  name: string,
  value: string,
  parameters: Record<string, string[]> = {},
): ContentLine {
  return {
    name,
    parameters,
    parameterOrder: Object.keys(parameters),
    value,
    rawLines: [],
  };
}

/** Update a single interpreted+raw property, marking it changed. */
export function setEventProperty(
  event: VEvent,
  name: string,
  value: string,
  parameters?: Record<string, string[]>,
): void {
  const existing = event.component.properties.find((p) => p.name === name);
  if (existing) {
    existing.value = value;
    if (parameters) {
      existing.parameters = parameters;
      existing.parameterOrder = Object.keys(parameters);
    }
    existing.rawLines = []; // force re-serialization
  } else {
    event.component.properties.push(line(name, value, parameters ?? {}));
  }
  event.component.dirty = true;
  event.changedProperties.add(name);
}

/** Remove all properties of a given name from an event and mark it changed. */
export function removeEventProperty(event: VEvent, name: string): void {
  const next = event.component.properties.filter((p) => p.name !== name);
  if (next.length === event.component.properties.length) return;
  event.component.properties = next;
  event.component.dirty = true;
  event.changedProperties.add(name);
}

/** Mark an event deleted (its VEVENT block is dropped on export). */
export function deleteEvent(event: VEvent): void {
  event.isDeleted = true;
}

/** Create a new standards-compliant VEVENT and append it to the calendar. */
export function addEvent(
  model: CalendarModel,
  input: NewEventInput,
  uidSuffix: string = DEFAULT_UID_SUFFIX,
): VEvent {
  const properties: ContentLine[] = [];
  properties.push(line("UID", generateUid(uidSuffix)));
  properties.push(line("DTSTAMP", formatUtcStamp()));

  const dtParams: Record<string, string[]> = {};
  if (input.allDay) dtParams["VALUE"] = ["DATE"];
  else if (input.tzid) dtParams["TZID"] = [input.tzid];
  properties.push(line("DTSTART", input.dtstart, dtParams));

  if (input.duration) {
    properties.push(line("DURATION", input.duration));
  } else if (input.dtend) {
    properties.push(line("DTEND", input.dtend, dtParams));
  }
  properties.push(line("SUMMARY", input.summary));

  const component: Component = {
    kind: "VEVENT",
    rawLines: [],
    properties,
    children: [],
    dirty: true,
  };
  model.root.children.push(component);

  const event: VEvent = {
    component,
    parsed: {
      uid: properties[0].value,
      summary: input.summary,
      categories: [],
      rrule: [],
      rdate: [],
      exdate: [],
      attendees: [],
      dtstart: {
        raw: input.dtstart,
        isDate: !!input.allDay,
        isUtc: input.dtstart.endsWith("Z"),
        tzid: input.tzid,
      },
    },
    changedProperties: new Set(properties.map((p) => p.name)),
    isNew: true,
    isDeleted: false,
  };
  model.events.push(event);
  return event;
}
