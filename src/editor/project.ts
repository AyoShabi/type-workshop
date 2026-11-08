import type { OutlineSource } from "../font/writer";
import type { Font, Point } from "../font/types";
import type { CustomGroup } from "./groups";

/**
 * One glyph's edits. Points are stored as offsets from the source outline, not absolute positions,
 * so the same edits apply when the user switches to another weight or width of the family.
 */
export interface GlyphEdit {
  /** Point index -> [dx, dy] in font units. */
  pts?: Record<number, [number, number]>;
  /** Horizontal shift of the whole glyph (changes the left side bearing). */
  shift?: number;
  /** Extra advance width. */
  adv?: number;
}

export interface Project {
  edits: Record<number, GlyphEdit>;
  tracking: number;
  family: string;
  /** Glyph groups the user made. */
  groups?: CustomGroup[];
  /** Index of the design stage being worked on (see stages.ts). */
  stage?: number;
  /** Characters the user has marked as reviewed, stored as characters so they survive other cuts. */
  reviewed?: string;
}

export const DEFAULT_FAMILY = "Cheeply Display";

export function newProject(): Project {
  return { edits: {}, tracking: 0, family: DEFAULT_FAMILY };
}

/** Tracking is split evenly either side of each glyph. */
export const trackingShift = (p: Project) => Math.round((p.tracking || 0) / 2);

/** Points of a simple glyph with the project's edits applied. Empty for other glyph types. */
export function editedPts(font: Font, gid: number, p: Project): Point[] {
  const G = font.glyphs[gid];
  if (G.type !== "simple") return [];
  const e = p.edits[gid];
  const sh = ((e && e.shift) || 0) + trackingShift(p);
  return G.pts.map((q, i) => {
    const d = e && e.pts && e.pts[i];
    return { x: q.x + (d ? d[0] : 0) + sh, y: q.y + (d ? d[1] : 0), on: q.on };
  });
}

export function advOf(font: Font, gid: number, p: Project): number {
  const a = font.adv[gid];
  if (!a) return 0;
  const e = p.edits[gid];
  return Math.max(0, a + ((e && e.shift) || 0) + ((e && e.adv) || 0) + (p.tracking || 0));
}

/**
 * Resolved contours of a glyph, composites flattened through their components.
 * With `orig`, point edits are ignored (tracking still applies) to draw the original outline.
 */
export function contours(font: Font, gid: number, p: Project, depth = 0, orig = false): Point[][] {
  const G = font.glyphs[gid];
  if (!G) return [];
  if (G.type === "simple") {
    const pts = orig ? G.pts.map((q) => ({ x: q.x + trackingShift(p), y: q.y, on: q.on })) : editedPts(font, gid, p);
    const out: Point[][] = [];
    let s = 0;
    for (const e of G.ends) {
      out.push(pts.slice(s, e + 1));
      s = e + 1;
    }
    return out;
  }
  if (G.type === "composite" && depth < 8) {
    const out: Point[][] = [];
    for (const c of G.comps) {
      for (const ct of contours(font, c.gi, p, depth + 1, orig)) {
        out.push(
          ct.map((q) => ({
            x: q.x * c.m[0] + q.y * c.m[2] + c.dx,
            y: q.x * c.m[1] + q.y * c.m[3] + c.dy,
            on: q.on,
          })),
        );
      }
    }
    return out;
  }
  return [];
}

/** Drops point offsets that have returned to zero. */
export function cleanEdit(e: GlyphEdit): void {
  if (e.pts) for (const k in e.pts) if (!e.pts[k][0] && !e.pts[k][1]) delete e.pts[k];
}

export function isEdited(e: GlyphEdit | undefined): boolean {
  return !!(e && ((e.pts && Object.keys(e.pts).length) || e.shift || e.adv));
}

/** Adapts a font and project to what the writer needs. */
export function outlineSource(font: Font, p: Project): OutlineSource {
  return {
    points: (gid) => editedPts(font, gid, p),
    contours: (gid) => contours(font, gid, p),
    advance: (gid) => advOf(font, gid, p),
  };
}
