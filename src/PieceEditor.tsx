import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Minus,
  Undo2,
  Redo2,
  MousePointer2,
  Paintbrush,
  Eraser,
  Square,
  Save,
  Trash2,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Eye,
  Scissors,
  Hand,
} from "lucide-react";
import { api } from "./api";
import { MIN_CANVAS_ZOOM, stepCanvasZoom } from "./canvas-gestures";
import {
  PieceSettings,
  type PieceTuning,
  type StudioDefaults,
} from "./PieceSettings";

import { type PieceEffect } from "./piece-effects";

type Group = { id: string; name: string; status: string };
type Piece = PieceTuning & {
  id: string;
  name: string;
  mode: "mosaic" | "original";
  groups: string[];
  maskUrl: string;
  mask_revision: number;
  prompts?: { points: Point[]; box: number[] | null };
};
type Project = {
  id: string;
  width: number;
  height: number;
  enabled: number;
  stale: boolean;
  imageUrl: string;
  pieces: Piece[];
  remainder_mode: "mosaic" | "original";
  remainder_groups: string[];
  remainder_columns: number | null;
  remainder_variety: number | null;
  remainder_blend: number | null;
  remainder_effect: PieceEffect | null;
  selectionReady: boolean;
  selectionAvailable: boolean;
};
type Point = { x: number; y: number; include: number };
type Tool = "include" | "exclude" | "box" | "paint" | "erase" | "pan";
const palette = [
  "#579b76",
  "#c58857",
  "#658db8",
  "#b3779b",
  "#9a984f",
  "#927cb7",
];
const imageFrom = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Could not load the local portrait or mask."));
    image.src = url;
  });
const makeMask = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

export function PieceEditor({
  groups,
  target,
  backgroundReady,
  onChange,
  onChoosePortrait,
  onDirtyChange,
  defaults,
}: {
  groups: Group[];
  target: string | null;
  backgroundReady: boolean;
  onChange: () => Promise<void>;
  onChoosePortrait: () => void;
  onDirtyChange: (dirty: boolean) => void;
  defaults: StudioDefaults;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("include");
  const [brush, setBrush] = useState(35);
  const [zoom, setZoom] = useState(1);
  const [showOverlay, setShowOverlay] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [points, setPoints] = useState<Point[]>([]);
  const [box, setBox] = useState<number[] | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [candidate, setCandidate] = useState(0);
  const [suggestionMask, setSuggestionMask] = useState<HTMLImageElement | null>(
    null,
  );
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const display = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const original = useRef<HTMLImageElement | null>(null);
  const draft = useRef<HTMLCanvasElement | null>(null);
  const masks = useRef(new Map<string, HTMLCanvasElement>());
  const history = useRef<{ past: ImageData[]; future: ImageData[] }>({
    past: [],
    future: [],
  });
  const drag = useRef<{
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    tool: Tool;
    pointer: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const requestVersion = useRef(0);
  const loadVersion = useRef(0);
  const draftKey = useRef("");
  const selected = project?.pieces.find((p) => p.id === selectedId);
  const rerender = () => setTick((v) => v + 1);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  async function refresh(select?: string | null) {
    const result = await api<Project>("/project");
    setProject(result);
    if (select !== undefined) setSelectedId(select);
    else
      setSelectedId((current) =>
        result.pieces.some((p) => p.id === current)
          ? current
          : result.pieces[0]?.id || null,
      );
    return result;
  }
  useEffect(() => {
    const version = ++loadVersion.current;
    draftKey.current = "";
    setProject(null);
    setDirty(false);
    setSelectedId(null);
    masks.current.clear();
    original.current = null;
    draft.current = null;
    if (target)
      api<Project>("/project")
        .then((result) => {
          if (version !== loadVersion.current) return;
          setProject(result);
          setSelectedId(result.pieces[0]?.id || null);
        })
        .catch((e) => setError(e.message));
    return () => {
      loadVersion.current++;
      requestVersion.current++;
    };
  }, [target]);
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    Promise.all([
      imageFrom(project.imageUrl),
      ...project.pieces.map(async (piece) => ({
        id: piece.id,
        image: await imageFrom(piece.maskUrl),
      })),
    ])
      .then(([portrait, ...items]) => {
        if (cancelled) return;
        original.current = portrait as HTMLImageElement;
        masks.current.clear();
        for (const item of items as { id: string; image: HTMLImageElement }[]) {
          const mask = makeMask(project.width, project.height);
          mask
            .getContext("2d")!
            .drawImage(item.image, 0, 0, mask.width, mask.height);
          masks.current.set(item.id, mask);
        }
        const key =
          project.id +
          project.imageUrl +
          selectedId +
          ":" +
          project.pieces.find((p) => p.id === selectedId)?.mask_revision;
        if (key !== draftKey.current) {
          const source = selectedId && masks.current.get(selectedId);
          const mask = makeMask(project.width, project.height);
          const context = mask.getContext("2d")!;
          context.fillStyle = "black";
          context.fillRect(0, 0, mask.width, mask.height);
          if (source) context.drawImage(source, 0, 0);
          draft.current = mask;
          draftKey.current = key;
          history.current = { past: [], future: [] };
          setDirty(false);
          const prompts = project.pieces.find(
            (p) => p.id === selectedId,
          )?.prompts;
          setPoints(prompts?.points || []);
          setBox(prompts?.box || null);
          setSuggestions([]);
          setSuggestionMask(null);
          requestVersion.current++;
        }
        rerender();
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [
    project?.id,
    project?.imageUrl,
    project?.pieces.map((p) => p.id + ":" + p.mask_revision).join(","),
    selectedId,
  ]);

  useEffect(() => {
    if (!suggestions.length) {
      setSuggestionMask(null);
      return;
    }
    let cancelled = false;
    imageFrom(suggestions[candidate])
      .then((image) => {
        if (!cancelled) setSuggestionMask(image);
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [suggestions, candidate]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let gestureScale = 1,
      gesturing = false;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!gesturing)
        setZoom((v) =>
          Math.max(
            MIN_CANVAS_ZOOM,
            Math.min(
              5,
              v * Math.exp(Math.max(-0.4, Math.min(0.4, -event.deltaY * 0.01))),
            ),
          ),
        );
    };
    const start = (event: Event) => {
      event.preventDefault();
      gestureScale = 1;
      gesturing = true;
    };
    const change = (event: Event) => {
      event.preventDefault();
      const scale = (event as Event & { scale: number }).scale;
      if (Number.isFinite(scale) && scale > 0) {
        setZoom((v) =>
          Math.max(MIN_CANVAS_ZOOM, Math.min(5, (v * scale) / gestureScale)),
        );
        gestureScale = scale;
      }
    };
    const end = (event: Event) => {
      event.preventDefault();
      gesturing = false;
    };
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("gesturestart", start, { passive: false });
    element.addEventListener("gesturechange", change, { passive: false });
    element.addEventListener("gestureend", end, { passive: false });
    return () => {
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("gesturestart", start);
      element.removeEventListener("gesturechange", change);
      element.removeEventListener("gestureend", end);
    };
  }, [!!project]);

  useEffect(() => {
    const canvas = display.current,
      portrait = original.current;
    if (!canvas || !portrait || !project) return;
    canvas.width = project.width;
    canvas.height = project.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(portrait, 0, 0, canvas.width, canvas.height);
    if (showOverlay) {
      const remaining = new Float32Array(canvas.width * canvas.height).fill(1);
      for (const [index, piece] of project.pieces.entries()) {
        const source =
          piece.id === selectedId ? draft.current : masks.current.get(piece.id);
        if (!source) continue;
        const preview = piece.id === selectedId && suggestionMask;
        const maskCanvas = preview
          ? makeMask(canvas.width, canvas.height)
          : source;
        if (preview)
          maskCanvas
            .getContext("2d")!
            .drawImage(preview, 0, 0, canvas.width, canvas.height);
        const data = maskCanvas
          .getContext("2d", { willReadFrequently: true })!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        const overlay = context.createImageData(canvas.width, canvas.height);
        const color = palette[index % palette.length];
        const rgb = [
          parseInt(color.slice(1, 3), 16),
          parseInt(color.slice(3, 5), 16),
          parseInt(color.slice(5, 7), 16),
        ];
        for (let pixel = 0; pixel < remaining.length; pixel++) {
          const coverage = data[pixel * 4] / 255;
          const effective = coverage * remaining[pixel];
          remaining[pixel] *= 1 - coverage;
          overlay.data[pixel * 4] = rgb[0];
          overlay.data[pixel * 4 + 1] = rgb[1];
          overlay.data[pixel * 4 + 2] = rgb[2];
          overlay.data[pixel * 4 + 3] =
            effective * (piece.id === selectedId ? 0.48 : 0.2) * 255;
        }
        const layer = makeMask(canvas.width, canvas.height);
        layer.getContext("2d")!.putImageData(overlay, 0, 0);
        context.drawImage(layer, 0, 0);
      }
    }
    for (const point of points) {
      const x = point.x * canvas.width,
        y = point.y * canvas.height;
      context.beginPath();
      context.arc(x, y, 7, 0, Math.PI * 2);
      context.fillStyle = point.include ? "#2d9964" : "#cf5656";
      context.fill();
      context.strokeStyle = "white";
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = "white";
      context.font = "bold 12px sans-serif";
      context.textAlign = "center";
      context.fillText(point.include ? "+" : "−", x, y + 4);
    }
    if (box) {
      context.strokeStyle = "white";
      context.lineWidth = 2;
      context.setLineDash([8, 5]);
      context.strokeRect(
        box[0] * canvas.width,
        box[1] * canvas.height,
        (box[2] - box[0]) * canvas.width,
        (box[3] - box[1]) * canvas.height,
      );
      context.setLineDash([]);
    }
  }, [project, selectedId, points, box, suggestionMask, showOverlay, tick]);

  async function run(fn: () => Promise<void>) {
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
  function checkpoint() {
    const canvas = draft.current;
    if (!canvas) return;
    history.current.past.push(
      canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height),
    );
    if (history.current.past.length > 12) history.current.past.shift();
    history.current.future = [];
  }
  function undo(forward = false) {
    const canvas = draft.current;
    if (!canvas) return;
    const from = forward ? history.current.future : history.current.past,
      to = forward ? history.current.past : history.current.future;
    const state = from.pop();
    if (state) {
      to.push(
        canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height),
      );
      canvas.getContext("2d")!.putImageData(state, 0, 0);
      setDirty(true);
      rerender();
    }
  }
  function location(event: React.PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }
  function paint(
    x: number,
    y: number,
    lastX: number,
    lastY: number,
    erase: boolean,
  ) {
    const canvas = draft.current;
    if (!canvas) return;
    const context = canvas.getContext("2d")!;
    context.strokeStyle = erase ? "black" : "white";
    context.fillStyle = context.strokeStyle;
    context.lineWidth = brush;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(lastX * canvas.width, lastY * canvas.height);
    context.lineTo(x * canvas.width, y * canvas.height);
    context.stroke();
    context.beginPath();
    context.arc(x * canvas.width, y * canvas.height, brush / 2, 0, Math.PI * 2);
    context.fill();
    setDirty(true);
    rerender();
  }
  function down(event: React.PointerEvent<HTMLCanvasElement>) {
    if (
      (!selected && tool !== "pan") ||
      busy ||
      project?.stale ||
      event.button !== 0
    )
      return;
    const point = location(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "include" || tool === "exclude") {
      setPoints((current) =>
        [...current, { ...point, include: tool === "include" ? 1 : 0 }].slice(
          -100,
        ),
      );
      requestVersion.current++;
      setSuggestions([]);
      setSuggestionMask(null);
      return;
    }
    drag.current = {
      ...point,
      lastX: point.x,
      lastY: point.y,
      tool,
      pointer: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    if (tool === "pan") return;
    if (tool === "box") {
      setBox([point.x, point.y, point.x, point.y]);
      requestVersion.current++;
      setSuggestions([]);
      setSuggestionMask(null);
    } else {
      checkpoint();
      setSuggestions([]);
      setSuggestionMask(null);
      paint(point.x, point.y, point.x, point.y, tool === "erase");
    }
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    const start = drag.current;
    if (!start || start.pointer !== event.pointerId) return;
    if (start.tool === "pan") {
      if (viewport.current) {
        viewport.current.scrollLeft -= event.clientX - start.clientX;
        viewport.current.scrollTop -= event.clientY - start.clientY;
      }
      drag.current = {
        ...start,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      return;
    }
    const point = location(event);
    if (start.tool === "box")
      setBox([
        Math.min(start.x, point.x),
        Math.min(start.y, point.y),
        Math.max(start.x, point.x),
        Math.max(start.y, point.y),
      ]);
    else
      paint(point.x, point.y, start.lastX, start.lastY, start.tool === "erase");
    drag.current = { ...start, lastX: point.x, lastY: point.y };
  }
  async function save() {
    if (!project || !selected || !draft.current) return;
    await api("/pieces/" + selected.id, "PATCH", {
      projectId: project.id,
      mask: draft.current.toDataURL("image/png"),
      revision: selected.mask_revision,
      prompts: { points, box },
    });
    setDirty(false);
    await refresh(selected.id);
    await onChange();
    setNotice("Selection saved locally.");
  }
  function switchPiece(id: string) {
    if (id === selectedId) return;
    if (dirty) {
      setPendingSelection(id);
      return;
    }
    setSelectedId(id);
  }
  async function updatePiece(piece: Piece, body: unknown) {
    if (!project) return;
    await api("/pieces/" + piece.id, "PATCH", {
      projectId: project.id,
      ...(body as object),
    });
    await refresh();
    await onChange();
  }
  async function movePiece(index: number, delta: number) {
    if (!project) return;
    const ids = project.pieces.map((p) => p.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    await api("/project/order", "POST", { projectId: project.id, ids });
    await refresh();
    await onChange();
  }
  const groupPicker = (chosen: string[], change: (ids: string[]) => void) => (
    <div className="piece-group-picker">
      {groups.length ? (
        groups.map((group) => (
          <label key={group.id}>
            <input
              type="checkbox"
              checked={chosen.includes(group.id)}
              disabled={busy || project?.stale}
              onChange={(event) =>
                change(
                  event.target.checked
                    ? [...chosen, group.id]
                    : chosen.filter((id) => id !== group.id),
                )
              }
            />
            {group.name}
            {group.status !== "available" && <small> unavailable</small>}
          </label>
        ))
      ) : (
        <small>Add a photo group in the library.</small>
      )}
      {chosen.some((id) => !groups.some((g) => g.id === id)) && (
        <>
          <small className="error">
            An assigned group was removed. Restore it or clear its assignment.
          </small>
          <button
            className="text-button"
            disabled={busy || project?.stale}
            onClick={() =>
              change(
                chosen.filter((id) => groups.some((group) => group.id === id)),
              )
            }
          >
            Clear removed groups
          </button>
        </>
      )}
    </div>
  );

  if (!target)
    return (
      <section className="empty-library">
        <Scissors size={36} />
        <h2>Choose a portrait first</h2>
        <p>Your named pieces will be saved with that portrait.</p>
        <button className="primary mt-5" onClick={onChoosePortrait}>
          Choose portrait
        </button>
      </section>
    );
  if (!project)
    return <p className="muted">{error || "Loading your portrait pieces…"}</p>;
  return (
    <div className="pieces-workspace">
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button
            aria-label="Dismiss selection error"
            onClick={() => setError("")}
          >
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      {project.stale && (
        <div className="alert error">
          <div>
            The portrait file changed. Choose whether to reset its pieces or
            resize and reuse their masks.
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("/project/reset", "POST", {
                  projectId: project.id,
                  reuse: true,
                });
                await refresh();
                await onChange();
              })
            }
          >
            Reuse masks
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("/project/reset", "POST", {
                  projectId: project.id,
                  reuse: false,
                });
                await refresh();
                await onChange();
              })
            }
          >
            Reset pieces
          </button>
        </div>
      )}
      <div className="pieces-layout">
        <section className="piece-editor-card">
          <div className="piece-editor-heading">
            <div>
              <span className="eyebrow">PORTRAIT SELECTION</span>
              <h3>{selected?.name || "Create your first piece"}</h3>
            </div>
            <div className="flex items-center gap-3">
              <span className="muted text-xs">
                {dirty ? "Unsaved selection" : "Saved locally"}
              </span>
              {selected && (
                <button
                  className="primary"
                  disabled={!dirty || busy || project.stale}
                  onClick={() => run(save)}
                >
                  <Save size={15} />
                  Save changes
                </button>
              )}
            </div>
          </div>
          <div
            className="piece-tools"
            role="toolbar"
            aria-label="Selection tools"
          >
            {(
              [
                ["include", "Include point", MousePointer2],
                ["exclude", "Exclude point", Minus],
                ["box", "Selection box", Square],
                ["paint", "Add brush", Paintbrush],
                ["erase", "Erase brush", Eraser],
                ["pan", "Pan portrait", Hand],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                className={tool === value ? "chosen" : ""}
                aria-label={label}
                title={label}
                disabled={!selected || busy || project.stale}
                onClick={() => setTool(value)}
              >
                <Icon size={17} />
                <span>{label}</span>
              </button>
            ))}
            <button
              aria-label="Undo brush edit"
              title="Undo"
              disabled={!history.current.past.length || busy}
              onClick={() => undo()}
            >
              <Undo2 size={17} />
            </button>
            <button
              aria-label="Redo brush edit"
              title="Redo"
              disabled={!history.current.future.length || busy}
              onClick={() => undo(true)}
            >
              <Redo2 size={17} />
            </button>
          </div>
          {(tool === "paint" || tool === "erase") && (
            <label className="brush-size">
              Brush size{" "}
              <input
                aria-label="Brush size"
                type="range"
                min="4"
                max="160"
                value={brush}
                onChange={(e) => setBrush(+e.target.value)}
              />
              <strong>{brush} px</strong>
            </label>
          )}
          <div className="piece-viewport" ref={viewport}>
            <div
              className="piece-canvas-wrap"
              style={{ width: `${zoom * 100}%` }}
            >
              <canvas
                aria-label="Portrait selection canvas"
                style={{ cursor: tool === "pan" ? "grab" : "crosshair" }}
                ref={display}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                onLostPointerCapture={() => {
                  drag.current = null;
                }}
              />
            </div>
          </div>
          <div className="piece-editor-footer">
            <button
              className="text-button"
              onClick={() => setShowOverlay((v) => !v)}
            >
              <Eye size={16} />
              {showOverlay ? "Hide overlays" : "Show overlays"}
            </button>
            <div className="zoom-controls">
              <button
                aria-label="Zoom portrait out"
                onClick={() => setZoom((v) => stepCanvasZoom(v, -1, 5))}
              >
                <Minus size={16} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                aria-label="Zoom portrait in"
                onClick={() => setZoom((v) => stepCanvasZoom(v, 1, 5))}
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => {
                  setZoom(1);
                  viewport.current?.scrollTo(0, 0);
                }}
              >
                Fit
              </button>
            </div>
          </div>
          {selected && (
            <div className="selection-actions">
              <div className="smart-controls">
                <button
                  className="secondary"
                  disabled={
                    busy ||
                    project.stale ||
                    !project.selectionReady ||
                    (!points.length && !box)
                  }
                  onClick={() =>
                    run(async () => {
                      const version = ++requestVersion.current;
                      const result = await api<{
                        masks: string[];
                        timings: { promptSeconds: number };
                      }>("/project/select", "POST", {
                        projectId: project.id,
                        points,
                        box,
                      });
                      if (version !== requestVersion.current) return;
                      setSuggestions(result.masks);
                      setCandidate(0);
                      setNotice(
                        "Review the suggested boundary, then apply it to your piece.",
                      );
                    })
                  }
                >
                  <Scissors size={16} />
                  {busy ? "Working…" : "Suggest selection"}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setPoints([]);
                    setBox(null);
                    setSuggestions([]);
                    setSuggestionMask(null);
                    requestVersion.current++;
                  }}
                >
                  Clear points & box
                </button>
              </div>
              {suggestions.length > 0 && (
                <div className="suggestion-actions">
                  <span>
                    Suggestion {candidate + 1} / {suggestions.length}
                  </span>
                  <button
                    className="secondary"
                    onClick={() =>
                      setCandidate((v) => (v + 1) % suggestions.length)
                    }
                  >
                    Try alternative
                  </button>
                  <button
                    className="primary"
                    disabled={!suggestionMask}
                    onClick={() => {
                      checkpoint();
                      draft
                        .current!.getContext("2d")!
                        .drawImage(
                          suggestionMask!,
                          0,
                          0,
                          project.width,
                          project.height,
                        );
                      setDirty(true);
                      setSuggestions([]);
                      setSuggestionMask(null);
                      rerender();
                    }}
                  >
                    Apply selection
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSuggestions([]);
                      setSuggestionMask(null);
                    }}
                  >
                    Discard suggestion
                  </button>
                </div>
              )}
              <div className="save-selection">
                <span className="muted text-xs">
                  {tool === "paint" || tool === "erase"
                    ? "Paint to refine the boundary. Zoom for small details."
                    : "Add points inside the piece and exclusion points outside. A box can narrow the selection."}
                </span>
                <button
                  className="primary"
                  disabled={!dirty || busy || project.stale}
                  onClick={() => run(save)}
                >
                  <Save size={16} />
                  Save selection
                </button>
              </div>
            </div>
          )}
          {!project.selectionReady && (
            <div className="selection-setup">
              <strong>Enable local smart selection</strong>
              <p className="muted text-sm">
                The manual brush works now. Smart selection needs a one-time 39
                MB model download; your photos stay on this computer.
              </p>
              {project.selectionAvailable ? (
                <button
                  className="secondary mt-3"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("/selection/setup", "POST", {});
                      await refresh();
                    })
                  }
                >
                  Prepare smart selection
                </button>
              ) : (
                <code>
                  .venv/bin/python -m pip install -r requirements-selection.txt
                </code>
              )}
            </div>
          )}
        </section>
        <aside className="piece-list-panel">
          <div className="flex items-center justify-between">
            <h3>Named pieces</h3>
            <button
              className="secondary"
              aria-label="Add portrait piece"
              disabled={busy || project.stale}
              onClick={() =>
                run(async () => {
                  const result = await api<{ id: string }>("/pieces", "POST", {
                    projectId: project.id,
                    name: `Piece ${project.pieces.length + 1}`,
                  });
                  await refresh();
                  if (dirty) setPendingSelection(result.id);
                  else setSelectedId(result.id);
                  await onChange();
                })
              }
            >
              <Plus size={16} />
              Add
            </button>
          </div>
          <p className="muted text-xs mt-2 mb-4">
            Higher pieces take priority where selections overlap.
          </p>
          {!project.pieces.length && (
            <div className="piece-start">
              <p>Add a piece and name it Face, Suit, or anything you want.</p>
              {backgroundReady && (
                <button
                  className="secondary mt-3"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("/project/person", "POST", {
                        projectId: project.id,
                      });
                      await refresh();
                      await onChange();
                    })
                  }
                >
                  Start from Person
                </button>
              )}
            </div>
          )}
          {project.pieces.map((piece, index) => (
            <article
              key={piece.id}
              className={
                selectedId === piece.id ? "piece-card active" : "piece-card"
              }
            >
              <div className="piece-card-top">
                <button
                  className="piece-title"
                  onClick={() => switchPiece(piece.id)}
                >
                  <span
                    style={{ background: palette[index % palette.length] }}
                  />
                  {piece.name}
                </button>
                <div className="piece-order">
                  <button
                    aria-label={"Move " + piece.name + " up"}
                    disabled={busy || index === 0 || project.stale}
                    onClick={() => run(() => movePiece(index, -1))}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    aria-label={"Move " + piece.name + " down"}
                    disabled={
                      busy ||
                      index === project.pieces.length - 1 ||
                      project.stale
                    }
                    onClick={() => run(() => movePiece(index, 1))}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    aria-label={"Delete " + piece.name}
                    disabled={busy || project.stale}
                    onClick={() => setPendingDelete(piece.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {selectedId === piece.id && (
                <input
                  key={piece.name}
                  aria-label="Piece name"
                  defaultValue={piece.name}
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (name && name !== piece.name)
                      run(() => updatePiece(piece, { name }));
                  }}
                />
              )}
              <select
                aria-label={"Rendering for " + piece.name}
                disabled={busy || project.stale}
                value={piece.mode}
                onChange={(e) =>
                  run(() => updatePiece(piece, { mode: e.target.value }))
                }
              >
                <option value="mosaic">Mosaic</option>
                <option value="original">Keep original</option>
              </select>
              {piece.mode === "mosaic" &&
                groupPicker(piece.groups, (ids) =>
                  run(() => updatePiece(piece, { groups: ids })),
                )}
              {piece.mode === "mosaic" && (
                <PieceSettings
                  sources={project.pieces}
                  name={piece.name}
                  settings={piece}
                  defaults={defaults}
                  disabled={busy || project.stale}
                  onSave={async (settings) => {
                    await api("/pieces/" + piece.id, "PATCH", {
                      projectId: project.id,
                      ...settings,
                    });
                    await refresh();
                    await onChange();
                  }}
                />
              )}
              <button
                className="text-button mt-2"
                onClick={() => switchPiece(piece.id)}
              >
                Edit selection
              </button>
            </article>
          ))}
          <article className="piece-card remainder-card">
            <h4>Everything else</h4>
            <p className="muted text-xs">
              All pixels outside your named pieces.
            </p>
            <select
              aria-label="Rendering for Everything else"
              value={project.remainder_mode}
              disabled={busy || project.stale}
              onChange={(e) =>
                run(async () => {
                  await api("/project/options", "POST", {
                    projectId: project.id,
                    mode: e.target.value,
                  });
                  await refresh();
                  await onChange();
                })
              }
            >
              <option value="original">Keep original</option>
              <option value="mosaic">Mosaic</option>
            </select>
            {project.remainder_mode === "mosaic" &&
              groupPicker(project.remainder_groups, (ids) =>
                run(async () => {
                  await api("/project/options", "POST", {
                    projectId: project.id,
                    groups: ids,
                  });
                  await refresh();
                  await onChange();
                }),
              )}
            {project.remainder_mode === "mosaic" && (
              <PieceSettings
                sources={project.pieces}
                name="Everything else"
                settings={{
                  columns: project.remainder_columns,
                  variety: project.remainder_variety,
                  blend: project.remainder_blend,
                  effect: project.remainder_effect,
                }}
                defaults={defaults}
                disabled={busy || project.stale}
                onSave={async (settings) => {
                  await api("/project/options", "POST", {
                    projectId: project.id,
                    ...settings,
                  });
                  await refresh();
                  await onChange();
                }}
              />
            )}
          </article>
          <button
            className="primary w-full justify-center mt-4"
            onClick={onChoosePortrait}
          >
            Preview mosaic
          </button>
        </aside>
      </div>
      {pendingSelection && (
        <div className="modal-backdrop">
          <section
            className="modal conversion-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Unsaved selection"
          >
            <h2>Save this selection?</h2>
            <p className="muted">
              You have unsaved brush or selection changes.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await save();
                    setSelectedId(pendingSelection);
                    setPendingSelection(null);
                  })
                }
              >
                Save & switch
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setDirty(false);
                  setSelectedId(pendingSelection);
                  setPendingSelection(null);
                }}
              >
                Discard & switch
              </button>
              <button
                className="text-button"
                onClick={() => setPendingSelection(null)}
              >
                Stay here
              </button>
            </div>
          </section>
        </div>
      )}
      {pendingDelete && (
        <div className="modal-backdrop">
          <section
            className="modal conversion-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Delete portrait piece"
          >
            <h2>Delete this piece?</h2>
            <p className="muted">
              Its pixels will belong to the remaining pieces or Everything else.
              The original portrait stays untouched.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api("/pieces/" + pendingDelete, "DELETE", {
                      projectId: project.id,
                    });
                    if (pendingDelete === selectedId) setDirty(false);
                    setPendingDelete(null);
                    await refresh();
                    await onChange();
                  })
                }
              >
                Delete piece
              </button>
              <button
                className="secondary"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
