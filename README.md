# Memory Mosaic

A private, local photo mosaic studio. React, TypeScript and Tailwind frontend; Python, Pillow and SQLite backend. No accounts, uploads to external services, analytics, remote fonts, or cloud integrations. Photo bytes are served only between your local Python process and browser.

## Run

Requires Node.js 20.19+ (or 22.12+) and Python 3.10+. Install dependencies once:

```sh
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm start
```

Open **http://127.0.0.1:8814**. Later, `npm start` rebuilds the app and runs it. Runtime works offline after dependencies are installed. The server binds only to loopback and rejects external Host/Origin requests. Don't expose it through a network tunnel or change its bind address.

For development, run `.venv/bin/python server/server.py` and `npm run dev` in separate terminals; open Vite's local URL. Vite proxies `/api` to Python.

## Make a mosaic

1. Give a group a name and paste a local photo directory into **Photo library → Add / scan group**. Subfolders are included. The app asks before converting HEIC/HEIF files into JPEG copies in `.mosaic/cache`. Originals are never edited, moved or deleted. JPG/JPEG, PNG, WebP, TIFF and BMP are also readable; served tile images are JPEG.
2. Click a photo to open its square crop. Drag the square, adjust its size, rotate in quarter turns, then save. The separate live detail preview samples your current crop at 16–256 pixels square (default 120 × 120), enlarged so you can inspect individual pixels. Its resolution is remembered in this browser for every photo, including after reopening the app. It changes only the preview, not saved crops or export settings. For poster planning, divide export width by the number of tiles across to get the pixel width of each memory photo. Use its checkmark to include/exclude it. **Use as portrait** chooses any library photo as the main portrait, using its full original frame.
3. In **Mosaic studio**, enter any local portrait file path, or browse a portrait folder and click a thumbnail.
4. Choose **Whole portrait**, **Foreground only**, or **Background only** under **Mosaic area**. Foreground mode preserves the original background; background mode preserves the original person. Usage counts include only tiles in the chosen area. Preview and PNG export use the same mask, and your choice is saved locally.
5. Adjust tile resolution (12–160 across), photo variety, and portrait color blend. Usage reports actual unique photos and tile counts from the current arrangement. At 0% variety, each tile uses its closest average-color match. Below 100%, higher variety adds seeded randomness and a repetition penalty. At exactly 100%, placement is random, ignores color matching, and balances usage so photo counts differ by at most one tile. Every selected photo appears when there are enough tiles. **Try another arrangement** changes the seed.
6. Scroll to zoom, drag to pan, or use the zoom buttons. Export a PNG at 3,000, 6,000 or 9,000 pixels wide. Height follows the portrait aspect ratio. Export uses the same tile assignments as the preview. PNGs are saved to `.mosaic/exports` before the browser download starts; a download link remains available if the browser blocks automatic downloads. Exports above 80 megapixels are blocked to avoid exhausting browser memory. Tile photos are cached at 256 px; print clarity depends on tile size and source photos. At 6,000 px a portrait can print 20 inches wide at 300 pixels/inch.

## Named photo groups and portrait pieces

The library keeps multiple directory groups active simultaneously. Use **Add / scan group** for each folder, then filter with **All groups** or a group card. Rename a group in its name field. **Select all / Deselect all** acts on the current group filter. Crops, rotations, and inclusion/exclusion belong to the photo and are shared when directories overlap; overlapping photos are not duplicated in a matching pool.

Scanning a group updates only that group's membership. Missing files keep their saved corrections for restoration; an unavailable directory is marked unavailable without wiping its membership. Removing a group unregisters it and retains originals and corrections. Adding the same directory restores its saved name and membership.

Open **Portrait pieces** after choosing a portrait. Add a piece, rename it, and select it using inclusion/exclusion points or a box. **Suggest selection** produces three local alternatives. Review a suggestion and **Apply selection** before saving. Applying replaces the current mask; **Undo** restores the previous selection. **Add brush / Erase brush** refine masks directly, with brush size and undo/redo. Points, boxes, masks, and piece names are saved per portrait. Navigation warns about unsaved mask edits.

Each piece chooses **Mosaic** or **Keep original**, and mosaiced pieces choose one or more photo groups. Group selections form a deduplicated union. Higher pieces take priority in overlaps, including pieces set to Keep original. **Everything else** covers all remaining pixels and has the same rendering/group choices. The original portrait remains underneath all mosaiced pieces. The mosaic studio reports actual usage per piece, per group, and overall; overlapping group reports intentionally include their shared photos in both totals. Each piece uses its own grid, and boundary placements are clipped to its mask. Total placement counts sum the placements from all mosaiced pieces.

Each mosaiced piece, including Everything else, has independent resolution, photo variety, and portrait color blend controls in Portrait pieces and Mosaic studio. Moving a slider saves custom settings locally and updates the preview. **Use studio defaults** restores inheritance from the studio’s default sliders; custom settings are unaffected by later default changes. Pieces use their own square tile grids clipped to the same portrait masks. At exactly 100% variety, photo usage differs by at most one placement within each piece's eligible photo pool. That does not enforce equal group quotas or global balance across separate pieces. Preview and PNG export use identical layer masks and tile assignments. Masks use a portrait preview with a maximum dimension of 1,024 pixels, upscaled smoothly for export; inspect fine edges before printing.

### Balanced gradient halo

Choose **Portrait treatment → Balanced gradient halo** for the background or Everything else, then choose a saved subject piece under **Halo around**. This preset ignores the portrait's background colors and arranges the memory photos themselves: brighter photos near the subject, darker ones farther out. Brightness-only, cream-to-charcoal, pale-gold-to-navy, rose-to-plum, and custom palettes use photos' natural colors; no tint or portrait overlay is applied. Inner/outer brightness, reach, silhouette/ellipse shape, and reverse direction control the gradient.

Photo allocation is always balanced within the piece's deduplicated eligible pool. Counts differ by at most one; all photos appear when there are enough placements. When there are fewer placements than photos, a seed selects a subset without reuse. **Arrangement strength** organizes that fraction of placements, leaving the remainder random. 0% is balanced random, 100% organizes all placements. **Try another arrangement** changes the seed. Sorting and color-improving swaps preserve the assigned photo counts exactly. The available photos determine how pronounced the natural gradient can be.

The preset replaces ordinary photo variety and portrait blend controls while active; those settings are retained for other treatments. Its assignments and masks are shared by preview and export. Balance is per piece, rather than a global quota across pieces with different photo groups. The matching strategy lives in `server/arrangements.py`, separate from gradient construction in `server/effects.py` and canvas compositing.

### Soft halo treatment

In either piece settings panel, choose **Portrait treatment → Soft halo** on the mosaiced background or Everything else. Choose a saved subject piece under **Halo around**. **Follow silhouette** hugs its selection; **Elliptical** follows an ellipse around the selection's bounds. **Reach** measures outward distance as a percentage of the portrait's shorter side. **Strength** controls how much of the original portrait shows through near the subject. **Reverse transition** keeps photos clearer near the subject and blends them more strongly farther out. The transition adds to the piece's ordinary portrait blend and stays inside its effective mask. It does not change tile assignments or usage counts.

Treatments default to None and persist separately for each portrait piece. Adjusting or reusing a source selection updates the halo automatically. Deleting the source disables dependent treatments. Empty selections must be painted or selected before they can generate a halo. Preview and PNG export share the same local gradient map and compositing renderer.

Preset validation and gradient builders live in `server/effects.py`; frontend configuration, controls, and compositing live in `src/piece-effects.ts` and `src/EffectSettings.tsx`. Additional presets can provide overlays or arrangement targets and matching strategies without changing piece ownership.

Switching portraits restores the saved pieces for each file. If a portrait source changes externally, review **Reuse masks** or **Reset pieces** before editing or generating. The first group migration creates a database backup under `.mosaic/backups` and preserves existing edits.

### Optional local smart selection

The manual brush works without a model. To enable click/box selection:

```sh
.venv/bin/python -m pip install -r requirements-selection.txt
```

Then click **Prepare smart selection** in Portrait pieces. Setup downloads the official pinned MobileSAM checkpoint (about 39 MB), verifies its SHA-256 checksum, and stores it in `.mosaic/models`. Inference uses only the local checkpoint and caches one portrait embedding. The app runs it on CPU; no GPU or photo upload is required. Existing saved masks remain usable without the model dependencies.

A local trial on the current portrait and Apple M3 measured roughly 0.48 seconds to prepare the image and 0.03 seconds for each subsequent prompt, excluding initial Python imports. Face/head/neck and jacket selections were usable starting points. Timing and selection quality vary by portrait; the manual brush is available for corrections.

## Changes to local folders

Click **Scan** on a group after adding/removing files. Registered groups are also scanned when the window regains focus on the library page. Unchanged files reuse their metadata, crops and cached JPEGs. Removed photos disappear from the active library; their edits remain in SQLite. Returning files at the same path retain edits. Renames within the same filesystem retain edits via file identity. Adding a folder registers another active group while preserving prior edits. A replaced image at the same path retains its crop and selection; cache refreshes when file size or modification time changes. Cross-filesystem moves to a new path are treated as new photos.

The first scan/generation of a large collection is slower because originals must be decoded. Subsequent previews reuse crop thumbnails. Videos are ignored. Unsupported/corrupt images are reported and skipped.

## Local storage and backups

`.mosaic/library.sqlite` stores local paths, photo groups, selections, normalized crop coordinates, rotations, portrait pieces, and their settings. `.mosaic/pieces` stores selection masks and immutable render assets. `.mosaic/cache` contains converted JPEGs and square thumbnails. HEIC conversions are indexed by a SHA-256 fingerprint of the original file contents, so the same image can reuse its conversion after a restart, copy, or filesystem-identifier change. Existing conversions from older versions are recovered using saved photo identity and matching file size/mtime; this migration does not reconvert originals. Both are ignored by Git. Keep `.mosaic` alongside the original photo directories to preserve work; deleting the database resets edits. Set `MOSAIC_DATA_DIR` to an absolute directory to keep this data elsewhere. Changing that location starts a separate library.

## Code structure

The frontend entry point is `src/main.tsx`; `App.tsx` coordinates navigation and shared state. Feature folders keep views and their supporting code together:

- `src/library/`: photo library and group management.
- `src/pieces/`: piece models, selection tools, group picker, and selection canvas renderer.
- `src/studio/`: preview, usage, portrait/default controls, PNG export, shared mosaic renderer, and image cache.
- `src/hooks/`: library workflows, piece editing, mosaic generation, and preview fullscreen.
- `src/components/`: reusable dialogs, navigation layout, crop editor, and zoom controls.
- `src/styles/`: base styles, feature styles, and responsive overrides. `style.css` imports these in cascade order.

Preview and export share `studio/renderer.ts`. `studio/image-cache.ts` loads only used photos, bounds decoding concurrency, deduplicates requests, and upgrades tiles for zoom/export. Shared canvas gestures cancel page pinch zoom; the selection editor retains ownership of brush pointers. The fullscreen preview fills the app viewport and closes with Escape, including in embedded browsers. Dialogs contain keyboard focus, restore it on dismissal, and keep crop actions visible on short screens.

The Python entry point `server/server.py` assembles the Flask app, loopback protections, route blueprints, and piece routes. `storage.py` owns database initialization and local paths; `file_identity.py`, `conversions.py`, and `photo_service.py` own image identity, HEIC caching, and crop thumbnails. Library, portrait, and mosaic routes live in their respective `*_routes.py` modules. Piece persistence, validation, routes, and rendering are separate modules; `pieces.py` provides their public entry points. `matching.py`, `arrangements.py`, and `effects.py` keep tile selection and preset construction independent of HTTP handlers.

Existing SQLite tables, API URLs, cached filenames, and normalized crop coordinates remain compatible. TypeScript checks unused imports and bindings as part of the production build. Use Prettier for frontend formatting and Ruff for Python formatting.

## Checks

```sh
npm run build
npm test
.venv/bin/python -m unittest discover -s tests -v
```

Tests use synthetic JPG/PNG/HEIC files in isolated temporary directories. They cover conversion consent and reuse, preserving originals, crops/selections across rescans, renames/removal/restoration, deterministic matching and usage totals, portrait generation, multi-group rescans and deduplication, portrait-piece persistence and overlap priority, group-restricted matching, smart-selection validation, and loopback request restrictions.

## Optional background removal

Install the local engine once and prepare its model:

```sh
.venv/bin/python -m pip install -r requirements-background.txt
.venv/bin/python scripts/setup_background.py
```

Alternatively, after installing the optional dependencies, click **Prepare background removal** in the app. Setup downloads the official U²-Net human-segmentation weights (about 176 MB) into `.mosaic/models`. No photographs are read or sent by setup. Inference opens only these local weights and works offline, without invoking a download helper. Cutouts and masks are cached by portrait path and file modification signature. Changing the portrait invalidates its mask; changing resolution or variety reuses it.

Automatic segmentation can miss fine hair or parts of a subject. Inspect the cutout preview before printing; turning off foreground mode restores the full image. This version separates the portrait foreground for tile matching and clipping; it leaves individual memory photos intact. The output keeps the portrait’s rectangular dimensions and its original background. Foreground color matching uses alpha-weighted colors so background colors do not influence edge tiles.
