import manifest from "../manifest.json";
import type { Font } from "../font/types";
import { newProject, type GlyphEdit, type Project } from "./project";

export interface Axis {
  tag: string;
  values: number[];
}

/** A font family the user can pick: one of the built-in OFL families, or an uploaded .ttf. */
export interface Family {
  slug?: string;
  name: string;
  axes: Axis[];
  default: Record<string, number>;
  /** OFL Reserved Font Name, which an exported font must not use. */
  rfn: string | null;
  /** Copyright notice of the source font (written by build.py). */
  copyright?: string;
  /** Bytes of an uploaded font. */
  buf?: ArrayBuffer;
}

export const MANIFEST = manifest as unknown as Family[];
export const AXIS_LABEL: Record<string, string> = { wght: "Weight", wdth: "Width", XROT: "Tilt across", YROT: "Tilt up" };
export const SIGNATURE = [..."Cheply£&?!@"];

/** What persists in localStorage. Projects for uploaded fonts are left out because the font bytes aren't stored. */
export interface Store {
  slug: string;
  loc: Record<string, number>;
  projects: Record<string, Project>;
  /** Selected glyph id per family. */
  sel: Record<string, number>;
}

const LS = "cheeply-type-workshop-v1";
export const UPLOAD_PREFIX = "upload:";

function loadStore(): Store {
  let store: Store = { slug: "anybody", loc: {}, projects: {}, sel: {} };
  try {
    const s = JSON.parse(localStorage.getItem(LS) || "null");
    if (s && s.projects) store = Object.assign(store, s);
  } catch {
    /* storage blocked or corrupt: start fresh */
  }
  return store;
}

export const state = {
  store: loadStore(),
  font: null as Font | null,
  uploads: {} as Record<string, Family>,
  /** Selected point indices in the current glyph. */
  selPts: new Set<number>(),
};

/** URL of a file in public/fonts/<slug>/, relative to wherever the app is deployed. */
export function fontUrl(slug: string, file: string): string {
  return `${import.meta.env.BASE_URL}fonts/${slug}/${file}`;
}

export const isUpload = (slug: string) => slug.startsWith(UPLOAD_PREFIX);

/** The current family's project, created on first use. */
export function proj(): Project {
  const { store } = state;
  return store.projects[store.slug] || (store.projects[store.slug] = newProject());
}

export function famInfo(): Family {
  const { store } = state;
  return MANIFEST.find((f) => f.slug === store.slug) || state.uploads[store.slug];
}

/** The loaded font. Only call once a font has loaded. */
export function font(): Font {
  if (!state.font) throw new Error("No font loaded");
  return state.font;
}

export const currentGid = () => state.store.sel[state.store.slug];
export const setCurrentGid = (gid: number) => {
  state.store.sel[state.store.slug] = gid;
};

/** The current glyph's edit record, created on first use. */
export function glyphEdit(): GlyphEdit {
  const p = proj();
  const g = currentGid();
  return p.edits[g] || (p.edits[g] = {});
}

let saveT = 0;
export function persist(): void {
  clearTimeout(saveT);
  saveT = window.setTimeout(() => {
    try {
      const { store } = state;
      const s: Store = { ...store, projects: {} };
      for (const k in store.projects) if (!isUpload(k)) s.projects[k] = store.projects[k];
      localStorage.setItem(LS, JSON.stringify(s));
    } catch {
      /* storage full or blocked */
    }
  }, 300);
}
