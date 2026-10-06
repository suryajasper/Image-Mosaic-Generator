# Photo groups and portrait pieces

Research and proposal, October 5, 2026. The implementation now includes named directory groups, persistent portrait pieces, MobileSAM selection with manual refinement, and per-piece group matching. The research notes below describe the design rationale; per-piece resolution/variety overrides remain future work.

## Recommended experience

Three workspaces: Library, Portrait pieces, and Mosaic studio.

### Library

- Register multiple directories simultaneously. Each has a stable group ID, editable name, path, photo count, and selected-photo count.
- Show All groups plus filters for individual groups. Adding or scanning one group must not deactivate another group's photos.
- Keep existing crop, rotation, conversion, and selection metadata attached to the photo identity. A photo discovered in overlapping directories has one crop and can belong to both groups without appearing twice in a matching pool.
- Scan each group independently; retain missing-photo metadata for restoration. A temporarily unavailable directory is shown as unavailable, rather than treated as an empty directory.
- Removing a group only unregisters it. It never deletes originals or the saved photo corrections.

### Portrait pieces

- Large zoomable portrait canvas and a list of named pieces, such as Face, Suit, and Background, each with a colored overlay.
- Create a piece, click inside it for a suggested selection, use exclusion clicks or a box to clarify the intended boundary, then refine with an ordinary add/erase brush.
- Offer undo/redo, brush size, overlay visibility, rename, and delete. Smart suggestions must not silently overwrite manual corrections; accepting a suggestion is a reversible action.
- Background can initially be the complement of the selected pieces. Unassigned pixels always have a visible setting, defaulting to Keep original.
- Pieces have a clear priority order for overlap. The preview shows effective coverage after higher-priority pieces take precedence, so two pieces never unintentionally mosaic the same pixels.
- Save masks, prompts, and names locally for each portrait, independently of tile resolution. Returning to a portrait restores its pieces. Replacing the source image detects a changed signature and asks to reset or deliberately reuse the existing masks.
- The current automatic person mask can seed Person and Background pieces. It does not by itself distinguish Face from Suit.

### Mosaic studio

| Piece | Rendering | Eligible groups |
| --- | --- | --- |
| Face | Mosaic | Close family |
| Suit | Mosaic | Friends, Extended family |
| Background | Keep original | — |

Each piece chooses Mosaic or Keep original and one or more photo groups. Use shared resolution, variety, and color blend initially, with optional per-piece overrides as a later extension. One aligned tile grid keeps adjoining pieces consistent; each piece's tiles are clipped to its mask, including boundary tiles.

Show unique photos used and placement counts per piece, per group, and for the overall portrait. Combined unique counts deduplicate shared photos. A tiled piece with no eligible selected photos must show a specific error rather than borrow from other groups silently.

At 100% variety, balance individual photo placements within each piece's eligible pool. Selecting multiple groups forms a deduplicated union; it does not imply equal group quotas. Smaller groups would otherwise receive disproportionate reuse. Global balancing across pieces is a separate, more complex allocation problem and should not be promised by this first version.

## Selection tools investigated

| Tool | Relevant capability | Assessment for this app |
| --- | --- | --- |
| [MobileSAM](https://github.com/ChaoningZhang/MobileSAM) | Lightweight SAM-compatible point/box prompts, cached image embedding, optional ONNX export | First candidate to benchmark locally. Upstream provides a CPU demo and describes a 9.66M-parameter pipeline. Actual latency and portrait-part quality on this Mac are unmeasured. |
| [SAM 2.1](https://github.com/facebookresearch/sam2) | Point, box, and iterative mask prompts | Second candidate if MobileSAM selects whole people instead of useful parts. Official installation targets Linux/CUDA, though CUDA postprocessing can be skipped; Mac installation and runtime need a separate trial. |
| [OpenCV GrabCut](https://docs.opencv.org/4.13.0/d8/d83/tutorial_py_grabcut.html) | Rectangle initialization and foreground/background brush labels | Practical local brush-based alternative, no downloaded model. Color-driven separation may need substantial corrections where clothing and background look similar. OpenCV is already installed here. |
| [SAM 3](https://github.com/facebookresearch/sam3) | Text and visual concept prompts | Interesting future option for naming pieces, but upstream currently specifies Python 3.12+, PyTorch 2.7+, a CUDA GPU, and gated checkpoint access. These do not fit the current Python 3.10 Mac setup without additional work. |
| Existing U²-Net person mask | Person/background split | Reuse as a starting selection, rather than the general piece-selection engine. |

The [MobileSAM predictor](https://github.com/ChaoningZhang/MobileSAM/blob/master/mobile_sam/predictor.py) computes an image embedding once and supports repeated prompts. This suggests a responsive click-refine workflow after initial portrait preparation; it does not establish real latency on our hardware. A Photoshop-like brush could sample strokes into positive/negative prompts, but mask predictions should run after a stroke or debounce, not on every pointer movement. Ordinary brush painting stays immediate.

The [official SAM browser demo](https://github.com/facebookresearch/segment-anything/blob/main/demo/README.md) runs its decoder in-browser using precomputed embeddings. Browser-only processing is possible, but that demo does not eliminate the image-encoding step. A local Python worker is the simpler first integration with this application. Model weights are downloaded during explicit setup only; portrait data and inference stay local.

Observed machine: Apple M3, 16 GB RAM, arm64; current environment has Python 3.10, OpenCV and ONNX Runtime, but no PyTorch, MobileSAM, or SAM 2. The initial research pass did not install or benchmark models. A subsequent implementation trial installed MobileSAM locally and measured 0.48 seconds for image embedding and about 0.03 seconds per prompt on CPU, excluding initial imports. Head/neck and jacket selections were visually usable starting points. Inference was also verified with socket connections blocked.

## Implementation design

- `groups(id, name, path, status)` and `group_photos(group_id, photo_id, present)` replace the global active-folder model. File identities and existing edits remain in `photos`.
- Portrait projects use stable IDs and source signatures. `pieces(id, portrait_id, name, order, mode, mask_revision)` plus piece/group assignments hold the editing and rendering configuration. Store mask rasters under ignored local application data, not Git.
- Migrate the current active folder into one named group without altering saved crops. Register previously used folders on demand; do not infer historical groups from parent paths because existing scans include nested directories.
- Run selection in a bounded worker with a cached embedding keyed by portrait signature, model version, and preprocessing. Use request revisions so stale predictions cannot replace newer edits. Saved masks remain usable without the model installed.
- The matching endpoint computes effective piece coverage and matches each piece only against its assigned eligible photos, using coverage-weighted portrait colors at the edges. Cache unaffected pieces when another piece's groups change.
- Canvas renders the original portrait once, then composites masked mosaic layers over it. Preview and export share the same clipping rules. Count only visible tile placements, including partially visible boundary tiles.
- Keep database migrations additive and back up local metadata before migration. Photos and conversion caches stay local throughout.

## Suggested implementation sequence

1. Build named directory groups with a tested migration and independent rescans.
2. Trial MobileSAM separately on the actual portrait: select Face and Suit with inclusion/exclusion clicks and boxes. Measure cold preparation, subsequent prompt latency, memory, and the manual corrections required. Compare SAM 2.1 or GrabCut if needed before choosing the engine.
3. Review that selection experience with the user, then implement persistent pieces with manual add/erase and undo/redo.
4. Add per-piece group assignment, clipped rendering/export, and usage reports.

Acceptance checks include switching and rescanning groups without losing corrections, overlapping-directory deduplication, missing-folder recovery, portrait-specific mask restoration, deterministic overlap handling, original pixels retained in untiled areas, no cross-group matching, balanced 100% usage per piece, and no inference network requests.
