/**
 * Root Web Component: file open, event list, editor, export.
 *
 * Deliberately framework-free. Rendering is simple innerHTML with delegated
 * event handling; the amount of interactivity in the MVP does not justify a
 * virtual DOM. State lives in a single CalendarModel instance.
 */

import type { CalendarModel, DateTimeValue, VEvent } from "../model/types.js";
import { parseIcs } from "../parser/index.js";
import { parseContentLine } from "../parser/contentline.js";
import { encodeIcalText } from "../parser/text.js";
import { serializeCalendar } from "../export/index.js";
import { renderContentLine } from "../export/serialize.js";
import { buildReport, validate } from "../validate/validator.js";
import { addEvent, deleteEvent, setEventProperties, setEventProperty, DEFAULT_UID_SUFFIX } from "../model/calendar.js";
import { icalToPickerValue, pickerToIcal } from "./datetime.js";
import logoUrl from "../assets/keepical-logo.png";

const appVersion = __APP_VERSION__;
const appCommitSha = __APP_COMMIT_SHA__;

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
    this.render();
  }

  private export(): void {
    if (!this.model) return;
    const issues = validate(this.model).filter((i) => i.severity === "error");
    if (issues.length > 0) {
      const proceed = confirm(
        `Es gibt ${issues.length} Validierungsfehler:\n` +
          issues.map((i) => `- ${i.message}`).join("\n") +
          "\n\nTrotzdem exportieren?",
      );
      if (!proceed) return;
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
    this.showReport();
  }

  private showReport(): void {
    if (!this.model) return;
    const r = buildReport(this.model);
    const el = this.querySelector("#report");
    if (!el) return;
    el.innerHTML = `<div class="report"><pre>Export created

VEVENT unchanged: ${r.unchanged}
VEVENT changed:   ${r.changed}
VEVENT new:       ${r.created}
VEVENT deleted:   ${r.deleted}
UIDs preserved:   ${r.uidsPreserved}
VTIMEZONE kept:   ${r.vtimezonePreserved ? "yes" : "—"}
VALARM kept:      ${r.valarmsPreserved}
Unknown properties kept: ${r.unknownPropertiesPreserved ? "yes" : "no"}
${r.perEvent.map((d) => `\n${d.uid}\n  changed: ${d.changed.join(", ")}`).join("")}</pre></div>`;
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
    this.querySelector("#editor")?.scrollIntoView({ block: "nearest" });
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
    const p = ev.parsed;
    editor.innerHTML = `
      <div class="field"><label>UID (read-only)</label><div class="readonly uid-value">${escapeHtml(p.uid)}</div></div>
      <div class="field"><label>Title (SUMMARY)</label><input id="e-summary" value="${escapeHtml(p.summary ?? "")}" /></div>
      <div class="row2">
        ${renderDateTimeField("dtstart", "Start (DTSTART)", p.dtstart)}
        ${renderDateTimeField("dtend", "End (DTEND)", p.dtend)}
      </div>
      <div class="field"><label>Location (LOCATION)</label><input id="e-location" value="${escapeHtml(p.location ?? "")}" /></div>
      <div class="field"><label>Description (DESCRIPTION)</label><textarea id="e-description" class="description-input" rows="4">${escapeHtml(p.description ?? "")}</textarea></div>

      <details ${p.rrule.length ? "open" : ""}>
        <summary>Recurrence / exceptions</summary>
        <div class="field"><label>RRULE (raw)</label><input id="e-rrule" value="${escapeHtml(p.rrule[0] ?? "")}" /></div>
        <div class="field">
          <label>EXDATE (eine Zeile pro Content-Line)</label>
          <textarea id="e-exdate" rows="3">${escapeHtml(recurrenceLinesValue(ev, "EXDATE"))}</textarea>
        </div>
        <div class="field">
          <label>RDATE (eine Zeile pro Content-Line)</label>
          <textarea id="e-rdate" rows="3">${escapeHtml(recurrenceLinesValue(ev, "RDATE"))}</textarea>
        </div>
      </details>

      <details>
        <summary>Raw data (${ev.component.properties.length} properties)</summary>
        <pre style="white-space:pre-wrap">${escapeHtml(ev.component.properties.map((x) => x.rawLines.join("\\n") || `${x.name}:${x.value}`).join("\n"))}</pre>
      </details>

      <div style="display:flex; gap:0.5rem; margin-top:1rem;">
        <button id="e-delete" style="color:var(--danger)">Delete</button>
        <span style="margin-left:auto; color:var(--muted)">${ev.changedProperties.size ? "changed: " + [...ev.changedProperties].join(", ") : "unchanged"}</span>
      </div>
    `;

    const on = (id: string, name: string) =>
      this.querySelector<HTMLInputElement>(id)?.addEventListener("change", (e) => {
        const value = (e.target as HTMLInputElement).value;
        const rawValue =
          name === "SUMMARY" || name === "LOCATION" || name === "DESCRIPTION"
            ? encodeIcalText(value)
            : value;
        setEventProperty(ev, name, rawValue);
        // keep parsed view roughly in sync for the list rendering
        if (name === "SUMMARY") ev.parsed.summary = value;
        if (name === "LOCATION") ev.parsed.location = value;
        if (name === "DESCRIPTION") ev.parsed.description = value;
        this.renderList();
        this.renderEditor();
      });
    on("#e-summary", "SUMMARY");
    on("#e-location", "LOCATION");
    on("#e-description", "DESCRIPTION");
    on("#e-rrule", "RRULE");
    this.bindRecurrenceListField(ev, "EXDATE");
    this.bindRecurrenceListField(ev, "RDATE");

    this.bindDateTimeField(ev, "dtstart", "DTSTART");
    this.bindDateTimeField(ev, "dtend", "DTEND");

    this.querySelector("#e-delete")?.addEventListener("click", () => {
      if (confirm("Delete this event? All other events will remain unchanged.")) {
        const visible = this.visibleEvents();
        const i = visible.indexOf(ev);
        deleteEvent(ev);
        const remaining = this.visibleEvents();
        this.selected = remaining[i] ?? remaining[i - 1] ?? null;
        this.renderList();
        this.renderEditor();
        this.ensureSelectionVisible();
      }
    });
  }

  private bindDateTimeField(ev: VEvent, key: "dtstart" | "dtend", name: "DTSTART" | "DTEND"): void {
    const input = this.querySelector<HTMLInputElement>(`#e-${key}`);
    const dtv = ev.parsed[key];
    if (!input || !dtv) return;
    input.addEventListener("change", () => {
      const newRaw = pickerToIcal(input.value, dtv);
      if (newRaw === dtv.raw) return;
      dtv.raw = newRaw;
      dtv.isUtc = newRaw.endsWith("Z");
      setEventProperty(ev, name, newRaw);
      const rawEl = this.querySelector(`#raw-${key}`);
      if (rawEl) rawEl.textContent = formatRawDateTime(dtv);
      this.renderList();
    });
  }

  private bindRecurrenceListField(ev: VEvent, name: "EXDATE" | "RDATE"): void {
    const input = this.querySelector<HTMLTextAreaElement>(`#e-${name.toLowerCase()}`);
    if (!input) return;
    input.addEventListener("change", () => {
      const before = recurrenceLinesValue(ev, name);
      const after = input.value.replace(/\r\n/g, "\n");
      if (after === before) return;
      const lines = parseRecurrenceLines(name, after);
      setEventProperties(ev, name, lines);
      if (name === "EXDATE") ev.parsed.exdate = lines.map((line) => line.value);
      if (name === "RDATE") ev.parsed.rdate = lines.map((line) => line.value);
      this.renderList();
      this.renderEditor();
    });
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

function recurrenceLinesValue(ev: VEvent, name: "EXDATE" | "RDATE"): string {
  return ev.component.properties
    .filter((p) => p.name === name)
    .map((p) => renderContentLine(p))
    .join("\n");
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

customElements.define("keepical-app", AppShell);
