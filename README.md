# Type Workshop: a browser font editor

This started as the Cheeply Type Workshop. It's a font editor that runs in the browser: a TypeScript app built with Vite, with no runtime dependencies.

## Run it
You need Node 20 or later.

    npm install
    npm run dev        # open the URL it prints
    npm test           # parser/writer round-trip tests
    npm run build      # type-checks, then writes the static site to dist/

It's set up for Netlify: `netlify.toml` builds with `npm run build` and publishes `dist/`. Connect the repo in Netlify (Add new site → Import an existing project) and it deploys `main` and gives each pull request a preview link. A GitHub Pages workflow (`.github/workflows/pages.yml`) also runs the tests and deploys `dist/` on every push to `main`. Any other static host can serve `dist/` as it is; the build uses relative paths, so it works under any sub-path.

## What's here
- `index.html` is the page markup. `src/main.ts` wires the app together.
- `src/font/` reads and writes TrueType with no dependencies: `parser.ts` (cmap, glyf, loca, hmtx, name), `writer.ts` (rebuilds glyf, loca, hmtx, name, head, hhea, OS/2 and copies every other table), `geometry.ts` and `types.ts`.
- `src/editor/` holds the editing model with no DOM code: `project.ts` (edits stored as point offsets and how they apply), `edits.ts` (the operations), `history.ts` (undo and redo) and `state.ts` (current font, selection, localStorage).
- `src/ui/` holds the views: toolbar, glyph grids, the SVG point editor (`stage.ts`), inspector, live preview font, proofs, and file export and import.
- `src/manifest.json` lists the built-in families, their axes and any OFL Reserved Font Name.
- `public/fonts/<family>/*.ttf` holds static cuts of six OFL fonts at every weight and width step: Latin subset, hints removed.
- `public/fonts/<family>/OFL.txt` is each font's licence. Ship it with any font you derive from these.
- `build.py` regenerates those cuts and `src/manifest.json` from the Google Fonts variable files using fontTools (`pip install fonttools brotli`). It expects the source fonts in `fonts-src/`.

## What it does
- Opens a .ttf (one of the built-in fonts, or one you upload) and parses cmap, glyf, loca, hmtx and name itself.
- Drag, box-select and nudge points. Scale, slant or raise a glyph. Change side bearings and tracking. Undo and redo.
- Saves each edit as how far each point moved, so edits carry over between weights of the same family.
- Live preview: every edit rebuilds the font and loads it into the page.
- Exports a renamed .ttf. Kerning (GPOS) and other OpenType features (GSUB, GDEF) carry over. It blocks a name that uses an OFL Reserved Font Name.

## Current limits
- You can't add or delete points or draw new glyphs.
- Glyphs built from other glyphs (composites, such as é) only have their spacing editable.
- No kerning editor, and no masters or interpolation.
- It exports .ttf only: no .otf, .woff2, .ufo or .glyphs.
- Projects are saved in the browser's localStorage, or as a .json file.

## Roadmap to a Glyphs-style app
1. ~~Move into a repo as a TypeScript web app (Vite) and split out parser, writer, editor and UI modules.~~ Done.
2. Pen tool: add and delete points, switch curve and corner, draw new glyphs and contours.
3. Open and save .ufo and .designspace files, so work round-trips with Glyphs, Fontra and FontForge.
4. Components and anchors, plus a kerning and spacing view.
5. Masters and interpolation, then export variable fonts.
6. OTF and WOFF2 export, through fontTools in WebAssembly (Pyodide) or a small backend.

## Launch font
Cheeply Display starts from one of the shortlisted OFL faces (Anybody or Tilt Warp were the leads). Under the OFL, a modified font must keep the copyright notice and licence, and must not use a Reserved Font Name. Mona Sans reserves "Mona".
