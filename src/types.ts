import type { RenderTreatment } from "./piece-effects";
export type Photo = {
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
export type Group = {
  id: string;
  name: string;
  path: string;
  status: string;
  photoCount: number;
  selectedCount: number;
};
export type Library = {
  groups: Group[];
  photos: Photo[];
  folder: string;
  target: string | null;
  foreground: boolean;
  mosaicRegion: "all" | "foreground" | "background";
  backgroundReady: boolean;
  backgroundAvailable: boolean;
};
export type Scan = {
  unavailable?: boolean;
  imported: number;
  skipped: string[];
  needsConversion?: string[];
  options?: { id: string; name: string; path: string }[];
};
export type Mosaic = {
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

export type Page = "photos" | "pieces" | "mosaic";
