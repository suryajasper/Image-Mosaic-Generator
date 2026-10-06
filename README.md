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

1. Paste a local photo directory into **Photo library → Open folder**. Subfolders are included. The app asks before converting HEIC/HEIF files into JPEG copies in `.mosaic/cache`. Originals are never edited, moved or deleted. JPG/JPEG, PNG, WebP, TIFF and BMP are also readable; served tile images are JPEG.
2. Click a photo to open its square crop. Drag the square, adjust its size, rotate in quarter turns, then save. The separate live detail preview samples your current crop at 16–256 pixels square (default 120 × 120), enlarged so you can inspect individual pixels. Its resolution is remembered in this browser for every photo, including after reopening the app. It changes only the preview, not saved crops or export settings. For poster planning, divide export width by the number of tiles across to get the pixel width of each memory photo. Use its checkmark to include/exclude it. **Use as portrait** chooses any library photo as the main portrait, using its full original frame.
3. In **Mosaic studio**, enter any local portrait file path, or browse a portrait folder and click a thumbnail.
4. Choose **Whole portrait**, **Foreground only**, or **Background only** under **Mosaic area**. Foreground mode preserves the original background; background mode preserves the original person. Usage counts include only tiles in the chosen area. Preview and PNG export use the same mask, and your choice is saved locally.
5. Adjust tile resolution (12–160 across), photo variety, and portrait color blend. Usage reports actual unique photos and tile counts from the current arrangement. At 0% variety, each tile uses its closest average-color match. Below 100%, higher variety adds seeded randomness and a repetition penalty. At exactly 100%, placement is random, ignores color matching, and balances usage so photo counts differ by at most one tile. Every selected photo appears when there are enough tiles. **Try another arrangement** changes the seed.
6. Scroll to zoom, drag to pan, or use the zoom buttons. Export a PNG at 3,000, 6,000 or 9,000 pixels wide. Height follows the portrait aspect ratio. Export uses the same tile assignments as the preview. PNGs are saved to `.mosaic/exports` before the browser download starts; a download link remains available if the browser blocks automatic downloads. Exports above 80 megapixels are blocked to avoid exhausting browser memory. Tile photos are cached at 256 px; print clarity depends on tile size and source photos. At 6,000 px a portrait can print 20 inches wide at 300 pixels/inch.

## Changes to local folders

Click **Scan folder** after adding/removing files. The saved folder is also scanned when the window regains focus. Unchanged files reuse their metadata, crops and cached JPEGs. Removed photos disappear from the active library; their edits remain in SQLite. Returning files at the same path retain edits. Renames within the same filesystem retain edits via file identity. Switching folders activates the new folder while preserving prior edits. A replaced image at the same path retains its crop and selection; cache refreshes when file size or modification time changes. Cross-filesystem moves to a new path are treated as new photos.

The first scan/generation of a large collection is slower because originals must be decoded. Subsequent previews reuse crop thumbnails. Videos are ignored. Unsupported/corrupt images are reported and skipped.

## Local storage and backups

`.mosaic/library.sqlite` stores local paths, selections, normalized crop coordinates and rotations. `.mosaic/cache` contains converted JPEGs and square thumbnails. Both are ignored by Git. Keep `.mosaic` alongside the original photo directories to preserve work; deleting the database resets edits. Set `MOSAIC_DATA_DIR` to an absolute directory to keep this data elsewhere. Changing that location starts a separate library.

## Checks

```sh
npm run build
npm test
.venv/bin/python -m unittest discover -s tests -v
```

Tests use synthetic JPG/PNG/HEIC files in isolated temporary directories. They cover conversion consent and reuse, preserving originals, crops/selections across rescans, renames/removal/restoration, deterministic matching and usage totals, portrait generation and loopback request restrictions.

## Optional background removal

Install the local engine once and prepare its model:

```sh
.venv/bin/python -m pip install -r requirements-background.txt
.venv/bin/python scripts/setup_background.py
```

Alternatively, after installing the optional dependencies, click **Prepare background removal** in the app. Setup downloads the official U²-Net human-segmentation weights (about 176 MB) into `.mosaic/models`. No photographs are read or sent by setup. Inference opens only these local weights and works offline, without invoking a download helper. Cutouts and masks are cached by portrait path and file modification signature. Changing the portrait invalidates its mask; changing resolution or variety reuses it.

Automatic segmentation can miss fine hair or parts of a subject. Inspect the cutout preview before printing; turning off foreground mode restores the full image. This version separates the portrait foreground for tile matching and clipping; it leaves individual memory photos intact. The output keeps the portrait’s rectangular dimensions and its original background. Foreground color matching uses alpha-weighted colors so background colors do not influence edge tiles.
