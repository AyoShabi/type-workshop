/**
 * Operations that change the current glyph. Each records an undo step before it changes anything
 * and returns whether it changed the project, so the UI knows to re-render.
 */
import { bbox } from "../font/geometry";
import type { BBox, Point } from "../font/types";
import { pushUndo } from "./history";
import { advOf, cleanEdit, contours, editedPts } from "./project";
import { currentGid, font, glyphEdit, proj, state } from "./state";

export type PointMap = (q: Point, box: BBox) => { x: number; y: number };

/** Moves the selected points, or every point when none are selected. */
export function movePts(fn: PointMap): boolean {
  const f = font();
  const gid = currentGid();
  if (f.glyphs[gid].type !== "simple") return false;
  const pts = editedPts(f, gid, proj());
  const idx = state.selPts.size ? [...state.selPts] : pts.map((_, i) => i);
  const e = glyphEdit();
  e.pts = e.pts || {};
  const bx = bbox(idx.map((i) => pts[i]))!;
  pushUndo();
  for (const i of idx) {
    const q = pts[i];
    const n = fn(q, bx);
    const d = e.pts[i] || [0, 0];
    e.pts[i] = [d[0] + Math.round(n.x - q.x), d[1] + Math.round(n.y - q.y)];
  }
  cleanEdit(e);
  return true;
}

export type ReshapeKey = "sx-" | "sx+" | "sy-" | "sy+" | "sk+" | "sk-" | "up" | "dn";

const SCALE_STEP = 0.04;
const SLANT = Math.tan((2 * Math.PI) / 180);

/**
 * The inspector's reshape buttons. Horizontal scaling is about the selection's centre.
 * Vertical scaling is about the selection's centre, or the baseline for the whole glyph.
 */
export function reshapeOp(k: ReshapeKey, upm: number, hasSelection: boolean): PointMap {
  const cx = (bx: BBox) => (bx[0] + bx[2]) / 2;
  const cy = (bx: BBox) => (hasSelection ? (bx[1] + bx[3]) / 2 : 0);
  const sx = (s: number): PointMap => (q, bx) => ({ x: cx(bx) + (q.x - cx(bx)) * s, y: q.y });
  const sy = (s: number): PointMap => (q, bx) => ({ x: q.x, y: cy(bx) + (q.y - cy(bx)) * s });
  const ops: Record<ReshapeKey, PointMap> = {
    "sx-": sx(1 - SCALE_STEP),
    "sx+": sx(1 + SCALE_STEP),
    "sy-": sy(1 - SCALE_STEP),
    "sy+": sy(1 + SCALE_STEP),
    "sk+": (q) => ({ x: q.x + q.y * SLANT, y: q.y }),
    "sk-": (q) => ({ x: q.x - q.y * SLANT, y: q.y }),
    up: (q) => ({ x: q.x, y: q.y + upm * 0.01 }),
    dn: (q) => ({ x: q.x, y: q.y - upm * 0.01 }),
  };
  return ops[k];
}

export type Metric = "lsb" | "rsb" | "adv";

/** Sets a side bearing or the advance width of the current glyph to `val`. */
export function setMetric(which: Metric, val: number): boolean {
  if (!Number.isFinite(val)) return false;
  const f = font();
  const p = proj();
  const gid = currentGid();
  const box = bbox(contours(f, gid, p).flat());
  const adv = advOf(f, gid, p);
  const e = glyphEdit();
  pushUndo();
  if (which === "lsb" && box) {
    e.shift = (e.shift || 0) + Math.round(val - box[0]);
  } else if (which === "rsb") {
    const cur = box ? adv - box[2] : adv;
    e.adv = (e.adv || 0) + Math.round(val - cur);
  } else if (which === "adv") {
    e.adv = (e.adv || 0) + Math.round(val - adv);
  }
  return true;
}

/** Moves point `i` of the current glyph to (x, y). */
export function setPoint(i: number, x: number, y: number): void {
  const q = editedPts(font(), currentGid(), proj())[i];
  const e = glyphEdit();
  e.pts = e.pts || {};
  pushUndo();
  const d = e.pts[i] || [0, 0];
  e.pts[i] = [d[0] + Math.round(x - q.x), d[1] + Math.round(y - q.y)];
  cleanEdit(e);
}

export function resetGlyph(): void {
  pushUndo();
  delete proj().edits[currentGid()];
  state.selPts.clear();
}

export function resetAll(): void {
  pushUndo();
  const p = proj();
  p.edits = {};
  p.tracking = 0;
  state.selPts.clear();
}
