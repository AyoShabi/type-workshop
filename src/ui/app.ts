/**
 * Wires the views together. Views receive this App object in their bind functions instead of
 * importing each other, so the dependency graph stays one-way: app -> views -> editor -> font.
 */
import { parseFont } from "../font/parser";
import * as history from "../editor/history";
import { famInfo, fontUrl, isUpload, persist, proj, state } from "../editor/state";
import { $, $input, toast } from "./dom";
import { markGrids, renderGrids } from "./grids";
import { renderInspector } from "./inspector";
import { scheduleLive } from "./live";
import { renderEditor } from "./stage";
import { checkName, renderToolbar } from "./toolbar";

export interface App {
  /** Redraws the editor, inspector, grid marks and undo buttons. */
  renderAll(): void;
  renderEditor(): void;
  renderGrids(): void;
  renderToolbar(): void;
  /** After any edit: redraw, rebuild the live font, save. */
  changed(): void;
  /** Loads the current family at the current axis location. */
  loadFont(): Promise<void>;
  undo(): void;
  redo(): void;
  /** Puts the project's tracking and export name back into their controls. */
  syncProjectControls(): void;
}

const fontCache = new Map<string, Promise<ArrayBuffer>>();

function fileFor(axes: { tag: string }[], loc: Record<string, number>): string {
  return axes.map((a) => a.tag + loc[a.tag]).join("-") || "regular";
}

function updUndo(): void {
  $<HTMLButtonElement>("#undo").disabled = !history.canUndo();
  $<HTMLButtonElement>("#redo").disabled = !history.canRedo();
}

export function createApp(): App {
  const app: App = {
    renderAll() {
      renderEditor();
      renderInspector();
      markGrids();
      updUndo();
    },
    renderEditor,
    renderGrids,
    renderToolbar: () => renderToolbar(app),
    changed() {
      app.renderAll();
      scheduleLive();
      persist();
    },
    async loadFont() {
      const { store } = state;
      const f = famInfo();
      const loading = $("#loading");
      loading.hidden = false;
      try {
        let buf: ArrayBuffer;
        if (isUpload(store.slug)) buf = f.buf!;
        else {
          for (const a of f.axes) if (!a.values.includes(store.loc[a.tag])) store.loc[a.tag] = f.default[a.tag];
          const url = fontUrl(f.slug!, fileFor(f.axes, store.loc) + ".ttf");
          if (!fontCache.has(url)) {
            fontCache.set(
              url,
              fetch(url).then((r) => {
                if (!r.ok) throw new Error("Couldn't load " + url);
                return r.arrayBuffer();
              }),
            );
          }
          buf = await fontCache.get(url)!;
        }
        state.font = parseFont(buf);
      } catch (e) {
        toast((e as Error).message);
        loading.hidden = true;
        return;
      }
      loading.hidden = true;
      const font = state.font;
      if (store.sel[store.slug] == null || !font.glyphs[store.sel[store.slug]]) {
        store.sel[store.slug] = font.cmap.get(67) || 1; // "C"
      }
      state.selPts.clear();
      renderGrids();
      app.renderAll();
      scheduleLive(true);
      persist();
    },
    undo() {
      if (history.undo()) afterRestore();
      updUndo();
    },
    redo() {
      if (history.redo()) afterRestore();
      updUndo();
    },
    syncProjectControls() {
      const p = proj();
      $input("#track").value = String(p.tracking || 0);
      $("#trackOut").textContent = String(p.tracking || 0);
      $input("#famName").value = p.family;
      checkName();
    },
  };

  function afterRestore(): void {
    app.syncProjectControls();
    app.renderAll();
    scheduleLive(true);
    persist();
  }

  history.onHistoryChange(updUndo);
  return app;
}
