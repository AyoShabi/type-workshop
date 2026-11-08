/**
 * Operations that change the current glyph. Each records an undo step before it changes anything
 * and returns whether it changed the project, so the UI knows to re-render.
 */
import { bbox } from "../font/geometry";
import type { BBox, Font, Point } from "../font/types";
import { ZONES, zonePts, type CustomGroup, type Zone } from "./groups";
import { pushUndo } from "./history";
import { advOf, cleanEdit, contours, editedPts } from "./project";
import { currentGid, font, glyphEdit, linkedGids, proj, state } from "./state";

export type PointMap = (q: Point, box: BBox) => { x: number; y: number };

/** What a reshape acts on: the selected points, a zone, or the whole glyph. */
export type Target = { kind: "points"; idx: number[] } | { kind: "zone"; zone: Zone } | { kind: "all" };

/**
 * The current target. A zone counts only while the selection is still exactly that zone's points,
 * so selecting points by hand afterwards goes back to a plain point edit.
 */
export function currentTarget(): Target {
  const sel = state.selPts;
  if (!sel.size) return { kind: "all" };
  if (state.zone) {
    const zone = ZONES[state.zone];
    const zp = zonePts(font(), currentGid(), zone);
    if (zp.length === sel.size && zp.every((i) => sel.has(i))) return { kind: "zone", zone };
  }
  return { kind: "points", idx: [...sel] };
}

/** Selects the picked zone's points in the current glyph. */
export function selectZone(): void {
  state.selPts = state.zone && state.font ? new Set(zonePts(state.font, currentGid(), ZONES[state.zone])) : new Set();
}

/**
 * Glyphs the current target applies to. Hand-picked points apply to the current glyph only,
 * because point numbers don't match between glyphs.
 */
export function targetGids(t = currentTarget()): number[] {
  return t.kind === "points" ? [currentGid()] : linkedGids();
}

function movePtsOf(f: Font, gid: number, idx: number[], fn: PointMap): void {
  if (!idx.length) return;
  const pts = editedPts(f, gid, proj());
  const e = glyphEdit(gid);
  e.pts = e.pts || {};
  const bx = bbox(idx.map((i) => pts[i]))!;
  for (const i of idx) {
    const q = pts[i];
    const n = fn(q, bx);
    const d = e.pts[i] || [0, 0];
    e.pts[i] = [d[0] + Math.round(n.x - q.x), d[1] + Math.round(n.y - q.y)];
  }
  cleanEdit(e);
}

/**
 * Moves the selected points, or every point when none are selected. With a linked group, a
 * whole-glyph or zone edit runs on every simple glyph in the group as one undo step.
 */
export function movePts(fn: PointMap, t = currentTarget()): boolean {
  const f = font();
  if (f.glyphs[currentGid()].type !== "simple") return false;
  pushUndo();
  for (const gid of targetGids(t)) {
    const G = f.glyphs[gid];
    if (G.type !== "simple") continue;
    const idx = t.kind === "points" ? t.idx : t.kind === "zone" ? zonePts(f, gid, t.zone) : G.pts.map((_, i) => i);
    movePtsOf(f, gid, idx, fn);
  }
  return true;
}

export type ReshapeKey = "sx-" | "sx+" | "sy-" | "sy+" | "sk+" | "sk-" | "up" | "dn";

const SCALE_STEP = 0.04;
const SLANT = Math.tan((2 * Math.PI) / 180);

/**
 * The inspector's reshape buttons. Horizontal scaling is about the selection's centre.
 * Vertical scaling is about the selection's centre, or the baseline for the whole glyph, or
 * `anchorY` when given (a zone's edge).
 */
export function reshapeOp(k: ReshapeKey, upm: number, hasSelection: boolean, anchorY?: number): PointMap {
  const cx = (bx: BBox) => (bx[0] + bx[2]) / 2;
  const cy = (bx: BBox) => (anchorY != null ? anchorY : hasSelection ? (bx[1] + bx[3]) / 2 : 0);
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

/** Sets a side bearing or the advance width of the current glyph, or of every glyph in the linked group, to `val`. */
export function setMetric(which: Metric, val: number): boolean {
  if (!Number.isFinite(val)) return false;
  const f = font();
  const p = proj();
  pushUndo();
  for (const gid of linkedGids()) {
    const box = bbox(contours(f, gid, p).flat());
    const adv = advOf(f, gid, p);
    const e = glyphEdit(gid);
    if (which === "lsb" && box && f.glyphs[gid].type === "simple") {
      e.shift = (e.shift || 0) + Math.round(val - box[0]);
    } else if (which === "rsb") {
      const cur = box ? adv - box[2] : adv;
      e.adv = (e.adv || 0) + Math.round(val - cur);
    } else if (which === "adv") {
      e.adv = (e.adv || 0) + Math.round(val - adv);
    }
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

/** Resets the current glyph, or every glyph in the linked group. */
export function resetGlyph(): void {
  pushUndo();
  for (const gid of linkedGids()) delete proj().edits[gid];
  state.selPts.clear();
}

export function resetAll(): void {
  pushUndo();
  const p = proj();
  p.edits = {};
  p.tracking = 0;
  state.selPts.clear();
}

/** Adds a user group and returns its index. */
export function addGroup(name: string, chars: string): number {
  pushUndo();
  const p = proj();
  p.groups = p.groups || [];
  p.groups.push({ name, chars });
  return p.groups.length - 1;
}

export function updateGroup(i: number, patch: Partial<CustomGroup>): void {
  const g = proj().groups?.[i];
  if (!g) return;
  pushUndo();
  Object.assign(g, patch);
}

export function deleteGroup(i: number): void {
  const p = proj();
  if (!p.groups?.[i]) return;
  pushUndo();
  p.groups.splice(i, 1);
}
