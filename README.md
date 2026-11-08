# Type Workshop: a browser font editor

This started as the Cheeply Type Workshop. It's a font editor that runs in the browser, with no build step and no dependencies.

## Run it
Fonts load with `fetch`, so serve the folder over HTTP. Opening it with `file://` won't work.

    cd site
    python3 -m http.server 8000      # or: npx serve .
    # open http://localhost:8000

It deploys automatically to GitHub Pages on every push to `main` (see `.github/workflows/pages.yml`). Any other static host can serve `site/` as it is.

## What's here
- `site/index.html` contains the whole app: a TrueType parser and writer, the point editor, live preview and export, all in one file.
- `site/fonts/<family>/*.ttf` holds static cuts of six OFL fonts at every weight and width step: Latin subset, hints removed.
- `site/fonts/<family>/OFL.txt` is each font's licence. Ship it with any font you derive from these.
- `build.py` regenerates those cuts from the Google Fonts variable files using fontTools (`pip install fonttools brotli`). It expects the source fonts in `src/`.

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
1. Move into a repo as a TypeScript web app (Vite) and split out parser, writer, editor and UI modules.
2. Pen tool: add and delete points, switch curve and corner, draw new glyphs and contours.
3. Open and save .ufo and .designspace files, so work round-trips with Glyphs, Fontra and FontForge.
4. Components and anchors, plus a kerning and spacing view.
5. Masters and interpolation, then export variable fonts.
6. OTF and WOFF2 export, through fontTools in WebAssembly (Pyodide) or a small backend.

## Launch font
Cheeply Display starts from one of the shortlisted OFL faces (Anybody or Tilt Warp were the leads). Under the OFL, a modified font must keep the copyright notice and licence, and must not use a Reserved Font Name. Mona Sans reserves "Mona".
