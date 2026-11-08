/** The right-hand panel: spacing, reshape buttons, selected point, resets. */
import { bbox } from "../font/geometry";
import { movePts, reshapeOp, resetAll, resetGlyph, setMetric, setPoint, type Metric, type ReshapeKey } from "../editor/edits";
import { advOf, contours, editedPts } from "../editor/project";
import { currentGid, font, proj, state } from "../editor/state";
import type { App } from "./app";
import { $, $input, hex4 } from "./dom";

export function renderInspector(): void {
  const f = font();
  const p = proj();
  const gid = currentGid();
  const G = f.glyphs[gid];
  const c = f.rev.get(gid);
  const sel = state.selPts;

  $("#inspChar").textContent = c != null ? (c === 32 ? "␠" : String.fromCodePoint(c)) : "·";
  $("#inspName").textContent = c != null ? hex4(c) : "glyph " + gid;

  const box = bbox(contours(f, gid, p).flat());
  const adv = advOf(f, gid, p);
  $input("#lsb").value = String(box ? Math.round(box[0]) : 0);
  $input("#rsb").value = String(box ? Math.round(adv - box[2]) : adv);
  $input("#advw").value = String(adv);

  const simple = G.type === "simple";
  $input("#lsb").disabled = !simple;
  document.querySelectorAll<HTMLButtonElement>("[data-xf]").forEach((b) => (b.disabled = !simple));
  $("#xfLabel").textContent = sel.size ? `Reshape ${sel.size} selected point${sel.size > 1 ? "s" : ""}` : "Reshape whole glyph";

  const cn = $("#compNote");
  if (G.type === "composite") {
    const names = G.comps
      .map((k) => {
        const cc = f.rev.get(k.gi);
        return cc != null ? String.fromCodePoint(cc) : "part";
      })
      .join(" + ");
    cn.textContent = `This glyph is built from ${names}. Edit those glyphs and it follows. You can still change its spacing.`;
    cn.hidden = false;
  } else cn.hidden = true;

  const one = sel.size === 1 && simple;
  $("#ptBox").hidden = !one;
  if (one) {
    const q = editedPts(f, gid, p)[[...sel][0]];
    $input("#ptx").value = String(Math.round(q.x));
    $input("#pty").value = String(Math.round(q.y));
  }

  $("#pointInfo").textContent =
    G.type === "simple"
      ? `${G.pts.length} points · ${G.ends.length} contour${G.ends.length === 1 ? "" : "s"}${sel.size ? ` · ${sel.size} selected` : ""}`
      : G.type === "composite"
        ? "Composite glyph"
        : "Empty glyph";
}

export function bindInspector(app: App): void {
  $(".insp").addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-xf]");
    if (!b) return;
    const op = reshapeOp(b.dataset.xf as ReshapeKey, font().upm, state.selPts.size > 0);
    if (movePts(op)) app.changed();
  });

  const metric = (id: string, which: Metric) =>
    $input(id).addEventListener("change", (e) => {
      if (setMetric(which, +(e.target as HTMLInputElement).value)) app.changed();
    });
  metric("#lsb", "lsb");
  metric("#rsb", "rsb");
  metric("#advw", "adv");

  const onPoint = () => {
    setPoint([...state.selPts][0], +$input("#ptx").value, +$input("#pty").value);
    app.changed();
  };
  $input("#ptx").addEventListener("change", onPoint);
  $input("#pty").addEventListener("change", onPoint);

  $("#resetGlyph").onclick = () => {
    resetGlyph();
    app.changed();
  };
  $("#resetAll").onclick = () => {
    $("#confirmAll").hidden = false;
  };
  $("#confirmNo").onclick = () => {
    $("#confirmAll").hidden = true;
  };
  $("#confirmYes").onclick = () => {
    resetAll();
    $input("#track").value = "0";
    $("#trackOut").textContent = "0";
    $("#confirmAll").hidden = true;
    app.changed();
    app.renderGrids();
  };
}
