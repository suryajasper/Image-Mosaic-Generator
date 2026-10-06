import React from "react";

import type { Library, Photo, Mosaic } from "../types";
import { photoURL } from "../images";

type Props = {
  mosaic: Mosaic | null;
  used: number;
  selected: Photo[];
  percent: number;
  library: Library;
  setEditing: React.Dispatch<React.SetStateAction<Photo | null>>;
};
export function PhotoUsage({
  mosaic,
  used,
  selected,
  percent,
  library,
  setEditing,
}: Props) {
  return (
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
                {item.used} / {item.eligible} photos · {item.activeTiles} tiles
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
                {item.used} / {item.eligible} photos · {item.placements}{" "}
                placements
              </span>
            </div>
          ))}
          <small>
            Photos in overlapping groups appear in both group totals.
          </small>
        </div>
      )}
      {mosaic && (
        <>
          <p className="muted text-xs mt-5 mb-3">
            Each photo’s actual tile count. Faded photos haven’t been used.
            Click to adjust a crop.
          </p>
          <div className="usage-photos">
            {mosaic.ids.map((id, i) => {
              const p = library.photos.find((p) => p.id === id);
              if (!p) return null;
              return (
                <button
                  key={id}
                  title={`${p.name}: ${mosaic.counts[i]} tiles`}
                  className={mosaic.counts[i] ? "" : "unused"}
                  onClick={() => setEditing(p)}
                >
                  <img src={photoURL(p)} alt={p.name} loading="lazy" />
                  <span>{mosaic.counts[i]}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
