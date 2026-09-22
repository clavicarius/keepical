/**
 * Root Web Component: file open, event list, editor, export.
 *
 * Deliberately framework-free. Rendering is simple innerHTML with delegated
 * event handling; the amount of interactivity in the MVP does not justify a
 * virtual DOM. State lives in a single CalendarModel instance.
 */

import type { CalendarModel, ContentLine, DateTimeValue, VEvent } from "../model/types.js";
import { parseIcs } from "../parser/index.js";
import { parseContentLine } from "../parser/contentline.js";
import { encodeIcalText } from "../parser/text.js";
import { serializeCalendar } from "../export/index.js";
import { renderContentLine } from "../export/serialize.js";
import { buildReport, validate, validateRRuleValue, type ValidationIssue } from "../validate/validator.js";
import {
  addEvent,
  deleteEvent,
  setEventPropertiesScoped,
  removeEventProperty,
  setEventProperty,
  getEventSeries,
  isRecurrenceInstance,
  resolveEventEditTarget,
  DEFAULT_UID_SUFFIX,
} from "../model/calendar.js";
import { icalToPickerValue, pickerToIcal } from "./datetime.js";
import {
  recurrenceContentLinesToEntries,
  recurrenceEntriesToContentLines,
  summarizeRecurrenceEntries,
  validateRecurrenceEntries,
  type RecurrenceEditorEntry,
} from "./recurrence.js";
import { parseRRule, rruleModelToIcal } from "./rrule.js";
import logoUrl from "../assets/keepical-logo.png";

const appVersion = __APP_VERSION__;
const appCommitSha = __APP_COMMIT_SHA__;

interface RecurrenceDialogState {
  name: "EXDATE" | "RDATE";
  scope: "series" | "instance";
  entries: RecurrenceEditorEntry[];
}

type InlineIssue = Pick<ValidationIssue, "severity" | "code" | "message">;

function fmtWhen(ev: VEvent): string {
  const dt = ev.parsed.dtstart;
  if (!dt) return "—";
  const raw = dt.raw;
  if (dt.isDate && /^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)} (all-day)`;
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(raw);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  return raw;
}

export class AppShell extends HTMLElement {
  private model: CalendarModel | null = null;
  private fileName = "kalender.ics";
  private selected: VEvent | null = null;
  private editScope: "series" | "instance" = "instance";
  private recurrenceDialog: RecurrenceDialogState | null = null;
  private uidSuffix = DEFAULT_UID_SUFFIX;
  private filter = { text: "", changedOnly: false, recurringOnly: false, alarmOnly: false };

  connectedCallback(): void {
    this.render();
  }

  private async openFile(file: File): Promise<void> {
    const text = await file.text();
    this.fileName = file.name;
    this.model = parseIcs(text);
    this.selected = null;
    this.recurrenceDialog = null;
    this.render();
  }

  private export(): void {
    if (!this.model) return;
    const issues = validate(this.model);
    const errors = issues.filter((issue) => issue.severity === "error");
    const warnings = issues.filter((issue) => issue.severity === "warning");
    if (errors.length > 0) {
      this.showReport(issues);
      alert(`Export blockiert: ${errors.length} Validierungsfehler müssen zuerst behoben werden.`);
      return;
    }
    if (warnings.length > 0) {
      const proceed = confirm(
        `${warnings.length} Validierungswarnung(en):\n` +
          warnings.map((issue) => `- ${issue.message}`).join("\n") +
          "\n\nTrotzdem exportieren?",
      );
      if (!proceed) {
        this.showReport(issues);
        return;
      }
    }
    const text = serializeCalendar(this.model, {
      eol: "\r\n",
      trailingNewline: this.model.hadTrailingNewline,
    });
    const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = this.fileName;
    a.click();
    URL.revokeObjectURL(url);
    this.showReport(issues);
  }

  private showReport(issues: ValidationIssue[] = []): void {
    if (!this.model) return;
    const r = buildReport(this.model);
    const el = this.querySelector("#report");
    if (!el) return;
    const errors = issues.filter((issue) => issue.severity === "error");
    const warnings = issues.filter((issue) => issue.severity === "warning");
    const issueText = issues.length
      ? `\nValidation: ${errors.length} error(s), ${warnings.length} warning(s)\n${issues
          .map((issue) => `  [${issue.severity.toUpperCase()}] ${issue.code}: ${issue.message}`)
          .join("\n")}`
      : "\nValidation: no issues";
    const diffText = r.perEvent
      .flatMap((event) => [
        `\n${event.uid}`,
        ...event.details.flatMap((detail) => [
          `  ${detail.name}:`,
          `    before: ${detail.before || "<absent>"}`,
          `    after:  ${detail.after || "<absent>"}`,
        ]),
      ])
      .join("\n");
    el.innerHTML = `<div class="report"><pre>Export summary

VEVENT unchanged: ${r.unchanged}
VEVENT changed:   ${r.changed}
VEVENT new:       ${r.created}
VEVENT deleted:   ${r.deleted}
UIDs preserved:   ${r.uidsPreserved}
VTIMEZONE kept:   ${r.vtimezonePreserved ? "yes" : "—"}
VALARM kept:      ${r.valarmsPreserved}
Unknown properties kept: ${r.unknownPropertiesPreserved ? "yes" : "no"}
${issueText}
Changed values:${diffText || " none"}</pre></div>`;
  }

  private visibleEvents(): VEvent[] {
    if (!this.model) return [];
    const q = this.filter.text.toLowerCase();
    return this.model.events.filter((ev) => {
      if (ev.isDeleted) return false;
      if (this.filter.changedOnly && ev.changedProperties.size === 0 && !ev.isNew) return false;
      if (this.filter.recurringOnly && ev.parsed.rrule.length === 0) return false;
      if (this.filter.alarmOnly && ev.component.children.every((c) => c.kind !== "VALARM")) return false;
      if (q) {
        const hay = `${ev.parsed.summary ?? ""} ${ev.parsed.location ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  private render(): void {
    const hasModel = !!this.model;
    this.innerHTML = `
      <div class="toolbar">
        <div class="brand">
          <img src="${logoUrl}" alt="" width="32" height="32" />
          <h1>Keepical <small style="color:var(--muted)">Edit what matters. Keep the rest.</small></h1>
        </div>
        <input type="file" id="file" accept=".ics,text/calendar" />
        <button id="add" ${hasModel ? "" : "disabled"}>+ Event</button>
        <button id="export" class="primary" ${hasModel ? "" : "disabled"}>Export</button>
      </div>
      ${
        hasModel
          ? `<div class="layout">
              <section class="panel">
                <div class="filters">
                  <input type="search" id="search" placeholder="Search title/location…" value="${this.filter.text}" />
                  <label><input type="checkbox" id="f-changed" ${this.filter.changedOnly ? "checked" : ""}/> changed</label>
                  <label><input type="checkbox" id="f-recurring" ${this.filter.recurringOnly ? "checked" : ""}/> recurring</label>
                  <label><input type="checkbox" id="f-alarm" ${this.filter.alarmOnly ? "checked" : ""}/> alarm</label>
                </div>
                <div id="list"></div>
              </section>
              <section class="panel editor-panel">
                <div id="editor"></div>
                <div id="report"></div>
              </section>
             </div>`
          : `<div class="empty">Open a <code>.ics</code> file to get started. Everything stays local in your browser.</div>`
      }
      <footer class="statusbar">
        <div class="statusbar-group">
          <span class="file-label">File:</span>
          <span class="file-name">${hasModel ? escapeHtml(this.fileName) : "No file open"}</span>
        </div>
        <div class="statusbar-meta">
          <div class="statusbar-group statusbar-link">
            <a href="https://github.com/clavicarius/keepical/wiki" target="_blank" rel="noopener noreferrer">Wiki</a>
          </div>
          <div class="statusbar-group statusbar-version">
            <span class="file-label">Version:</span>
            <span>${escapeHtml(appVersion)}</span>
          </div>
          <div class="statusbar-group statusbar-version">
            <span class="file-label">Commit:</span>
            <span><code>${escapeHtml(appCommitSha)}</code></span>
          </div>
        </div>
      </footer>
    `;

    this.querySelector<HTMLInputElement>("#file")?.addEventListener("change", (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) void this.openFile(f);
    });
    this.querySelector("#export")?.addEventListener("click", () => this.export());
    this.querySelector("#add")?.addEventListener("click", () => this.onAdd());

    const bindFilter = (id: string, key: keyof typeof this.filter) =>
      this.querySelector<HTMLInputElement>(id)?.addEventListener("change", (e) => {
        (this.filter[key] as boolean) = (e.target as HTMLInputElement).checked;
        this.renderList();
      });
    bindFilter("#f-changed", "changedOnly");
    bindFilter("#f-recurring", "recurringOnly");
    bindFilter("#f-alarm", "alarmOnly");
    this.querySelector<HTMLInputElement>("#search")?.addEventListener("input", (e) => {
      this.filter.text = (e.target as HTMLInputElement).value;
      this.renderList();
    });

    if (hasModel) {
      this.renderList();
      this.renderEditor();
    }
  }

  /** Keep selected row and editor form in view after selection re-renders. */
  private ensureSelectionVisible(): void {
    if (!this.selected) return;
    this.querySelector("#list")
      ?.querySelector(".event-row.selected")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const panel = this.querySelector(".editor-panel");
    if (panel instanceof HTMLElement) panel.scrollTop = 0;
    const editor = this.querySelector("#editor");
    if (editor instanceof HTMLElement && window.matchMedia("(max-width: 600px)").matches) {
      window.scrollTo({ top: window.scrollY + editor.getBoundingClientRect().top - 8, left: 0 });
    } else {
      editor?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  private renderList(): void {
    const list = this.querySelector("#list");
    if (!list) return;
    const events = this.visibleEvents();
    if (events.length === 0) {
      list.innerHTML = `<div class="empty">No events.</div>`;
      return;
    }
    list.innerHTML = events
      .map((ev, i) => {
        const changed = ev.changedProperties.size > 0 || ev.isNew;
        const recurring = ev.parsed.rrule.length > 0 ? "↻" : "";
        const alarm = ev.component.children.some((c) => c.kind === "VALARM") ? "⏰" : "";
        const idx = this.model!.events.indexOf(ev);
        const summaryLabel = ev.parsed.summary ?? "(untitled)";
        return `<div class="event-row ${changed ? "changed" : ""} ${ev === this.selected ? "selected" : ""}" data-idx="${idx}" data-i="${i}">
          <span class="when">${fmtWhen(ev)}</span>
          <span class="title" title="${escapeHtml(summaryLabel)}">${escapeHtml(summaryLabel)}</span>
          <span class="badges">${recurring} ${alarm} ${changed ? "•" : ""}</span>
        </div>`;
      })
      .join("");
    list.querySelectorAll<HTMLElement>(".event-row").forEach((row) => {
      row.addEventListener("click", () => {
        const idx = Number(row.dataset.idx);
        this.selected = this.model!.events[idx];
        this.editScope = isRecurrenceInstance(this.selected) ? "instance" : "series";
        this.recurrenceDialog = null;
        this.renderList();
        this.renderEditor();
        this.ensureSelectionVisible();
      });
    });
  }

  private renderEditor(): void {
    const editor = this.querySelector("#editor");
    if (!editor) return;
    const ev = this.selected;
    if (!ev) {
      editor.innerHTML = `<div class="empty">Select an event to edit its details.</div>`;
      return;
    }
    const series = getEventSeries(this.model!, ev);
    const target = resolveEventEditTarget(this.model!, ev, this.editScope);
    const p = target.parsed;
    editor.innerHTML = `
      ${
        series.length > 1 || p.rrule.length > 0
          ? `<div class="field"><label>Edit scope</label><select id="e-scope">
              <option value="series" ${this.editScope === "series" ? "selected" : ""}>Whole series</option>
              <option value="instance" ${this.editScope === "instance" ? "selected" : ""}>This occurrence</option>
            </select><small class="muted">${
              isRecurrenceInstance(ev) && this.editScope === "series"
                ? "Editing the series master; this exception stays unchanged."
                : isRecurrenceInstance(ev)
                  ? "Editing only the RECURRENCE-ID exception."
                  : "Editing the recurring series master."
            }</small></div>`
          : ""
      }
      <div class="field"><label>UID (read-only)</label><div class="readonly uid-value">${escapeHtml(p.uid)}</div></div>
      <div class="field"><label>Title (SUMMARY)</label><input id="e-summary" value="${escapeHtml(p.summary ?? "")}" /></div>
      <div class="row2">
        ${renderDateTimeField("dtstart", "Start (DTSTART)", p.dtstart)}
        ${renderDateTimeField("dtend", "End (DTEND)", p.dtend)}
      </div>
      <div class="field"><label>Location (LOCATION)</label><input id="e-location" value="${escapeHtml(p.location ?? "")}" /></div>
      <div class="field"><label>Description (DESCRIPTION)</label><textarea id="e-description" class="description-input" rows="4">${escapeHtml(p.description ?? "")}</textarea></div>

      <details ${p.rrule.length || target.parsed.exdate.length || target.parsed.rdate.length ? "open" : ""}>
        <summary>Recurrence / exceptions</summary>
  ${renderRRuleEditor(p.rrule[0] ?? "")}
        ${renderRecurrenceFieldSummary(target, "EXDATE")}
        ${renderRecurrenceFieldSummary(target, "RDATE")}
      </details>

      <details>
        <summary>Raw data (${target.component.properties.length} properties)</summary>
        <pre style="white-space:pre-wrap">${escapeHtml(target.component.properties.map((x) => x.rawLines.join("\\n") || `${x.name}:${x.value}`).join("\n"))}</pre>
      </details>

      <div style="display:flex; gap:0.5rem; margin-top:1rem;">
        <button id="e-delete" style="color:var(--danger)">Delete</button>
        <span style="margin-left:auto; color:var(--muted)">${ev.changedProperties.size ? "changed: " + [...ev.changedProperties].join(", ") : "unchanged"}</span>
      </div>
      ${this.recurrenceDialog ? renderRecurrenceDialog(this.recurrenceDialog) : ""}
    `;

    this.querySelector<HTMLSelectElement>("#e-scope")?.addEventListener("change", (e) => {
      this.editScope = (e.target as HTMLSelectElement).value as "series" | "instance";
      this.recurrenceDialog = null;
      this.renderEditor();
    });

    const on = (id: string, name: string) =>
      this.querySelector<HTMLInputElement>(id)?.addEventListener("change", (e) => {
        const editTarget = resolveEventEditTarget(this.model!, ev, this.editScope);
        const value = (e.target as HTMLInputElement).value;
        const rawValue =
          name === "SUMMARY" || name === "LOCATION" || name === "DESCRIPTION"
            ? encodeIcalText(value)
            : value;
        setEventProperty(editTarget, name, rawValue);
        // keep parsed view roughly in sync for the list rendering
        if (name === "SUMMARY") editTarget.parsed.summary = value;
        if (name === "LOCATION") editTarget.parsed.location = value;
        if (name === "DESCRIPTION") editTarget.parsed.description = value;
        this.renderList();
        this.renderEditor();
      });
    on("#e-summary", "SUMMARY");
    on("#e-location", "LOCATION");
    on("#e-description", "DESCRIPTION");
    this.bindRecurrenceListField(ev, "EXDATE", this.editScope);
    this.bindRecurrenceListField(ev, "RDATE", this.editScope);
    this.bindRRuleFields(ev, this.editScope);
    this.bindRecurrenceSummaryButtons(ev);
    this.bindRecurrenceDialog();

    this.bindDateTimeField(ev, "dtstart", "DTSTART", this.editScope);
    this.bindDateTimeField(ev, "dtend", "DTEND", this.editScope);

    this.querySelector("#e-delete")?.addEventListener("click", () => {
      if (confirm("Delete this event? All other events will remain unchanged.")) {
        const visible = this.visibleEvents();
        const i = visible.indexOf(ev);
        deleteEvent(ev);
        this.recurrenceDialog = null;
        const remaining = this.visibleEvents();
        this.selected = remaining[i] ?? remaining[i - 1] ?? null;
        this.renderList();
        this.renderEditor();
        this.ensureSelectionVisible();
      }
    });
  }

  private bindDateTimeField(
    ev: VEvent,
    key: "dtstart" | "dtend",
    name: "DTSTART" | "DTEND",
    scope: "series" | "instance",
  ): void {
    const input = this.querySelector<HTMLInputElement>(`#e-${key}`);
    const target = resolveEventEditTarget(this.model!, ev, scope);
    const dtv = target.parsed[key];
    if (!input || !dtv) return;
    input.addEventListener("change", () => {
      const newRaw = pickerToIcal(input.value, dtv);
      if (newRaw === dtv.raw) return;
      dtv.raw = newRaw;
      dtv.isUtc = newRaw.endsWith("Z");
      setEventProperty(target, name, newRaw);
      const rawEl = this.querySelector(`#raw-${key}`);
      if (rawEl) rawEl.textContent = formatRawDateTime(dtv);
      this.renderList();
    });
  }

  private bindRecurrenceListField(
    ev: VEvent,
    name: "EXDATE" | "RDATE",
    scope: "series" | "instance",
  ): void {
    const input = this.querySelector<HTMLTextAreaElement>(`#e-${name.toLowerCase()}`);
    if (!input) return;
    const target = resolveEventEditTarget(this.model!, ev, scope);
    input.addEventListener("change", () => {
      const before = recurrenceLinesValue(target, name);
      const after = input.value.replace(/\r\n/g, "\n");
      if (after === before) return;
      const lines = parseRecurrenceLines(name, after);
      setEventPropertiesScoped(this.model!, ev, name, lines, scope);
      if (name === "EXDATE") target.parsed.exdate = lines.map((line) => line.value);
      if (name === "RDATE") target.parsed.rdate = lines.map((line) => line.value);
      this.recurrenceDialog = null;
      this.renderList();
      this.renderEditor();
    });
  }

  private bindRecurrenceSummaryButtons(ev: VEvent): void {
    for (const name of ["EXDATE", "RDATE"] as const) {
      this.querySelector(`#open-${name.toLowerCase()}-dialog`)?.addEventListener("click", () => {
        this.openRecurrenceDialog(ev, name, this.editScope, false);
      });
      this.querySelector(`#add-${name.toLowerCase()}-entry`)?.addEventListener("click", () => {
        this.openRecurrenceDialog(ev, name, this.editScope, true);
      });
      this.querySelector(`#clear-${name.toLowerCase()}-entries`)?.addEventListener("click", () => {
        const target = resolveEventEditTarget(this.model!, ev, this.editScope);
        if (!target.component.properties.some((property) => property.name === name)) return;
        setEventPropertiesScoped(this.model!, ev, name, [], this.editScope);
        if (name === "EXDATE") target.parsed.exdate = [];
        if (name === "RDATE") target.parsed.rdate = [];
        if (this.recurrenceDialog?.name === name) this.recurrenceDialog = null;
        this.renderList();
        this.renderEditor();
      });
    }
  }

  private bindRecurrenceDialog(): void {
    const dialog = this.recurrenceDialog;
    if (!dialog) return;
    this.querySelector("#recurrence-dialog-close")?.addEventListener("click", () => {
      this.recurrenceDialog = null;
      this.renderEditor();
    });
    this.querySelector("#recurrence-dialog-cancel")?.addEventListener("click", () => {
      this.recurrenceDialog = null;
      this.renderEditor();
    });
    this.querySelector("#recurrence-dialog-apply")?.addEventListener("click", () => this.applyRecurrenceDialog());
    this.querySelector("#recurrence-dialog-add")?.addEventListener("click", () => {
      dialog.entries.push(defaultRecurrenceEntry(this.currentRecurrenceTarget()));
      this.renderEditor();
    });

    dialog.entries.forEach((entry, index) => {
      this.querySelector<HTMLSelectElement>(`#recurrence-type-${index}`)?.addEventListener("change", (e) => {
        entry.valueType = (e.target as HTMLSelectElement).value as "DATE" | "DATE-TIME";
        entry.value = coerceRecurrenceEntryValue(entry.value, entry.valueType);
        if (entry.valueType === "DATE") entry.tzid = "";
        this.renderEditor();
      });
      this.querySelector<HTMLInputElement>(`#recurrence-value-${index}`)?.addEventListener("change", (e) => {
        entry.value = recurrenceInputToRaw(
          entry,
          (e.target as HTMLInputElement).value,
        );
        this.renderEditor();
      });
      this.querySelector<HTMLInputElement>(`#recurrence-tzid-${index}`)?.addEventListener("change", (e) => {
        entry.tzid = (e.target as HTMLInputElement).value.trim();
        this.renderEditor();
      });
      this.querySelector(`#recurrence-remove-${index}`)?.addEventListener("click", () => {
        dialog.entries.splice(index, 1);
        this.renderEditor();
      });
    });
  }

  private openRecurrenceDialog(
    ev: VEvent,
    name: "EXDATE" | "RDATE",
    scope: "series" | "instance",
    addBlank: boolean,
  ): void {
    const target = resolveEventEditTarget(this.model!, ev, scope);
    const entries = recurrenceContentLinesToEntries(recurrenceLines(target, name));
    if (addBlank) {
      entries.push({ ...defaultRecurrenceEntry(target), value: "" });
    }
    this.recurrenceDialog = { name, scope, entries };
    this.renderEditor();
  }

  private applyRecurrenceDialog(): void {
    if (!this.model || !this.selected || !this.recurrenceDialog) return;
    const dialog = this.recurrenceDialog;
    const issues = validateRecurrenceEntries(dialog.name, dialog.entries);
    if (issues.some((issue) => issue.severity === "error")) return;

    const nextLines = recurrenceEntriesToContentLines(dialog.name, dialog.entries);
    const target = this.currentRecurrenceTarget();
    const before = recurrenceLinesValue(target, dialog.name);
    const after = recurrenceLinesValueFromLines(nextLines);
    if (before !== after) {
      setEventPropertiesScoped(this.model, this.selected, dialog.name, nextLines, dialog.scope);
      const editTarget = resolveEventEditTarget(this.model, this.selected, dialog.scope);
      if (dialog.name === "EXDATE") editTarget.parsed.exdate = nextLines.map((line) => line.value);
      if (dialog.name === "RDATE") editTarget.parsed.rdate = nextLines.map((line) => line.value);
      this.renderList();
    }
    this.recurrenceDialog = null;
    this.renderEditor();
  }

  private currentRecurrenceTarget(): VEvent {
    if (!this.model || !this.selected) throw new Error("No selected event.");
    const scope = this.recurrenceDialog?.scope ?? this.editScope;
    return resolveEventEditTarget(this.model, this.selected, scope);
  }

  private bindRRuleFields(ev: VEvent, scope: "series" | "instance"): void {
    const rawInput = this.querySelector<HTMLTextAreaElement>("#e-rrule");
    if (!rawInput) return;
    const target = resolveEventEditTarget(this.model!, ev, scope);

    const applyRaw = (value: string): void => {
      const trimmed = value.trim();
      if (trimmed) {
        setEventProperty(target, "RRULE", trimmed);
        target.parsed.rrule = [trimmed];
      } else {
        removeEventProperty(target, "RRULE");
        target.parsed.rrule = [];
      }
      this.renderList();
      this.renderEditor();
    };

    rawInput.addEventListener("change", () => applyRaw(rawInput.value));

    const syncStructured = () => {
      const currentRaw = rawInput.value.trim();
      const current = parseRRule(currentRaw);
      const next = rruleModelToIcal(
        {
          freq: this.querySelector<HTMLSelectElement>("#rrule-freq")?.value ?? "",
          interval: this.querySelector<HTMLInputElement>("#rrule-interval")?.value ?? "",
          count: this.querySelector<HTMLInputElement>("#rrule-count")?.value ?? "",
          until: this.querySelector<HTMLInputElement>("#rrule-until")?.value ?? "",
          byday: this.querySelector<HTMLInputElement>("#rrule-byday")?.value ?? "",
          bymonthday: this.querySelector<HTMLInputElement>("#rrule-bymonthday")?.value ?? "",
          bysetpos: this.querySelector<HTMLInputElement>("#rrule-bysetpos")?.value ?? "",
          unsupportedParts: current.unsupportedParts,
        },
        currentRaw,
      );
      if (next === currentRaw) return;
      rawInput.value = next;
      applyRaw(next);
    };

    for (const id of [
      "#rrule-freq",
      "#rrule-interval",
      "#rrule-count",
      "#rrule-until",
      "#rrule-byday",
      "#rrule-bymonthday",
      "#rrule-bysetpos",
    ]) {
      this.querySelector<HTMLInputElement | HTMLSelectElement>(id)?.addEventListener("change", syncStructured);
    }
  }

  private onAdd(): void {
    if (!this.model) return;
    const summary = prompt("Title of the new event?", "New event");
    if (summary === null) return;
    const dtstart = prompt("DTSTART (for example 20261224T120000 or 20261224 for all-day)?", "");
    if (!dtstart) return;
    const allDay = /^\d{8}$/.test(dtstart);
    const ev = addEvent(this.model, { summary, dtstart, allDay }, this.uidSuffix);
    this.selected = ev;
    this.recurrenceDialog = null;
    this.render();
    this.ensureSelectionVisible();
  }
}

function formatRawDateTime(dtv?: DateTimeValue): string {
  if (!dtv || !dtv.raw) return "—";
  let suffix = "";
  if (dtv.tzid) suffix = ` (${dtv.tzid})`;
  else if (dtv.isUtc || /Z$/.test(dtv.raw)) suffix = " (UTC)";
  else if (dtv.isDate) suffix = " (all-day)";
  return `${dtv.raw}${suffix}`;
}

function renderDateTimeField(
  key: "dtstart" | "dtend",
  label: string,
  dtv?: DateTimeValue,
): string {
  const picker = dtv
    ? icalToPickerValue(dtv)
    : { type: "datetime-local" as const, value: "" };
  return `<div class="field">
      <label>${escapeHtml(label)}</label>
      <input type="${picker.type}" id="e-${key}" value="${escapeHtml(picker.value)}" />
      <div class="raw-value" id="raw-${key}">${escapeHtml(formatRawDateTime(dtv))}</div>
    </div>`;
}

function recurrenceLines(ev: VEvent, name: "EXDATE" | "RDATE"): ContentLine[] {
  return ev.component.properties.filter((p) => p.name === name);
}

function recurrenceLinesValue(ev: VEvent, name: "EXDATE" | "RDATE"): string {
  return recurrenceLinesValueFromLines(recurrenceLines(ev, name));
}

function recurrenceLinesValueFromLines(lines: ContentLine[]): string {
  return lines.map((line) => renderContentLine(line)).join("\n");
}

function parseRecurrenceLines(name: "EXDATE" | "RDATE", input: string) {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const fullLine =
        line.startsWith(`${name};`) || line.startsWith(`${name}:`)
          ? line
          : `${name}${line.startsWith(";") || line.startsWith(":") ? "" : ":"}${line}`;
      const parsed = parseContentLine(fullLine, []);
      parsed.name = name;
      parsed.rawLines = [];
      return parsed;
    });
}

function renderRRuleEditor(raw: string): string {
  const model = parseRRule(raw);
  const issues = raw.trim() ? validateRRuleValue(raw.trim()) : [];
  return `
    <div class="row2">
      <div class="field">
        <label>FREQ</label>
        <select id="rrule-freq">
          ${renderRRuleFreqOption("", model.freq, "—")}
          ${renderRRuleFreqOption("DAILY", model.freq)}
          ${renderRRuleFreqOption("WEEKLY", model.freq)}
          ${renderRRuleFreqOption("MONTHLY", model.freq)}
          ${renderRRuleFreqOption("YEARLY", model.freq)}
          ${renderRRuleFreqOption("HOURLY", model.freq)}
          ${renderRRuleFreqOption("MINUTELY", model.freq)}
          ${renderRRuleFreqOption("SECONDLY", model.freq)}
        </select>
      </div>
      <div class="field">
        <label>INTERVAL</label>
        <input id="rrule-interval" type="number" min="1" step="1" value="${escapeHtml(model.interval)}" />
      </div>
    </div>
    <div class="row2">
      <div class="field">
        <label>COUNT</label>
        <input id="rrule-count" type="number" min="1" step="1" value="${escapeHtml(model.count)}" />
      </div>
      <div class="field">
        <label>UNTIL</label>
        <input id="rrule-until" value="${escapeHtml(model.until)}" placeholder="20260331T215959Z" />
      </div>
    </div>
    <div class="field">
      <label>BYDAY</label>
      <input id="rrule-byday" value="${escapeHtml(model.byday)}" placeholder="MO,WE or -1SU" />
    </div>
    <div class="row2">
      <div class="field">
        <label>BYMONTHDAY</label>
        <input id="rrule-bymonthday" value="${escapeHtml(model.bymonthday)}" placeholder="1,15,-1" />
      </div>
      <div class="field">
        <label>BYSETPOS</label>
        <input id="rrule-bysetpos" value="${escapeHtml(model.bysetpos)}" placeholder="1,-1" />
      </div>
    </div>
    ${
      model.unsupportedParts.length
        ? `<div class="field"><div class="raw-value">Unsupported RRULE parts stay in raw text and are preserved on export: ${escapeHtml(model.unsupportedParts.join("; "))}</div></div>`
        : ""
    }
    <div class="field">
      <div class="raw-value">Tip: use either COUNT or UNTIL, not both. Unsupported RRULE parts remain in raw form.</div>
    </div>
    ${renderValidationList(issues)}
    <div class="field">
      <label>RRULE (raw)</label>
      <textarea id="e-rrule" rows="3">${escapeHtml(raw)}</textarea>
    </div>
  `;
}

function renderRecurrenceFieldSummary(ev: VEvent, name: "EXDATE" | "RDATE"): string {
  const entries = recurrenceContentLinesToEntries(recurrenceLines(ev, name));
  return `<div class="field recurrence-summary">
      <label>${escapeHtml(name)}</label>
      <div class="recurrence-summary-card">
        <div>
          <div class="recurrence-summary-text">${escapeHtml(summarizeRecurrenceEntries(entries))}</div>
          <div class="raw-value">Komfortmodus für einzelne Einträge, Rohtext darunter für Power-User.</div>
        </div>
        <div class="recurrence-summary-actions">
          <button type="button" id="add-${name.toLowerCase()}-entry">+ Hinzufügen…</button>
          <button type="button" id="open-${name.toLowerCase()}-dialog">Bearbeiten…</button>
          <button type="button" id="clear-${name.toLowerCase()}-entries" ${entries.length ? "" : "disabled"}>Leeren</button>
        </div>
      </div>
      <details>
        <summary>Rohtext</summary>
        <textarea id="e-${name.toLowerCase()}" rows="3">${escapeHtml(recurrenceLinesValue(ev, name))}</textarea>
        <div class="raw-value">Eine Content-Line pro Zeile; mehrere Werte pro Zeile bleiben unterstützt.</div>
      </details>
    </div>`;
}

function renderRecurrenceDialog(dialog: RecurrenceDialogState): string {
  const issues = validateRecurrenceEntries(dialog.name, dialog.entries);
  return `<div class="modal-backdrop">
      <div class="modal-card">
        <div class="modal-header">
          <h2>${escapeHtml(dialog.name)} bearbeiten</h2>
          <button type="button" id="recurrence-dialog-close" aria-label="Dialog schließen">✕</button>
        </div>
        <div class="raw-value">Scope: ${escapeHtml(dialog.scope === "series" ? "ganze Serie" : "dieses Vorkommen")}</div>
        ${renderValidationList(issues)}
        <div class="recurrence-entry-list">
          ${
            dialog.entries.length
              ? dialog.entries
                  .map(
                    (entry, index) => `<div class="recurrence-entry-row">
                <div class="row2">
                  <div class="field">
                    <label>Typ</label>
                    <select id="recurrence-type-${index}">
                      <option value="DATE" ${entry.valueType === "DATE" ? "selected" : ""}>Datum</option>
                      <option value="DATE-TIME" ${entry.valueType === "DATE-TIME" ? "selected" : ""}>Datum/Zeit</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Wert</label>
                    <input id="recurrence-value-${index}" type="${entry.valueType === "DATE" ? "date" : "datetime-local"}" value="${escapeHtml(recurrenceRawToInput(entry))}" />
                  </div>
                </div>
                ${
                  entry.valueType === "DATE-TIME"
                    ? `<div class="field"><label>TZID (optional)</label><input id="recurrence-tzid-${index}" value="${escapeHtml(entry.tzid)}" placeholder="Europe/Berlin" /></div>`
                    : ""
                }
                <div class="recurrence-entry-actions">
                  <button type="button" id="recurrence-remove-${index}">Eintrag entfernen</button>
                </div>
              </div>`,
                  )
                  .join("")
              : `<div class="empty">Noch keine Einträge.</div>`
          }
        </div>
        <div class="modal-actions">
          <button type="button" id="recurrence-dialog-add">+ Eintrag</button>
          <span class="modal-spacer"></span>
          <button type="button" id="recurrence-dialog-cancel">Abbrechen</button>
          <button type="button" id="recurrence-dialog-apply" class="primary" ${issues.some((issue) => issue.severity === "error") ? "disabled" : ""}>Übernehmen</button>
        </div>
      </div>
    </div>`;
}

function renderValidationList(issues: InlineIssue[]): string {
  if (issues.length === 0) return "";
  return `<div class="validation-list">
      ${issues
        .map(
          (issue) =>
            `<div class="validation-item ${issue.severity}">[${escapeHtml(issue.code)}] ${escapeHtml(issue.message)}</div>`,
        )
        .join("")}
    </div>`;
}

function renderRRuleFreqOption(value: string, selected: string, label: string = value): string {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
}

function recurrenceRawToInput(entry: RecurrenceEditorEntry): string {
  if (!entry.value) return "";
  return icalToPickerValue({
    raw: entry.value,
    isDate: entry.valueType === "DATE",
    isUtc: /Z$/.test(entry.value),
    tzid: entry.tzid || undefined,
  }).value;
}

function recurrenceInputToRaw(entry: RecurrenceEditorEntry, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (entry.valueType === "DATE") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    return match ? `${match[1]}${match[2]}${match[3]}` : entry.value;
  }
  const prev: DateTimeValue = {
    raw: coerceRecurrenceEntryValue(entry.value, "DATE-TIME") || "19700101T000000",
    isDate: false,
    isUtc: /Z$/.test(entry.value),
    tzid: entry.tzid || undefined,
  };
  return pickerToIcal(trimmed, prev);
}

function coerceRecurrenceEntryValue(value: string, nextType: "DATE" | "DATE-TIME"): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const dateMatch = /^(\d{8})$/.exec(trimmed);
  const datetimeMatch = /^(\d{8})T(\d{6})(Z)?$/.exec(trimmed);
  if (nextType === "DATE") {
    if (dateMatch) return dateMatch[1];
    if (datetimeMatch) return datetimeMatch[1];
    return trimmed;
  }
  if (datetimeMatch) return trimmed;
  if (dateMatch) return `${dateMatch[1]}T000000`;
  return trimmed;
}

function defaultRecurrenceEntry(ev: VEvent): RecurrenceEditorEntry {
  const dt = ev.parsed.dtstart;
  const valueType = dt?.isDate ? "DATE" : "DATE-TIME";
  return {
    value: dt?.raw ?? "",
    valueType,
    tzid: valueType === "DATE-TIME" ? dt?.tzid ?? "" : "",
    parameters: valueType === "DATE" ? { VALUE: ["DATE"] } : dt?.tzid ? { TZID: [dt.tzid] } : {},
    parameterOrder: valueType === "DATE" ? ["VALUE"] : dt?.tzid ? ["TZID"] : [],
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

customElements.define("keepical-app", AppShell);
