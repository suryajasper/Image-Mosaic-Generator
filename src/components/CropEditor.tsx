import { Modal } from "./Modal";
import React, { useState, useRef, useEffect } from "react";
import { X, RotateCw, Check } from "lucide-react";
import type { Photo } from "../types";
import { loadImage } from "../images";
import { cropDragUpdate } from "../crop-drag";
export function CropEditor({
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
    <Modal
      label="Adjust photo crop"
      className="crop-modal"
      onClose={onClose}
      closeDisabled={saving}
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
          disabled={saving}
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
      <div className="crop-footer flex justify-between">
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
    </Modal>
  );
}
