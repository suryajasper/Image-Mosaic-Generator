import React from "react";

import { RefreshCw, SlidersHorizontal } from "lucide-react";

type Props = {
  hasPieces: boolean;
  columns: number;
  setColumns: React.Dispatch<React.SetStateAction<number>>;
  variety: number;
  setVariety: React.Dispatch<React.SetStateAction<number>>;
  tint: number;
  setTint: React.Dispatch<React.SetStateAction<number>>;
  generating: boolean;
  setSeed: React.Dispatch<React.SetStateAction<number>>;
};
export function StudioDefaults({
  hasPieces,
  columns,
  setColumns,
  variety,
  setVariety,
  tint,
  setTint,
  generating,
  setSeed,
}: Props) {
  return (
    <section className="control-card">
      <h3>
        <SlidersHorizontal size={18} />
        {hasPieces ? "Studio defaults" : "Make it yours"}
      </h3>
      {hasPieces && (
        <p className="control-tip mb-4">
          Used by pieces with “Use studio defaults” enabled. Custom piece
          settings are saved independently.
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
        Portrait color blend <strong>{Math.round(tint * 100)}%</strong>
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
  );
}
