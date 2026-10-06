import React from "react";

import { ArrowRight, Download } from "lucide-react";

import type { Mosaic } from "../types";

type Props = {
  exportSize: number;
  setExportSize: React.Dispatch<React.SetStateAction<number>>;
  mosaic: Mosaic | null;
  generating: boolean;
  exporting: boolean;
  setExporting: React.Dispatch<React.SetStateAction<boolean>>;
  sharpenTiles: (m: Mosaic, width: number) => Promise<void>;
  draw: (c: HTMLCanvasElement, m: Mosaic, width: number) => void;
  setSavedExport: React.Dispatch<React.SetStateAction<string | null>>;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  savedExport: string | null;
};
export function ExportPanel({
  exportSize,
  setExportSize,
  mosaic,
  generating,
  exporting,
  setExporting,
  sharpenTiles,
  draw,
  setSavedExport,
  setNotice,
  setError,
  savedExport,
}: Props) {
  return (
    <section className="export-card">
      <span className="eyebrow">MADE TO BE KEPT</span>
      <h3>Save your mosaic</h3>
      <p>A full-resolution PNG, ready to print or share with your family.</p>
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
                (mosaic.aspectRatio ?? mosaic.rows / mosaic.columns) >
              80_000_000
            )
              throw new Error(
                "Choose a smaller export width for this portrait.",
              );
            await sharpenTiles(mosaic, exportSize);
            draw(c, mosaic, exportSize);
            const blob = await new Promise<Blob>((resolve, reject) =>
              c.toBlob(
                (b) =>
                  b
                    ? resolve(b)
                    : reject(new Error("Export failed. Try a smaller width.")),
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
            setNotice("Your mosaic is saved locally: " + saved.path);
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
  );
}
