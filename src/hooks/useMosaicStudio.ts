import { usePreviewFullscreen } from "./usePreviewFullscreen";
import { useState, useRef, useEffect } from "react";
import { api } from "../api";
import type { Library, Mosaic } from "../types";
import { MosaicImageCache } from "../studio/image-cache";
import { attachCanvasGestures, MIN_CANVAS_ZOOM } from "../canvas-gestures";
import { drawMosaic } from "../studio/renderer";
export function useMosaicStudio({
  page,
  library,
  hasPieces,
  setError,
}: {
  page: string;
  library: Library;
  hasPieces: boolean;
  setError: (message: string) => void;
}) {
  const selected = library.photos.filter((p) => p.selected);
  const [columns, setColumns] = useState(60);
  const [variety, setVariety] = useState(0.35);
  const [tint, setTint] = useState(0.2);
  const [seed, setSeed] = useState(42);
  const [mosaic, setMosaic] = useState<Mosaic | null>(null);
  const [generating, setGenerating] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [exportSize, setExportSize] = useState(6000);
  const [exporting, setExporting] = useState(false);
  const [savedExport, setSavedExport] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cache = useRef(new MosaicImageCache());
  const previousTarget = useRef(library.target);
  const requestVersion = useRef(0);
  const [previewWidth, setPreviewWidth] = useState(1200);
  const viewport = useRef<HTMLDivElement>(null);
  const previewCard = useRef<HTMLElement>(null);
  const { isFullScreen, toggleFullScreen } = usePreviewFullscreen();
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
    if (page !== "mosaic") return;
    const version = ++requestVersion.current;
    if (previousTarget.current !== library.target) setMosaic(null);
    previousTarget.current = library.target;
    setSavedExport(null);
    if ((!selected.length && !hasPieces) || !library.target) {
      setMosaic(null);
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
        if (version !== requestVersion.current) return;
        await cache.current.prepare(result);
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
  const draw = (canvas: HTMLCanvasElement, mosaic: Mosaic, width: number) =>
    drawMosaic(canvas, mosaic, width, cache.current.images, tint);
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
  const sharpenTiles = (mosaic: Mosaic, width: number) =>
    cache.current.sharpen(mosaic, width);
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

  return {
    columns,
    setColumns,
    variety,
    setVariety,
    tint,
    setTint,
    seed,
    setSeed,
    mosaic,
    generating,
    zoom,
    setZoom,
    exportSize,
    setExportSize,
    exporting,
    setExporting,
    savedExport,
    setSavedExport,
    canvas,
    viewport,
    previewCard,
    isFullScreen,
    toggleFullScreen,
    draw,
    sharpenTiles,
  };
}
