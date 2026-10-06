import { ZoomControls, fitCanvasZoom } from "../components/ZoomControls";
import React from "react";

import { Grid2X2, ImagePlus } from "lucide-react";

import type { Mosaic } from "../types";

type Props = {
  previewCard: React.RefObject<HTMLElement | null>;
  isFullScreen: boolean;
  generating: boolean;
  mosaic: Mosaic | null;
  viewport: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  canvas: React.RefObject<HTMLCanvasElement | null>;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  toggleFullScreen: () => Promise<void>;
};
export function MosaicPreview({
  previewCard,
  isFullScreen,
  generating,
  mosaic,
  viewport,
  zoom,
  canvas,
  setZoom,
  toggleFullScreen,
}: Props) {
  return (
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
          <div className="canvas-wrap" style={{ width: `${zoom * 100}%` }}>
            <canvas ref={canvas} aria-label="Mosaic portrait preview" />
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
        <ZoomControls
          zoom={zoom}
          onChange={setZoom}
          onFit={() => {
            setZoom(
              fitCanvasZoom(
                viewport.current,
                mosaic
                  ? (mosaic.aspectRatio ?? mosaic.rows / mosaic.columns)
                  : 1,
              ),
            );
            viewport.current?.scrollTo(0, 0);
          }}
          fullscreen={{ active: isFullScreen, toggle: toggleFullScreen }}
        />
      </div>
    </section>
  );
}
