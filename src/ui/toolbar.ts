import { parseFont } from "../font/parser";
import { psName } from "../font/writer";
import { clearHistory, pushUndo } from "../editor/history";
import { AXIS_LABEL, MANIFEST, UPLOAD_PREFIX, famInfo, persist, proj, state } from "../editor/state";
import type { App } from "./app";
import { $, $input, toast } from "./dom";
import { scheduleLive } from "./live";

const UPLOAD_OPTION = "__upload";

export function renderToolbar(app: App): void {
  const { store, uploads } = state;
  const sel = $<HTMLSelectElement>("#fontSel");
  sel.innerHTML = "";
  for (const f of MANIFEST) sel.add(new Option(f.name, f.slug));
  for (const k in uploads) sel.add(new Option(uploads[k].name + " (uploaded)", k));
  sel.add(new Option("Upload a .ttf…", UPLOAD_OPTION));
  sel.value = store.slug;

  const f = famInfo();
  const box = $("#axes");
  box.innerHTML = "";
  store.loc = store.loc || {};
  for (const a of f.axes || []) {
    if (!a.values.includes(store.loc[a.tag])) store.loc[a.tag] = f.default[a.tag];
    const id = "ax_" + a.tag;
    const w = document.createElement("div");
    w.className = "field";
    w.innerHTML = `<div class="row"><label class="label" for="${id}">${AXIS_LABEL[a.tag] || a.tag}</label><output id="${id}o">${store.loc[a.tag]}</output></div><input id="${id}" type="range" min="0" max="${a.values.length - 1}" step="1" value="${a.values.indexOf(store.loc[a.tag])}">`;
    const r = w.querySelector("input")!;
    r.addEventListener("input", () => {
      w.querySelector("output")!.textContent = String(a.values[+r.value]);
    });
    r.addEventListener("change", () => {
      store.loc[a.tag] = a.values[+r.value];
      app.loadFont();
    });
    box.appendChild(w);
  }
  if (!(f.axes || []).length) {
    const w = document.createElement("div");
    w.className = "field";
    w.innerHTML = `<span class="label">Axes</span><span class="note">This face comes in one style.</span>`;
    box.appendChild(w);
  }
  app.syncProjectControls();
}

/**
 * Validates the export name: it must not be empty, must not contain the family's OFL Reserved
 * Font Name, and must differ from the original family name. Disables Export when it fails.
 */
export function checkName(): boolean {
  const v = $input("#famName").value.trim();
  const f = famInfo();
  const note = $("#nameNote");
  let msg = "";
  let bad = false;
  const orig = (state.font && state.font.names[1]) || f.name || "";
  if (!v) {
    msg = "Give the font a name.";
    bad = true;
  } else if (f.rfn && v.toLowerCase().includes(f.rfn.toLowerCase())) {
    msg = `The licence reserves the name "${f.rfn}". Pick another.`;
    bad = true;
  } else if (orig && v.toLowerCase().includes(orig.toLowerCase())) {
    msg = `Use a name that isn't "${orig}".`;
    bad = true;
  } else msg = `Saves as ${psName(v)}.ttf`;
  note.textContent = msg;
  note.classList.toggle("warn", bad);
  $<HTMLButtonElement>("#export").disabled = bad;
  return !bad;
}

export function bindToolbar(app: App): void {
  const { store } = state;

  $<HTMLSelectElement>("#fontSel").addEventListener("change", (e) => {
    const sel = e.target as HTMLSelectElement;
    if (sel.value === UPLOAD_OPTION) {
      sel.value = store.slug;
      $input("#upFile").click();
      return;
    }
    store.slug = sel.value;
    clearHistory();
    app.renderToolbar();
    app.loadFont();
  });

  $input("#upFile").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const buf = await file.arrayBuffer();
    try {
      const test = parseFont(buf);
      const key = UPLOAD_PREFIX + file.name;
      state.uploads[key] = { name: test.names[1] || file.name, axes: [], default: {}, buf, rfn: null };
      store.slug = key;
      app.renderToolbar();
      app.loadFont();
    } catch (err) {
      toast((err as Error).message);
    }
  });

  // One undo step per drag of the tracking slider.
  let trackPushed = false;
  $input("#track").addEventListener("input", (e) => {
    const p = proj();
    if (!trackPushed) {
      pushUndo();
      trackPushed = true;
    }
    p.tracking = +(e.target as HTMLInputElement).value;
    $("#trackOut").textContent = String(p.tracking);
    app.renderEditor();
    scheduleLive();
    persist();
  });
  $input("#track").addEventListener("change", () => {
    trackPushed = false;
  });

  $input("#famName").addEventListener("input", () => {
    proj().family = $input("#famName").value;
    checkName();
    persist();
  });
}
