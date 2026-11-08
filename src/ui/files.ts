/** Export, licence download, and project save/open. */
import { buildFont, psName } from "../font/writer";
import { clearHistory } from "../editor/history";
import { outlineSource, type Project } from "../editor/project";
import { MANIFEST, famInfo, fontUrl, isUpload, proj, state } from "../editor/state";
import type { App } from "./app";
import { $, $input, toast } from "./dom";
import { checkName } from "./toolbar";

const PROJECT_APP_ID = "cheeply-type-workshop";

interface ProjectFile {
  app: typeof PROJECT_APP_ID;
  version: 1;
  slug: string;
  loc: Record<string, number>;
  project: Project;
}

/** Host-provided download API, present when the page runs inside a Claude artifact. */
interface DownloadsApi {
  save(o: { filename: string; data: string | Uint8Array }): Promise<void>;
}
declare global {
  interface Window {
    claude?: { use?: (cap: string) => Promise<DownloadsApi | null> };
  }
}

/** Saves a file through the host's downloads API if there is one, or a plain browser download. */
async function offer(filename: string, data: string | Uint8Array): Promise<void> {
  let dl: DownloadsApi | null | undefined = null;
  try {
    dl = await window.claude?.use?.("downloads");
  } catch {
    /* not available */
  }
  if (!dl) {
    const blob = new Blob([data as BlobPart]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Saved " + filename);
    return;
  }
  try {
    await dl.save({ filename, data });
    toast("Saved " + filename);
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === "declined") return;
    toast(code === "rate_limited" ? "A save is already waiting for your answer." : "That file couldn't be saved here.");
  }
}

export function bindFiles(app: App): void {
  const { store } = state;

  $("#export").onclick = () => {
    const font = state.font;
    if (!font || !checkName()) return;
    const fam = $input("#famName").value.trim();
    offer(psName(fam) + ".ttf", buildFont(font, fam, outlineSource(font, proj())));
  };

  $("#licence").onclick = async () => {
    const f = famInfo();
    if (isUpload(store.slug)) {
      toast("Check the licence that came with your uploaded font.");
      return;
    }
    try {
      const t = await (await fetch(fontUrl(f.slug!, "OFL.txt"))).text();
      offer(`${psName($input("#famName").value.trim())}-OFL.txt`, t);
    } catch {
      toast("Couldn't load the licence text.");
    }
  };

  $("#saveProj").onclick = () => {
    const p = proj();
    const file: ProjectFile = { app: PROJECT_APP_ID, version: 1, slug: store.slug, loc: store.loc, project: p };
    offer(`${psName(p.family).replace("-Regular", "")}-project.json`, JSON.stringify(file, null, 1));
  };

  $("#openProj").onclick = () => $input("#projFile").click();

  $input("#projFile").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const j = JSON.parse(await file.text()) as ProjectFile;
      if (j.app !== PROJECT_APP_ID) throw new Error("not a project");
      if (!MANIFEST.some((f) => f.slug === j.slug)) {
        toast("That project uses an uploaded font. Upload the same .ttf first, then open the project.");
        if (!state.uploads[j.slug]) return;
      }
      store.slug = j.slug;
      store.loc = j.loc || {};
      store.projects[j.slug] = j.project;
      clearHistory();
      app.renderToolbar();
      app.loadFont();
      toast("Project opened");
    } catch {
      toast("That file isn't a Type Workshop project.");
    }
  });
}
