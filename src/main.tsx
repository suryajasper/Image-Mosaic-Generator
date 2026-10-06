import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Grid2X2,
  Images,
  ShieldCheck,
  FolderOpen,
  ArrowRight,
  Check,
  X,
  RotateCw,
  Minus,
  Plus,
  Download,
  RefreshCw,
  ImagePlus,
  SlidersHorizontal,
  Search,
  Heart,
  Maximize,
  Minimize,
} from "lucide-react";
import "./style.css";
import { api } from "./api";
import { drawPieceTreatment, type RenderTreatment } from "./piece-effects";
import { PieceSettings, type TuningProject } from "./PieceSettings";
import { PieceEditor } from "./PieceEditor";
import { cropDragUpdate } from "./crop-drag";
import {
  attachCanvasGestures,
  MIN_CANVAS_ZOOM,
  stepCanvasZoom,
} from "./canvas-gestures";

type Photo = {
  id: string;
  name: string;
  path: string;
  selected: number;
  rotation: number;
  x: number;
  y: number;
  size: number;
  revision: number;
  groups: string[];
};
type Group = {
  id: string;
  name: string;
  path: string;
  status: string;
  photoCount: number;
  selectedCount: number;
};
type Library = {
  groups: Group[];
  photos: Photo[];
  folder: string;
  target: string | null;
  foreground: boolean;
  mosaicRegion: "all" | "foreground" | "background";
  backgroundReady: boolean;
  backgroundAvailable: boolean;
};
type Scan = {
  unavailable?: boolean;
  imported: number;
  skipped: string[];
  needsConversion?: string[];
  options?: { id: string; name: string; path: string }[];
};
type Mosaic = {
  columns: number;
  rows: number;
  aspectRatio?: number;
  ids: string[];
  revisions: number[];
  tiles: number[];
  colors: number[][];
  counts: number[];
  maskUrl: string | null;
  backgroundUrl: string | null;
  activeTiles: number;
  layers?: {
    treatment?: RenderTreatment | null;
    id: string;
    name: string;
    maskUrl: string;
    columns: number;
    rows: number;
    variety: number;
    blend: number;
    tiles: number[];
    colors: number[][];
    counts: number[];
    activeTiles: number;
  }[];
  pieceUsage?: {
    id: string;
    name: string;
    used: number;
    eligible: number;
    activeTiles: number;
  }[];
  groupUsage?: {
    id: string;
    name: string;
    used: number;
    eligible: number;
    placements: number;
  }[];
  mosaicRegion: "all" | "foreground" | "background" | "pieces";
};
const photoURL = (p: Photo) => `/api/photos/${p.id}/image?v=${p.revision}`;
const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new Error("A photo could not be loaded. Check your local folder."),
      );
    img.src = url;
  });

function CropEditor({
  photo,
  onClose,
  onSave,
  previewPixels,
  onPreviewPixelsChange,
}: {
  photo: Photo;
  onClose: () => void;
  onSave: (p: Photo) => Promise<void>;
  previewPixels: number;
  onPreviewPixelsChange: (pixels: number) => void;
}) {
  const [draft, setDraft] = useState({ ...photo });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const stage = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 560, height: 440 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const rotatedSource = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );
  useEffect(() => {
    loadImage(`/api/photos/${photo.id}/image?original=1&v=${photo.revision}`)
      .then(setImage)
      .catch((e) => setError(e.message));
  }, [photo]);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setBounds({
        width: entry.contentRect.width - 20,
        height: entry.contentRect.height - 20,
      }),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onClose]);
  // Original endpoint applies the saved rotation; undo it before applying the draft rotation.
  const turns = (draft.rotation - photo.rotation + 360) % 360;
  const w = image ? (turns % 180 ? image.height : image.width) : 1,
    h = image ? (turns % 180 ? image.width : image.height) : 1;
  const scale = Math.min(bounds.width / w, bounds.height / h),
    cw = w * scale,
    ch = h * scale,
    side = Math.min(cw, ch) * draft.size,
    left = (cw - side) * draft.x,
    top = (ch - side) * draft.y;
  useEffect(() => {
    if (!image || !canvas.current) return;
    const c = canvas.current;
    c.width = Math.round(cw);
    c.height = Math.round(ch);
    const ctx = c.getContext("2d")!;
    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((turns * Math.PI) / 180);
    ctx.drawImage(
      image,
      (-image.width * scale) / 2,
      (-image.height * scale) / 2,
      image.width * scale,
      image.height * scale,
    );
    ctx.restore();
  }, [image, cw, ch, turns, scale]);
  // Sample from the decoded photo rather than the smaller on-screen cropper.
  useEffect(() => {
    if (!image) return;
    const source = document.createElement("canvas");
    source.width = w;
    source.height = h;
    const context = source.getContext("2d")!;
    context.translate(w / 2, h / 2);
    context.rotate((turns * Math.PI) / 180);
    context.drawImage(image, -image.width / 2, -image.height / 2);
    rotatedSource.current = source;
  }, [image, turns, w, h]);
  useEffect(() => {
    const source = rotatedSource.current;
    const preview = previewCanvas.current;
    if (!image || !source || !preview) return;
    preview.width = previewPixels;
    preview.height = previewPixels;
    const cropSide = Math.min(w, h) * draft.size;
    const context = preview.getContext("2d")!;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      source,
      (w - cropSide) * draft.x,
      (h - cropSide) * draft.y,
      cropSide,
      cropSide,
      0,
      0,
      previewPixels,
      previewPixels,
    );
  }, [image, turns, w, h, draft.x, draft.y, draft.size, previewPixels]);
  function move(e: React.PointerEvent) {
    const start = drag.current;
    if (!start) return;
    setDraft(cropDragUpdate(start, e.clientX, e.clientY, cw - side, ch - side));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal crop-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Adjust photo crop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start">
          <div>
            <span className="eyebrow">MAKE ROOM FOR THE MEMORY</span>
            <h2>Adjust your photo</h2>
            <p className="muted truncate max-w-80">{photo.name}</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close editor"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="crop-editor-layout">
          <div>
            <div className="crop-stage" ref={stage}>
              <div className="crop-image" style={{ width: cw, height: ch }}>
                <canvas ref={canvas} />
                {image && (
                  <div
                    className="crop-square"
                    style={{ left, top, width: side, height: side }}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      drag.current = {
                        x: draft.x,
                        y: draft.y,
                        px: e.clientX,
                        py: e.clientY,
                      };
                    }}
                    onPointerMove={move}
                    onPointerUp={() => (drag.current = null)}
                    onPointerCancel={() => (drag.current = null)}
                    onLostPointerCapture={() => (drag.current = null)}
                  >
                    <div className="crop-grid" />
                  </div>
                )}
              </div>
            </div>
            <p className="muted text-sm text-center">
              Drag the square to frame the faces you want to keep.
            </p>
            <div className="flex gap-4 items-center my-6">
              <button
                className="secondary"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    rotation: (d.rotation + 90) % 360,
                    x: 0.5,
                    y: 0.5,
                  }))
                }
              >
                <RotateCw size={16} /> Rotate 90°
              </button>
              <label className="flex-1 text-sm">
                Crop size
                <input
                  aria-label="Crop size"
                  type="range"
                  min="0.05"
                  max="1"
                  step=".01"
                  value={draft.size}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, size: +e.target.value }))
                  }
                />
              </label>
            </div>
          </div>
          <aside className="crop-resolution-preview">
            <span className="eyebrow">POSTER DETAIL PREVIEW</span>
            <h3>Your cropped photo</h3>
            <div className="crop-preview-frame">
              <canvas
                ref={previewCanvas}
                aria-label={`Cropped photo preview at ${previewPixels} by ${previewPixels} pixels`}
              />
            </div>
            <div className="preview-pixel-count" aria-live="polite">
              {previewPixels} × {previewPixels} pixels
            </div>
            <label
              className="slider-label mt-5"
              htmlFor="crop-preview-resolution"
            >
              Preview resolution
            </label>
            <input
              id="crop-preview-resolution"
              aria-label="Crop preview resolution"
              type="range"
              min="16"
              max="256"
              step="1"
              value={previewPixels}
              onChange={(e) => onPreviewPixelsChange(Number(e.target.value))}
            />
            <div className="range-ends">
              <span>16 px</span>
              <span>256 px</span>
            </div>
          </aside>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="flex justify-between">
          <button
            className="text-button"
            onClick={() =>
              setDraft({ ...photo, rotation: 0, x: 0.5, y: 0.5, size: 1 })
            }
          >
            Reset crop
          </button>
          <button
            className="primary"
            disabled={saving || !image}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(draft);
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save photo"}
            <Check size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}

function App() {
  const [library, setLibrary] = useState<Library>({
    photos: [],
    groups: [],
    folder: "",
    target: null,
    foreground: false,
    mosaicRegion: "all",
    backgroundReady: false,
    backgroundAvailable: false,
  });
  const [page, setPage] = useState<"photos" | "pieces" | "mosaic">("photos");
  const [groupFilter, setGroupFilter] = useState("all");
  const [groupName, setGroupName] = useState("");
  const [tuningProject, setTuningProject] = useState<TuningProject | null>(
    null,
  );
  const [hasPieces, setHasPieces] = useState(false);
  const [pieceDirty, setPieceDirty] = useState(false);
  const [pendingPage, setPendingPage] = useState<
    "photos" | "pieces" | "mosaic" | null
  >(null);
  function goToPage(next: "photos" | "pieces" | "mosaic") {
    if (page === "pieces" && pieceDirty && next !== "pieces")
      setPendingPage(next);
    else setPage(next);
  }
  const [folder, setFolder] = useState("");
  const [target, setTarget] = useState("");
  const [portraitFolder, setPortraitFolder] = useState("");
  const [portraitOptions, setPortraitOptions] = useState<
    { id: string; name: string; path: string }[]
  >([]);
  const [conversion, setConversion] = useState<{
    path: string;
    endpoint: string;
    files: string[];
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Photo | null>(null);
  const [cropPreviewPixels, setCropPreviewPixels] = useState(() => {
    try {
      const stored = Number(
        localStorage.getItem("memory-mosaic.crop-preview-pixels"),
      );
      return Number.isInteger(stored) && stored >= 16 && stored <= 256
        ? stored
        : 120;
    } catch {
      return 120;
    }
  });
  function changeCropPreviewPixels(pixels: number) {
    setCropPreviewPixels(pixels);
    try {
      localStorage.setItem("memory-mosaic.crop-preview-pixels", String(pixels));
    } catch {
      /* Still shared across photos in this session. */
    }
  }

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [columns, setColumns] = useState(60);
  const [variety, setVariety] = useState(0.35);
  const [tint, setTint] = useState(0.2);
  const [seed, setSeed] = useState(42);
  const [mosaic, setMosaic] = useState<Mosaic | null>(null);
  const [generating, setGenerating] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [exportSize, setExportSize] = useState(6000);
  const [exporting, setExporting] = useState(false);
  const [preparingBackground, setPreparingBackground] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [savedExport, setSavedExport] = useState<string | null>(null);
  const [targetVersion, setTargetVersion] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const images = useRef<Map<string, HTMLImageElement>>(new Map());
  const sharpImages = useRef(new Map<string, Promise<void>>());
  const requestVersion = useRef(0);
  const [previewWidth, setPreviewWidth] = useState(1200);
  const viewport = useRef<HTMLDivElement>(null);
  const previewCard = useRef<HTMLElement>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  useEffect(() => {
    if (page !== "mosaic" || !viewport.current) return;
    return attachCanvasGestures(
      viewport.current,
      (factor) =>
        setZoom((z) => Math.max(MIN_CANVAS_ZOOM, Math.min(8, z * factor))),
      !!mosaic,
    );
  }, [page, !!mosaic]);
  useEffect(() => {
    const change = () =>
      setIsFullScreen(document.fullscreenElement === previewCard.current);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullScreen(false);
    };
    document.addEventListener("fullscreenchange", change);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("fullscreenchange", change);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (!isFullScreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isFullScreen]);
  async function toggleFullScreen() {
    if (isFullScreen) {
      if (document.fullscreenElement === previewCard.current)
        await document.exitFullscreen().catch(() => {});
      setIsFullScreen(false);
    } else {
      // Embedded browsers may decline native fullscreen; keep an app-wide fallback.
      try {
        await previewCard.current?.requestFullscreen();
      } catch {
        /* Use overlay below. */
      }
      setIsFullScreen(true);
    }
  }
  async function refresh() {
    const lib = await api<Library>("/library");
    setLibrary(lib);
    if (lib.folder) setFolder(lib.folder);
    setTarget(lib.target || "");
    if (lib.target) {
      const project = await api<TuningProject>("/project");
      setTuningProject(project);
      setHasPieces(!!project.enabled);
    } else {
      setHasPieces(false);
      setTuningProject(null);
    }
    if (lib.target)
      setPortraitFolder(
        (previous) =>
          previous || lib.target!.slice(0, lib.target!.lastIndexOf("/")),
      );
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function scan(
    path: string,
    endpoint = "/import",
    convert = false,
    skipHeic = false,
  ) {
    const result = await api<Scan>(endpoint, "POST", {
      path,
      convert,
      skipHeic,
      name: endpoint === "/import" ? groupName || undefined : undefined,
    });
    if (result.needsConversion) {
      setConversion({ path, endpoint, files: result.needsConversion });
      return false;
    }
    if (endpoint === "/portraits") {
      setPortraitOptions(result.options || []);
      setNotice(
        `Found ${result.options?.length || 0} portrait options.${result.skipped.length ? " Some unreadable photos were skipped." : ""}`,
      );
    } else {
      await refresh();
      setNotice(
        `Group updated: ${result.imported} photos.${result.unavailable ? " Folder unavailable; saved edits are retained." : ""}${result.skipped.length ? " Skipped unreadable files: " + result.skipped.join(", ") : ""}`,
      );
    }
    return true;
  }
  async function choosePortrait(path: string) {
    const result = await api<{ needsConversion?: string[] }>(
      "/target",
      "POST",
      { path },
    );
    if (result.needsConversion) {
      setConversion({
        path,
        endpoint: "/target",
        files: result.needsConversion,
      });
      return;
    }
    setTargetVersion((v) => v + 1);
    await refresh();
    setNotice("Main portrait updated.");
  }
  // Rescan saved folder on return to the app. Unchanged files require only a stat check.
  useEffect(() => {
    const rescan = () => {
      if (
        library.groups.length &&
        !busy &&
        !conversion &&
        !editing &&
        page === "photos"
      )
        action(async () => {
          for (const group of library.groups) {
            if (!(await scan(group.path))) break;
          }
        });
    };
    window.addEventListener("focus", rescan);
    return () => window.removeEventListener("focus", rescan);
  }, [library.groups, busy, conversion, editing, page]);
  const selected = library.photos.filter((p) => p.selected);
  const groupPhotos = library.photos.filter(
    (p) => groupFilter === "all" || p.groups.includes(groupFilter),
  );
  const groupSelected = groupPhotos.filter((p) => p.selected);
  const shown = groupPhotos.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" || (filter === "selected" ? p.selected : !p.selected)),
  );
  async function savePhoto(p: Photo) {
    await api("/photos/" + p.id, "PATCH", p);
    await refresh();
  }
  useEffect(() => {
    if (page !== "mosaic") return;
    const version = ++requestVersion.current;
    setMosaic(null);
    setSavedExport(null);
    if ((!selected.length && !hasPieces) || !library.target) {
      setGenerating(false);
      return;
    }
    setGenerating(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api<Mosaic>("/mosaic", "POST", {
          columns,
          variety,
          blend: tint,
          seed,
        });
        await Promise.all(
          (result.layers || []).map(async (layer) => {
            if (
              layer.treatment &&
              !images.current.has(layer.treatment.alphaUrl)
            )
              images.current.set(
                layer.treatment.alphaUrl,
                await loadImage(layer.treatment.alphaUrl),
              );
            if (!images.current.has(layer.maskUrl))
              images.current.set(layer.maskUrl, await loadImage(layer.maskUrl));
          }),
        );
        if (result.maskUrl && !images.current.has(result.maskUrl)) {
          images.current.set(result.maskUrl, await loadImage(result.maskUrl));
        }
        if (result.backgroundUrl && !images.current.has(result.backgroundUrl)) {
          images.current.set(
            result.backgroundUrl,
            await loadImage(result.backgroundUrl),
          );
        }
        await Promise.all(
          result.ids
            .filter((_, i) => result.counts[i] > 0)
            .map(async (id) => {
              const i = result.ids.indexOf(id),
                key = id + ":" + result.revisions[i];
              if (!images.current.has(key))
                images.current.set(
                  key,
                  await loadImage(
                    `/api/photos/${id}/image?v=${result.revisions[i]}`,
                  ),
                );
            }),
        );
        if (version === requestVersion.current) {
          setMosaic(result);
          setError("");
        }
      } catch (e) {
        if (version === requestVersion.current) setError((e as Error).message);
      } finally {
        if (version === requestVersion.current) setGenerating(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      requestVersion.current++;
    };
  }, [
    page,
    library,
    columns,
    variety,
    seed,
    hasPieces,
    hasPieces ? tint : null,
  ]);
  function draw(c: HTMLCanvasElement, m: Mosaic, width: number) {
    c.width = width;
    c.height = Math.round(width * (m.aspectRatio ?? m.rows / m.columns));
    const ctx = c.getContext("2d")!;
    const drawTiles = (
      context: CanvasRenderingContext2D,
      tiles: number[],
      colors: number[][],
      across = m.columns,
      blend = tint,
    ) => {
      const cell = width / across;
      tiles.forEach((index, i) => {
        if (index < 0) return;
        const x = (i % across) * cell,
          y = Math.floor(i / across) * cell,
          img = images.current.get(m.ids[index] + ":" + m.revisions[index]);
        if (img) context.drawImage(img, x, y, cell + 0.5, cell + 0.5);
        if (blend > 0) {
          context.fillStyle = `rgba(${colors[i].join(",")},${blend})`;
          context.fillRect(x, y, cell + 0.5, cell + 0.5);
        }
      });
    };
    if (m.layers) {
      const original = m.backgroundUrl && images.current.get(m.backgroundUrl);
      if (!original)
        throw new Error("The original portrait could not be loaded.");
      ctx.drawImage(original, 0, 0, c.width, c.height);
      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = c.width;
      layerCanvas.height = c.height;
      const layerContext = layerCanvas.getContext("2d")!;
      for (const layer of m.layers) {
        layerContext.clearRect(0, 0, c.width, c.height);
        drawTiles(
          layerContext,
          layer.tiles,
          layer.colors,
          layer.columns,
          layer.blend,
        );
        drawPieceTreatment(
          layerContext,
          layer.treatment,
          original,
          images.current,
        );
        const mask = images.current.get(layer.maskUrl);
        if (!mask)
          throw new Error("A portrait-piece mask could not be loaded.");
        layerContext.globalCompositeOperation = "destination-in";
        layerContext.drawImage(mask, 0, 0, c.width, c.height);
        layerContext.globalCompositeOperation = "source-over";
        ctx.drawImage(layerCanvas, 0, 0);
      }
      return;
    }
    drawTiles(ctx, m.tiles, m.colors);
    if (m.maskUrl) {
      const mask = images.current.get(m.maskUrl);
      if (!mask) throw new Error("The foreground mask could not be loaded.");
      ctx.globalCompositeOperation =
        m.mosaicRegion === "background" ? "destination-out" : "destination-in";
      ctx.drawImage(mask, 0, 0, c.width, c.height);
      const background = m.backgroundUrl && images.current.get(m.backgroundUrl);
      if (!background)
        throw new Error(
          "The original portrait background could not be loaded.",
        );
      ctx.globalCompositeOperation = "destination-over";
      ctx.drawImage(background, 0, 0, c.width, c.height);
      ctx.globalCompositeOperation = "source-over";
    }
  }
  useEffect(() => {
    if (page !== "mosaic" || !viewport.current) return;
    const element = viewport.current;
    const observer = new ResizeObserver(() =>
      setPreviewWidth(element.clientWidth),
    );
    observer.observe(element);
    setPreviewWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [page]);
  function renderWidth(m: Mosaic, requested: number) {
    const aspect = m.aspectRatio ?? m.rows / m.columns;
    return Math.max(
      1,
      Math.floor(Math.min(requested, 8192, Math.sqrt(24_000_000 / aspect))),
    );
  }
  async function sharpenTiles(m: Mosaic, width: number) {
    const across = Math.min(
      m.columns,
      ...(m.layers || []).map((layer) => layer.columns),
    );
    const pixels = width / across;
    const size = pixels > 512 ? 1024 : pixels > 256 ? 512 : 256;
    if (size === 256) return;
    const pending = m.ids
      .map((id, i) => ({ id, i }))
      .filter(
        ({ id, i }) =>
          m.counts[i] > 0 &&
          (images.current.get(id + ":" + m.revisions[i])?.width ?? 0) < size,
      );
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(6, pending.length) }, async () => {
        while (next < pending.length) {
          const { id, i } = pending[next++];
          const key = id + ":" + m.revisions[i];
          const requestKey = key + ":" + size;
          if (!sharpImages.current.has(requestKey)) {
            const promise = loadImage(
              `/api/photos/${id}/image?v=${m.revisions[i]}&size=${size}`,
            )
              .then((image) => {
                if (image.width > (images.current.get(key)?.width ?? 0))
                  images.current.set(key, image);
              })
              .catch((error) => {
                sharpImages.current.delete(requestKey);
                throw error;
              });
            sharpImages.current.set(requestKey, promise);
          }
          await sharpImages.current.get(requestKey);
        }
      }),
    );
  }
  useEffect(() => {
    if (!mosaic || !canvas.current) return;
    const width = renderWidth(
      mosaic,
      previewWidth * zoom * Math.min(window.devicePixelRatio || 1, 2),
    );
    draw(canvas.current, mosaic, width);
    let cancelled = false;
    const timer = setTimeout(() => {
      sharpenTiles(mosaic, width)
        .then(() => {
          if (!cancelled && canvas.current) draw(canvas.current, mosaic, width);
        })
        .catch((e) => {
          if (!cancelled) setError((e as Error).message);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mosaic, tint, zoom, previewWidth]);
  const used = mosaic?.counts.filter((n) => n > 0).length || 0;
  const percent = mosaic?.ids.length
    ? Math.round((used / mosaic.ids.length) * 100)
    : 0;
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-icon">
            <Grid2X2 size={22} />
          </span>
          <span>
            memory<span className="brand-light">mosaic</span>
          </span>
        </a>
        <div className="sidebar-label">YOUR WORKSPACE</div>
        <nav>
          <button
            className={page === "photos" ? "active" : ""}
            onClick={() => goToPage("photos")}
          >
            <Images size={19} />
            Photo library
            <span className="nav-count">{library.photos.length}</span>
          </button>
          <button
            className={page === "pieces" ? "active" : ""}
            onClick={() => goToPage("pieces")}
          >
            <SlidersHorizontal size={19} /> Portrait pieces
          </button>
          <button
            className={page === "mosaic" ? "active" : ""}
            onClick={() => goToPage("mosaic")}
          >
            <Grid2X2 size={19} />
            Mosaic studio
          </button>
        </nav>
        <div className="sidebar-note">
          <Heart size={21} strokeWidth={1.4} />
          <p>
            A life, made of
            <br />
            little moments.
          </p>
          <span>Bring them together.</span>
        </div>
        <div className="privacy">
          <ShieldCheck size={18} />
          <div>
            <strong>Just on your computer</strong>
            <p>No uploads. No cloud.</p>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {page === "photos"
                ? "Photo library"
                : page === "pieces"
                  ? "Portrait pieces"
                  : "Mosaic studio"}
            </strong>
          </div>
          <span className="local-badge">
            <span /> LOCAL & PRIVATE
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === "photos"
                  ? "EVERY PHOTO, A MEMORY"
                  : page === "pieces"
                    ? "CHOOSE WHAT EACH PIECE TELLS"
                    : "SMALL MOMENTS. ONE BEAUTIFUL PICTURE."}
              </span>
              <h1>
                {page === "photos"
                  ? "Your collection of moments"
                  : page === "pieces"
                    ? "A portrait, piece by piece"
                    : "Bring the memories together"}
              </h1>
              <p>
                {page === "photos"
                  ? "Choose the photos that tell his story. Make each little moment count."
                  : page === "pieces"
                    ? "Select named pieces and choose the memories for each one."
                    : "Build a portrait from the people, places, and moments that made a life."}
              </p>
            </div>
            {page === "photos" && (
              <button className="primary" onClick={() => goToPage("mosaic")}>
                Open mosaic studio <ArrowRight size={17} />
              </button>
            )}
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert" role="status">
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "photos" ? (
            <>
              <section className="folder-card">
                <div className="folder-symbol">
                  <FolderOpen size={26} strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <h3>Add a photo group</h3>
                  <p>
                    Photos stay where they are. We only remember your selections
                    and crops.
                  </p>
                  <form
                    className="path-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      action(async () => {
                        await scan(folder);
                      });
                    }}
                  >
                    <input
                      aria-label="New group name"
                      placeholder="Group name (optional)"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      className="group-name-input"
                    />
                    <input
                      aria-label="Local photo folder"
                      placeholder="/Users/you/Pictures/Family memories"
                      value={folder}
                      onChange={(e) => setFolder(e.target.value)}
                    />
                    <button className="secondary" disabled={busy || !folder}>
                      <FolderOpen size={16} />
                      {busy ? "Reading folder…" : "Add / scan group"}
                    </button>
                  </form>
                  <small>
                    JPG, PNG & local HEIC conversion · Includes subfolders ·
                    Paste a local folder path
                  </small>
                </div>
              </section>
              <section className="group-manager" aria-label="Photo groups">
                <button
                  className={
                    groupFilter === "all" ? "group-all active" : "group-all"
                  }
                  onClick={() => setGroupFilter("all")}
                >
                  <Images size={17} /> All groups{" "}
                  <strong>{library.groups.length}</strong>
                </button>
                <div className="group-cards">
                  {library.groups.map((group) => (
                    <article
                      key={group.id}
                      className={
                        groupFilter === group.id
                          ? "group-card active"
                          : "group-card"
                      }
                    >
                      <button
                        className="group-select"
                        onClick={() => setGroupFilter(group.id)}
                        aria-label={"Show group " + group.name}
                      >
                        <FolderOpen size={19} />
                        {group.name}
                      </button>
                      <input
                        key={group.name}
                        aria-label={"Rename group " + group.name}
                        defaultValue={group.name}
                        onBlur={(e) => {
                          const name = e.target.value.trim();
                          if (name && name !== group.name)
                            action(async () => {
                              await api("/groups/" + group.id, "PATCH", {
                                name,
                              });
                              await refresh();
                            });
                        }}
                      />
                      <small title={group.path}>{group.path}</small>
                      <span>
                        {group.status === "unavailable"
                          ? "Folder unavailable · edits saved"
                          : `${group.photoCount} photos · ${group.selectedCount} selected`}
                      </span>
                      <div className="flex gap-3 mt-2">
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => action(() => scan(group.path))}
                        >
                          <RefreshCw size={13} /> Scan
                        </button>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            action(async () => {
                              await api("/groups/" + group.id, "DELETE");
                              setGroupFilter("all");
                              await refresh();
                              setNotice(
                                "Group removed. Photos and saved corrections are kept; add its folder to restore it.",
                              );
                            })
                          }
                        >
                          Remove group
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <div className="library-summary">
                <div>
                  <strong>{library.photos.length}</strong> photos in your
                  library <span className="divider" />
                  <span className="selected-text">
                    <Check size={14} />
                    {selected.length} selected for your mosaic
                  </span>
                </div>
                <span className="muted text-sm">
                  Click a photo to crop & rotate
                </span>
              </div>
              <div className="library-toolbar">
                <div className="tabs">
                  {[
                    ["all", "All photos"],
                    ["selected", "Selected"],
                    ["excluded", "Excluded"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={filter === value ? "chosen" : ""}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-4">
                  <button
                    className="text-button"
                    disabled={busy || !groupPhotos.length}
                    onClick={() =>
                      action(async () => {
                        await api("/selection", "POST", {
                          selected: groupSelected.length !== groupPhotos.length,
                          ids: groupPhotos.map((p) => p.id),
                        });
                        await refresh();
                      })
                    }
                  >
                    {groupSelected.length === groupPhotos.length &&
                    groupPhotos.length
                      ? "Deselect all"
                      : "Select all"}
                  </button>
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="Search photos"
                      placeholder="Find a photo…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
              </div>
              {!library.photos.length ? (
                <div className="empty-library">
                  <div className="empty-illustration">
                    <span />
                    <span />
                    <span />
                    <Images size={40} strokeWidth={1.2} />
                  </div>
                  <h2>A lifetime of memories starts here</h2>
                  <p>
                    Open a folder of photos of him with your family and friends.
                    <br />
                    Then choose and frame the moments you’d like to include.
                  </p>
                  <span className="empty-step">
                    01 <span>ADD YOUR PHOTOS</span>
                    <ArrowRight size={15} /> 02 <span>CREATE YOUR MOSAIC</span>
                  </span>
                </div>
              ) : (
                <div className="photo-grid">
                  {shown.map((p) => (
                    <article
                      key={p.id}
                      className={`photo-card ${p.selected ? "" : "excluded"}`}
                    >
                      <button
                        className="photo-open"
                        onClick={() => setEditing(p)}
                        aria-label={"Crop " + p.name}
                      >
                        <img src={photoURL(p)} loading="lazy" alt={p.name} />
                        <span className="edit-hover">Adjust crop</span>
                      </button>
                      <button
                        className={
                          "photo-check " + (p.selected ? "checked" : "")
                        }
                        disabled={busy}
                        aria-label={
                          (p.selected ? "Exclude " : "Include ") + p.name
                        }
                        aria-pressed={!!p.selected}
                        onClick={() =>
                          action(() =>
                            savePhoto({ ...p, selected: p.selected ? 0 : 1 }),
                          )
                        }
                      >
                        {!!p.selected && <Check size={15} />}
                      </button>
                      <button
                        className="portrait-choice"
                        onClick={() => action(() => choosePortrait(p.path))}
                        disabled={busy}
                      >
                        Use as portrait
                      </button>
                      <div className="photo-caption">
                        <span title={p.path}>{p.name}</span>
                        {(p.rotation !== 0 ||
                          p.size !== 1 ||
                          p.x !== 0.5 ||
                          p.y !== 0.5) && (
                          <span className="edited-tag">Edited</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {library.photos.length > 0 && !shown.length && (
                <p className="empty-result">No photos match this view.</p>
              )}
              <div className="bottom-note">
                <ShieldCheck size={16} /> Your original photos are always
                preserved. Edits are saved locally and can be changed anytime.
              </div>
            </>
          ) : page === "pieces" ? (
            <PieceEditor
              groups={library.groups}
              target={library.target}
              backgroundReady={library.backgroundReady}
              onChange={refresh}
              onDirtyChange={setPieceDirty}
              defaults={{ columns, variety, blend: tint }}
              onChoosePortrait={() => goToPage("mosaic")}
            />
          ) : (
            <div className="studio">
              <div className="studio-main">
                <section
                  ref={previewCard}
                  className={`preview-card ${isFullScreen ? "is-fullscreen" : ""}`}
                >
                  <div className="preview-header">
                    <span>
                      <Grid2X2 size={17} /> Mosaic preview
                    </span>
                    <span className="muted text-xs">
                      {generating
                        ? "Updating your mosaic…"
                        : mosaic
                          ? mosaic.layers
                            ? `${mosaic.layers.length} mosaiced pieces`
                            : `${mosaic.columns} × ${mosaic.rows} tiles`
                          : "YOUR PORTRAIT, REIMAGINED"}
                    </span>
                  </div>
                  <div className="canvas-viewport" ref={viewport}>
                    {mosaic ? (
                      <div
                        className="canvas-wrap"
                        style={{ width: `${zoom * 100}%` }}
                      >
                        <canvas ref={canvas} />
                      </div>
                    ) : (
                      <div className="preview-empty">
                        <div className="portrait-placeholder">
                          <ImagePlus size={34} strokeWidth={1} />
                        </div>
                        <h2>
                          {generating
                            ? "Gathering your memories…"
                            : "Start with a favorite portrait"}
                        </h2>
                        <p>
                          {generating
                            ? "Matching the colors, making room for every moment."
                            : "Choose the portrait you’d like to recreate.\nYour memory photos will become the little pieces."}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="preview-footer">
                    <span className="muted text-xs">
                      Pinch or scroll to zoom · Drag to explore
                    </span>
                    <div className="zoom-controls">
                      <button
                        aria-label="Zoom out"
                        onClick={() => setZoom((z) => stepCanvasZoom(z, -1, 8))}
                      >
                        <Minus size={16} />
                      </button>
                      <span>{Math.round(zoom * 100)}%</span>
                      <button
                        aria-label="Zoom in"
                        onClick={() => setZoom((z) => stepCanvasZoom(z, 1, 8))}
                      >
                        <Plus size={16} />
                      </button>
                      <button
                        aria-label="Fit preview"
                        onClick={() => {
                          setZoom(1);
                          viewport.current?.scrollTo(0, 0);
                        }}
                      >
                        Fit
                      </button>
                      <button
                        aria-label={
                          isFullScreen
                            ? "Exit full screen"
                            : "Enter full screen"
                        }
                        title={
                          isFullScreen
                            ? "Exit full screen (Esc)"
                            : "Full screen"
                        }
                        onClick={toggleFullScreen}
                      >
                        {isFullScreen ? (
                          <Minimize size={16} />
                        ) : (
                          <Maximize size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                </section>
                <section className="usage-card">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="eyebrow">A PLACE FOR EVERY MEMORY</span>
                      <h3>Photos in this mosaic</h3>
                    </div>
                    <span className="usage-number">
                      {mosaic ? used : "—"}{" "}
                      <small>/ {mosaic?.ids.length ?? selected.length}</small>
                    </span>
                  </div>
                  <div className="usage-bar">
                    <div style={{ width: percent + "%" }} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="muted">
                      {mosaic
                        ? `${percent}% of selected photos appear in the mosaic`
                        : "Usage updates as you tune your mosaic"}
                    </span>
                    <strong className="selected-text">
                      {mosaic
                        ? `${mosaic.activeTiles.toLocaleString()} ${mosaic.maskUrl ? mosaic.mosaicRegion + " " : ""}${mosaic.layers ? "placements" : "tiles"}`
                        : ""}
                    </strong>
                  </div>
                  {mosaic?.pieceUsage && (
                    <div className="piece-usage">
                      <h4>By portrait piece</h4>
                      {mosaic.pieceUsage.map((item) => (
                        <div key={item.id}>
                          <strong>{item.name}</strong>
                          <span>
                            {item.used} / {item.eligible} photos ·{" "}
                            {item.activeTiles} tiles
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {mosaic?.groupUsage && (
                    <div className="piece-usage">
                      <h4>By photo group</h4>
                      {mosaic.groupUsage.map((item) => (
                        <div key={item.id}>
                          <strong>{item.name}</strong>
                          <span>
                            {item.used} / {item.eligible} photos ·{" "}
                            {item.placements} placements
                          </span>
                        </div>
                      ))}
                      <small>
                        Photos in overlapping groups appear in both group
                        totals.
                      </small>
                    </div>
                  )}
                  {mosaic && (
                    <>
                      <p className="muted text-xs mt-5 mb-3">
                        Each photo’s actual tile count. Faded photos haven’t
                        been used. Click to adjust a crop.
                      </p>
                      <div className="usage-photos">
                        {mosaic.ids.map((id, i) => {
                          const p = library.photos.find((p) => p.id === id)!;
                          return (
                            <button
                              key={id}
                              title={`${p.name}: ${mosaic.counts[i]} tiles`}
                              className={mosaic.counts[i] ? "" : "unused"}
                              onClick={() => setEditing(p)}
                            >
                              <img
                                src={photoURL(p)}
                                alt={p.name}
                                loading="lazy"
                              />
                              <span>{mosaic.counts[i]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </section>
              </div>
              <aside className="studio-controls">
                {hasPieces && tuningProject && (
                  <section className="control-card piece-studio-controls">
                    <h3>
                      <SlidersHorizontal size={18} />
                      Piece settings
                    </h3>
                    {tuningProject.pieces
                      .filter((piece) => piece.mode === "mosaic")
                      .map((piece, index) => (
                        <details
                          className="piece-studio-setting"
                          key={piece.id}
                          open={index === 0}
                        >
                          <summary>{piece.name}</summary>
                          <PieceSettings
                            sources={tuningProject.pieces}
                            name={piece.name}
                            settings={piece}
                            defaults={{ columns, variety, blend: tint }}
                            onSave={async (settings) => {
                              await api("/pieces/" + piece.id, "PATCH", {
                                projectId: tuningProject.id,
                                ...settings,
                              });
                              await refresh();
                            }}
                          />
                        </details>
                      ))}
                    {tuningProject.remainder_mode === "mosaic" && (
                      <details
                        className="piece-studio-setting"
                        open={
                          !tuningProject.pieces.some(
                            (piece) => piece.mode === "mosaic",
                          )
                        }
                      >
                        <summary>Everything else</summary>
                        <PieceSettings
                          sources={tuningProject.pieces}
                          name="Everything else"
                          settings={{
                            columns: tuningProject.remainder_columns,
                            variety: tuningProject.remainder_variety,
                            blend: tuningProject.remainder_blend,
                            effect: tuningProject.remainder_effect,
                          }}
                          defaults={{ columns, variety, blend: tint }}
                          onSave={async (settings) => {
                            await api("/project/options", "POST", {
                              projectId: tuningProject.id,
                              ...settings,
                            });
                            await refresh();
                          }}
                        />
                      </details>
                    )}
                  </section>
                )}
                <section className="control-card">
                  <h3>
                    <ImagePlus size={18} />
                    The main portrait
                  </h3>
                  {library.target && (
                    <img
                      className="target-preview"
                      src={"/api/target/image?v=" + targetVersion + ""}
                      alt="Main portrait"
                    />
                  )}
                  <button
                    className="secondary w-full justify-center mb-4"
                    onClick={() => goToPage("pieces")}
                  >
                    <SlidersHorizontal size={16} />
                    {hasPieces
                      ? "Edit portrait pieces"
                      : "Split into portrait pieces"}
                  </button>
                  {hasPieces && (
                    <p className="control-tip mb-4">
                      Your named pieces control mosaic areas and photo groups.
                    </p>
                  )}
                  {!hasPieces && (
                    <div className="foreground-control">
                      <label
                        className="block text-sm font-medium mb-2"
                        htmlFor="mosaic-region"
                      >
                        Mosaic area
                      </label>
                      <select
                        id="mosaic-region"
                        className="w-full"
                        value={library.mosaicRegion}
                        disabled={busy || generating || !library.target}
                        onChange={(e) => {
                          const mosaicRegion = e.target.value;
                          action(async () => {
                            await api("/target/options", "POST", {
                              mosaicRegion,
                            });
                            await refresh();
                          });
                        }}
                      >
                        <option value="all">Whole portrait</option>
                        <option
                          value="foreground"
                          disabled={!library.backgroundReady}
                        >
                          Foreground only
                        </option>
                        <option
                          value="background"
                          disabled={!library.backgroundReady}
                        >
                          Background only
                        </option>
                      </select>
                      {library.mosaicRegion !== "all" && (
                        <p className="muted text-xs mt-3">
                          {library.mosaicRegion === "foreground"
                            ? "Keep the original background."
                            : "Keep the original person."}
                        </p>
                      )}
                      {!library.backgroundReady && (
                        <>
                          <p className="muted text-xs mt-3">
                            One-time setup downloads a local model (about 176
                            MB). Photo processing then works offline; no photos
                            are sent.
                          </p>
                          <button
                            className="secondary w-full justify-center mt-3"
                            disabled={
                              busy ||
                              preparingBackground ||
                              !library.backgroundAvailable
                            }
                            onClick={() =>
                              action(async () => {
                                setPreparingBackground(true);
                                try {
                                  await api("/background/setup", "POST", {});
                                  await refresh();
                                } finally {
                                  setPreparingBackground(false);
                                }
                              })
                            }
                          >
                            {preparingBackground
                              ? "Preparing local model…"
                              : "Prepare background removal"}
                          </button>
                          {!library.backgroundAvailable && (
                            <p className="muted text-xs mt-3">
                              Install optional dependencies using
                              requirements-background.txt to enable this
                              feature.
                            </p>
                          )}
                        </>
                      )}
                      {library.foreground && (
                        <p className="muted text-xs mt-3">
                          Only tiles in the selected area count toward photo
                          usage. Fine edges are clipped to the portrait
                          silhouette.
                        </p>
                      )}
                    </div>
                  )}
                  <p className="muted text-sm mb-3">
                    A clear portrait works beautifully. This image sets the
                    shape and colors.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      action(async () => {
                        await choosePortrait(target);
                      });
                    }}
                  >
                    <input
                      className="full-input"
                      aria-label="Local portrait path"
                      placeholder="/Users/you/Pictures/portrait.jpg"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    />
                    <button
                      disabled={busy || !target}
                      className="secondary w-full justify-center mt-3"
                    >
                      {busy
                        ? "Opening…"
                        : library.target
                          ? "Update portrait"
                          : "Open portrait"}
                      <ArrowRight size={15} />
                    </button>
                  </form>
                  <div className="portrait-folder">
                    <label className="slider-label">
                      Or choose from a folder
                    </label>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        action(() => scan(portraitFolder, "/portraits"));
                      }}
                    >
                      <input
                        className="full-input mt-2"
                        aria-label="Portrait folder path"
                        placeholder="/Users/you/Pictures/Portraits"
                        value={portraitFolder}
                        onChange={(e) => setPortraitFolder(e.target.value)}
                      />
                      <button className="text-button mt-3" disabled={busy}>
                        Browse portraits <ArrowRight size={14} />
                      </button>
                    </form>
                    {portraitOptions.length > 0 && (
                      <div className="portrait-options">
                        {portraitOptions.map((p) => (
                          <button
                            key={p.id}
                            disabled={busy}
                            title={p.name}
                            aria-label={"Use " + p.name + " as portrait"}
                            onClick={() => action(() => choosePortrait(p.path))}
                          >
                            <img
                              src={"/api/portraits/" + p.id + "/image"}
                              alt={p.name}
                            />
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="muted text-xs mt-3">
                      You can also select “Use as portrait” on any library
                      photo.
                    </p>
                  </div>
                </section>
                <section className="control-card">
                  <h3>
                    <SlidersHorizontal size={18} />
                    {hasPieces ? "Studio defaults" : "Make it yours"}
                  </h3>
                  {hasPieces && (
                    <p className="control-tip mb-4">
                      Used by pieces with “Use studio defaults” enabled. Custom
                      piece settings are saved independently.
                    </p>
                  )}
                  <label className="slider-label">
                    Tile resolution <strong>{columns} across</strong>
                  </label>
                  <input
                    aria-label="Tile resolution"
                    type="range"
                    min="12"
                    max="160"
                    step="2"
                    value={columns}
                    onChange={(e) => setColumns(+e.target.value)}
                  />
                  <div className="range-ends">
                    <span>Larger photos</span>
                    <span>More detail</span>
                  </div>
                  <label className="slider-label mt-7">
                    Photo variety <strong>{Math.round(variety * 100)}%</strong>
                  </label>
                  <input
                    aria-label="Photo variety"
                    type="range"
                    min="0"
                    max="1"
                    step=".01"
                    value={variety}
                    onChange={(e) => setVariety(+e.target.value)}
                  />
                  <div className="range-ends">
                    <span>Closest match</span>
                    <span>More memories</span>
                  </div>
                  <p className="control-tip">
                    {variety === 1
                      ? hasPieces
                        ? "Random placement with even photo usage within each piece."
                        : "Random placement with photo usage as even as possible."
                      : "A little randomness and less repetition help more photos find a place."}
                  </p>
                  <label className="slider-label mt-6">
                    Portrait color blend{" "}
                    <strong>{Math.round(tint * 100)}%</strong>
                  </label>
                  <input
                    aria-label="Portrait color blend"
                    type="range"
                    min="0"
                    max=".65"
                    step=".01"
                    value={tint}
                    onChange={(e) => setTint(+e.target.value)}
                  />
                  <div className="range-ends">
                    <span>Original photos</span>
                    <span>Clearer portrait</span>
                  </div>
                  <button
                    className="text-button mt-6"
                    disabled={generating}
                    onClick={() => setSeed((s) => s + 1)}
                  >
                    <RefreshCw size={14} />
                    Try another arrangement
                  </button>
                </section>
                <section className="export-card">
                  <span className="eyebrow">MADE TO BE KEPT</span>
                  <h3>Save your mosaic</h3>
                  <p>
                    A full-resolution PNG, ready to print or share with your
                    family.
                  </p>
                  <label className="slider-label mt-4">
                    Export width
                    <select
                      aria-label="Export width"
                      value={exportSize}
                      onChange={(e) => setExportSize(+e.target.value)}
                    >
                      <option value={3000}>3,000 px</option>
                      <option value={6000}>6,000 px</option>
                      <option value={9000}>9,000 px</option>
                    </select>
                  </label>
                  <button
                    className="primary w-full justify-center mt-4"
                    disabled={!mosaic || generating || exporting}
                    onClick={async () => {
                      if (!mosaic) return;
                      setExporting(true);
                      try {
                        const c = document.createElement("canvas");
                        if (
                          exportSize *
                            exportSize *
                            (mosaic.aspectRatio ??
                              mosaic.rows / mosaic.columns) >
                          80_000_000
                        )
                          throw new Error(
                            "Choose a smaller export width for this portrait.",
                          );
                        await sharpenTiles(mosaic, exportSize);
                        draw(c, mosaic, exportSize);
                        const blob = await new Promise<Blob>(
                          (resolve, reject) =>
                            c.toBlob(
                              (b) =>
                                b
                                  ? resolve(b)
                                  : reject(
                                      new Error(
                                        "Export failed. Try a smaller width.",
                                      ),
                                    ),
                              "image/png",
                            ),
                        );
                        const response = await fetch("/api/exports", {
                          method: "POST",
                          headers: { "Content-Type": "image/png" },
                          body: blob,
                        });
                        const saved = await response.json();
                        if (!response.ok)
                          throw new Error(
                            saved.error || "Could not save the mosaic locally.",
                          );
                        setSavedExport(saved.url);
                        const a = document.createElement("a");
                        a.href = saved.url;
                        a.download = "memory-mosaic.png";
                        a.click();
                        setNotice(
                          "Your mosaic is saved locally: " + saved.path,
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setExporting(false);
                      }
                    }}
                  >
                    <Download size={16} />
                    {exporting ? "Saving…" : "Download mosaic"}
                  </button>
                  {savedExport && (
                    <a className="text-button mt-3" href={savedExport} download>
                      Download the saved PNG <ArrowRight size={14} />
                    </a>
                  )}
                </section>
              </aside>
            </div>
          )}
        </div>
      </main>
      {pendingPage && (
        <div className="modal-backdrop">
          <section
            className="modal conversion-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Unsaved portrait selection"
          >
            <h2>Unsaved selection</h2>
            <p className="muted">
              Save your selection in Portrait pieces before leaving, or discard
              these edits.
            </p>
            <div className="flex gap-3 mt-5">
              <button className="primary" onClick={() => setPendingPage(null)}>
                Keep editing
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setPieceDirty(false);
                  setPage(pendingPage);
                  setPendingPage(null);
                }}
              >
                Discard & continue
              </button>
            </div>
          </section>
        </div>
      )}
      {conversion && (
        <div className="modal-backdrop">
          <section
            className="modal conversion-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Convert HEIC photos"
          >
            <span className="eyebrow">KEEP EVERY MEMORY</span>
            <h2>
              Convert {conversion.files.length} HEIC{" "}
              {conversion.files.length === 1 ? "photo" : "photos"}?
            </h2>
            <p className="muted text-sm">
              These photos need JPEG copies to use in the mosaic. Conversion
              happens entirely on your computer. Your originals stay untouched;
              copies are kept in this project’s local cache and reused on future
              scans.
            </p>
            {error && (
              <p className="error p-3 mt-3 rounded text-sm" role="alert">
                {error}
              </p>
            )}
            <div className="conversion-list">
              {conversion.files.map((p) => (
                <div key={p}>{p.split("/").pop()}</div>
              ))}
            </div>
            <div className="flex justify-between gap-3">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  const c = conversion;
                  setConversion(null);
                  if (c.endpoint === "/import")
                    action(() => scan(c.path, c.endpoint, false, true));
                }}
              >
                Skip for now
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const c = conversion;
                    setConversionProgress(0);
                    for (const [index, path] of c.files.entries()) {
                      await api("/convert", "POST", { paths: [path] });
                      setConversionProgress(index + 1);
                    }
                    setConversion(null);
                    if (c.endpoint === "/target") await choosePortrait(c.path);
                    else await scan(c.path, c.endpoint, true);
                  })
                }
              >
                {busy
                  ? `Converting ${conversionProgress}/${conversion.files.length}…`
                  : "Convert to JPEG"}
                <ArrowRight size={15} />
              </button>
            </div>
          </section>
        </div>
      )}
      {editing && (
        <CropEditor
          photo={editing}
          onClose={() => setEditing(null)}
          onSave={savePhoto}
          previewPixels={cropPreviewPixels}
          onPreviewPixelsChange={changeCropPreviewPixels}
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
