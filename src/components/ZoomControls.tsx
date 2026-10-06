import { Minus, Plus, Maximize, Minimize } from "lucide-react";
import { stepCanvasZoom } from "../canvas-gestures";

export function fitCanvasZoom(viewport: HTMLElement | null, aspect: number) {
  return viewport
    ? Math.max(
        0.05,
        Math.min(1, viewport.clientHeight / (viewport.clientWidth * aspect)),
      )
    : 1;
}
export function ZoomControls({
  zoom,
  onChange,
  onFit,
  maximum = 8,
  portrait = false,
  fullscreen,
}: {
  zoom: number;
  onChange: (zoom: number) => void;
  onFit: () => void;
  maximum?: number;
  portrait?: boolean;
  fullscreen?: { active: boolean; toggle: () => void };
}) {
  return (
    <div className="zoom-controls">
      <button
        aria-label={portrait ? "Zoom portrait out" : "Zoom out"}
        onClick={() => onChange(stepCanvasZoom(zoom, -1, maximum))}
      >
        <Minus size={16} />
      </button>
      <span aria-live="polite">{Math.round(zoom * 100)}%</span>
      <button
        aria-label={portrait ? "Zoom portrait in" : "Zoom in"}
        onClick={() => onChange(stepCanvasZoom(zoom, 1, maximum))}
      >
        <Plus size={16} />
      </button>
      <button
        aria-label={portrait ? "Fit portrait" : "Fit preview"}
        onClick={onFit}
      >
        Fit
      </button>
      {fullscreen && (
        <button
          aria-label={
            fullscreen.active ? "Exit full screen" : "Enter full screen"
          }
          title={fullscreen.active ? "Exit full screen (Esc)" : "Full screen"}
          onClick={fullscreen.toggle}
        >
          {fullscreen.active ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      )}
    </div>
  );
}
