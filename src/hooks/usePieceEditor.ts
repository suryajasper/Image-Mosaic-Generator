import { drawSelection } from "../pieces/renderer";

import { useEffect, useRef, useState } from "react";

import { api } from "../api";
import { attachCanvasGestures, MIN_CANVAS_ZOOM } from "../canvas-gestures";

import type { Piece, Project, Point, Tool } from "../pieces/types";
import { makeMask } from "../pieces/masks";
import { loadImage as imageFrom } from "../images";

import type { PieceEditorProps } from "../pieces/editor-types";
export function usePieceEditor({
  target,
  onChange,
  onDirtyChange,
}: PieceEditorProps) {
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
    return attachCanvasGestures(
      element,
      (factor) =>
        setZoom((value) =>
          Math.max(MIN_CANVAS_ZOOM, Math.min(5, value * factor)),
        ),
      true,
      false,
    );
  }, [!!project]);

  useEffect(() => {
    const canvas = display.current,
      portrait = original.current;
    if (!canvas || !portrait || !project) return;
    canvas.width = project.width;
    canvas.height = project.height;
    drawSelection(
      canvas,
      portrait,
      project,
      selectedId,
      draft.current,
      masks.current,
      points,
      box,
      suggestionMask,
      showOverlay,
    );
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

  return {
    project,
    selectedId,
    setSelectedId,
    tool,
    setTool,
    brush,
    setBrush,
    zoom,
    setZoom,
    showOverlay,
    setShowOverlay,
    dirty,
    busy,
    error,
    setError,
    notice,
    points,
    setPoints,
    box,
    setBox,
    suggestions,
    setSuggestions,
    candidate,
    setCandidate,
    suggestionMask,
    setSuggestionMask,
    pendingSelection,
    setPendingSelection,
    pendingDelete,
    setPendingDelete,
    display,
    viewport,
    draft,
    history,
    drag,
    requestVersion,
    refresh,
    run,
    checkpoint,
    undo,
    down,
    move,
    save,
    switchPiece,
    updatePiece,
    movePiece,
    rerender,
    selected,
    setNotice,
    setDirty,
  };
}
