import { bbox } from "./geometry";
import type { BBox, Font, Point } from "./types";

/**
 * Where the writer gets each glyph's final outline and advance from.
 * The editor supplies one that applies the user's edits; the writer itself knows nothing about edits.
 */
export interface OutlineSource {
  /** Final outline of a simple glyph. Its point count can differ from the source glyph's. */
  outline(gid: number): { ends: number[]; pts: Point[] };
  /** Fully resolved contours of any glyph (composites flattened), used for bounding boxes. */
  contours(gid: number): Point[][];
  advance(gid: number): number;
}

export function encodeSimple(ends: number[], pts: Point[]): { bytes: Uint8Array; box: BBox | null } {
  const box = bbox(pts) || [0, 0, 0, 0];
  const fl: number[] = [];
  const xb: number[] = [];
  const yb: number[] = [];
  let px = 0;
  let py = 0;
  pts.forEach((q, i) => {
    let f = q.on ? 1 : 0;
    if (i === 0) f |= 64;
    const dx = q.x - px;
    const dy = q.y - py;
    px = q.x;
    py = q.y;
    if (dx === 0) f |= 16;
    else if (Math.abs(dx) < 256) {
      f |= 2;
      if (dx > 0) f |= 16;
      xb.push(Math.abs(dx));
    } else xb.push((dx >> 8) & 255, dx & 255);
    if (dy === 0) f |= 32;
    else if (Math.abs(dy) < 256) {
      f |= 4;
      if (dy > 0) f |= 32;
      yb.push(Math.abs(dy));
    } else yb.push((dy >> 8) & 255, dy & 255);
    fl.push(f);
  });
  const out = new Uint8Array(12 + ends.length * 2 + fl.length + xb.length + yb.length);
  const v = new DataView(out.buffer);
  v.setInt16(0, ends.length);
  v.setInt16(2, box[0]);
  v.setInt16(4, box[1]);
  v.setInt16(6, box[2]);
  v.setInt16(8, box[3]);
  let o = 10;
  for (const e of ends) {
    v.setUint16(o, e);
    o += 2;
  }
  v.setUint16(o, 0); // no instructions
  o += 2;
  out.set(fl, o);
  o += fl.length;
  out.set(xb, o);
  o += xb.length;
  out.set(yb, o);
  return { bytes: out, box: pts.length ? box : null };
}

function utf16(s: string): Uint8Array {
  const b = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    b[i * 2] = s.charCodeAt(i) >> 8;
    b[i * 2 + 1] = s.charCodeAt(i) & 255;
  }
  return b;
}

/** PostScript name for an export family name, e.g. "Cheeply Display" -> "CheeplyDisplay-Regular". */
export function psName(fam: string): string {
  return (fam.replace(/[^A-Za-z0-9]/g, "") || "CustomFont").slice(0, 55) + "-Regular";
}

/** A fresh name table for the renamed font. Keeps the original copyright (0) and licence (13, 14). */
export function buildName(font: Font, fam: string): Uint8Array {
  const o = font.names;
  const ps = psName(fam);
  const base = o[1] || "the original font";
  const recs = (
    [
      [0, o[0] || ""],
      [1, fam],
      [2, "Regular"],
      [3, "1.000;" + ps],
      [4, fam + " Regular"],
      [5, "Version 1.000"],
      [6, ps],
      [10, `Modified from ${base} with the Cheeply Type Workshop.`],
      [13, o[13] || "This Font Software is licensed under the SIL Open Font License, Version 1.1."],
      [14, o[14] || "https://openfontlicense.org"],
    ] as [number, string][]
  ).filter((r) => r[1]);
  const strs = recs.map((r) => utf16(r[1]));
  const so = 6 + recs.length * 12;
  const total = so + strs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint16(2, recs.length);
  v.setUint16(4, so);
  let off = 0;
  recs.forEach((r, i) => {
    const q = 6 + i * 12;
    v.setUint16(q, 3);
    v.setUint16(q + 2, 1);
    v.setUint16(q + 4, 0x409);
    v.setUint16(q + 6, r[0]);
    v.setUint16(q + 8, strs[i].length);
    v.setUint16(q + 10, off);
    out.set(strs[i], so + off);
    off += strs[i].length;
  });
  return out;
}

function checksum(u8: Uint8Array, o: number, len: number): number {
  let s = 0;
  for (let i = 0; i < len; i += 4) {
    s = (s + (((u8[o + i] << 24) | (u8[o + i + 1] << 16) | (u8[o + i + 2] << 8) | u8[o + i + 3]) >>> 0)) >>> 0;
  }
  return s;
}

/** Tables that no longer match once outlines change (variations, hinting, device metrics, signatures). */
const DROP = new Set(["DSIG", "hdmx", "LTSH", "VDMX", "fvar", "gvar", "avar", "HVAR", "MVAR", "VVAR", "STAT", "cvar", "cvt ", "fpgm", "prep", "gasp"]);

/**
 * Builds a complete .ttf from the parsed font and the edited outlines.
 * Every source table not in DROP is copied as is, so GPOS, GSUB, GDEF and the rest carry over.
 */
export function buildFont(font: Font, fam: string, src: OutlineSource): Uint8Array {
  const N = font.N;
  const parts: Uint8Array[] = [];
  const loca = new DataView(new ArrayBuffer((N + 1) * 4));
  const hmtx = new DataView(new ArrayBuffer(N * 4));
  let off = 0;
  let gb: BBox | null = null;
  let advMax = 0;
  let minL = 32767;
  let minR = 32767;
  let maxExt = -32768;
  let sumAdv = 0;
  let nAdv = 0;
  // Added points can push a glyph past the source font's maxp limits, which rasterisers trust.
  let maxPts = 0;
  let maxCont = 0;
  let maxCompPts = 0;
  let maxCompCont = 0;

  for (let g = 0; g < N; g++) {
    const G = font.glyphs[g];
    let bytes: Uint8Array;
    let box: BBox | null = null;
    if (G.type === "simple") {
      const o = src.outline(g);
      maxPts = Math.max(maxPts, o.pts.length);
      maxCont = Math.max(maxCont, o.ends.length);
      const r = encodeSimple(
        o.ends,
        o.pts.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y), on: q.on })),
      );
      bytes = r.bytes;
      box = r.box;
    } else if (G.type === "composite") {
      bytes = G.raw.slice();
      const cs = src.contours(g);
      maxCompPts = Math.max(maxCompPts, cs.flat().length);
      maxCompCont = Math.max(maxCompCont, cs.length);
      box = bbox(cs.flat().map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) })));
      if (box) {
        const v = new DataView(bytes.buffer);
        const b = box;
        [0, 1, 2, 3].forEach((k) => v.setInt16(2 + k * 2, b[k]));
      }
    } else bytes = new Uint8Array(0);

    loca.setUint32(g * 4, off);
    parts.push(bytes);
    const pad = (4 - (bytes.length % 4)) % 4;
    if (pad) parts.push(new Uint8Array(pad));
    off += bytes.length + pad;

    const a = src.advance(g);
    hmtx.setUint16(g * 4, a);
    hmtx.setInt16(g * 4 + 2, box ? box[0] : 0);
    advMax = Math.max(advMax, a);
    if (a) {
      sumAdv += a;
      nAdv++;
    }
    if (box) {
      gb = gb
        ? [Math.min(gb[0], box[0]), Math.min(gb[1], box[1]), Math.max(gb[2], box[2]), Math.max(gb[3], box[3])]
        : (box.slice() as BBox);
      minL = Math.min(minL, box[0]);
      minR = Math.min(minR, a - box[2]);
      maxExt = Math.max(maxExt, box[2]);
    }
  }
  loca.setUint32(N * 4, off);

  const glyf = new Uint8Array(off);
  let q = 0;
  for (const b of parts) {
    glyf.set(b, q);
    q += b.length;
  }

  const T: Record<string, Uint8Array> = {};
  for (const t in font.tables) if (!DROP.has(t)) T[t] = font.tables[t];
  T.glyf = glyf;
  T.loca = new Uint8Array(loca.buffer);
  T.hmtx = new Uint8Array(hmtx.buffer);
  T.name = buildName(font, fam);

  const head = font.tables.head.slice();
  const hv = new DataView(head.buffer);
  const fb: BBox = gb || [0, 0, 0, 0];
  hv.setUint32(8, 0); // checkSumAdjustment, filled in by assemble()
  [0, 1, 2, 3].forEach((k) => hv.setInt16(36 + k * 2, fb[k]));
  hv.setUint16(44, 0); // macStyle: Regular
  hv.setInt16(50, 1); // long loca
  T.head = head;

  const hhea = font.tables.hhea.slice();
  const hh = new DataView(hhea.buffer);
  hh.setUint16(10, advMax);
  hh.setInt16(12, minL);
  hh.setInt16(14, minR);
  hh.setInt16(16, maxExt);
  hh.setUint16(34, N);
  T.hhea = hhea;

  const maxp = font.tables.maxp;
  if (maxp && maxp.length >= 32) {
    const m = maxp.slice();
    const mv = new DataView(m.buffer);
    mv.setUint16(6, Math.max(mv.getUint16(6), maxPts));
    mv.setUint16(8, Math.max(mv.getUint16(8), maxCont));
    mv.setUint16(10, Math.max(mv.getUint16(10), maxCompPts));
    mv.setUint16(12, Math.max(mv.getUint16(12), maxCompCont));
    T.maxp = m;
  }

  if (font.tables["OS/2"]) {
    const os = font.tables["OS/2"].slice();
    const ov = new DataView(os.buffer);
    ov.setInt16(2, nAdv ? Math.round(sumAdv / nAdv) : 0);
    ov.setUint16(62, (ov.getUint16(62) & ~0x21 & ~0x100) | 0x40); // fsSelection: REGULAR only
    T["OS/2"] = os;
  }
  return assemble(T);
}

/** Lays out the table directory and tables, and sets every checksum. */
export function assemble(T: Record<string, Uint8Array>): Uint8Array {
  const tags = Object.keys(T).sort();
  const n = tags.length;
  const es = Math.floor(Math.log2(n));
  const sr = 2 ** es * 16;
  let off = 12 + 16 * n;
  const offs = tags.map((t) => {
    const o = off;
    off += (T[t].length + 3) & ~3;
    return o;
  });
  const out = new Uint8Array(off);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, n);
  v.setUint16(6, sr);
  v.setUint16(8, es);
  v.setUint16(10, n * 16 - sr);
  tags.forEach((t, i) => {
    const r = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[r + k] = t.charCodeAt(k);
    out.set(T[t], offs[i]);
    v.setUint32(r + 4, checksum(out, offs[i], T[t].length));
    v.setUint32(r + 8, offs[i]);
    v.setUint32(r + 12, T[t].length);
  });
  const ho = offs[tags.indexOf("head")];
  v.setUint32(ho + 8, (0xb1b0afba - checksum(out, 0, out.length)) >>> 0);
  return out;
}
