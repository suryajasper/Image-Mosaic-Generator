import type { Dispatch, SetStateAction, RefObject } from "react";

import {
  Minus,
  Undo2,
  Redo2,
  MousePointer2,
  Paintbrush,
  Eraser,
  Square,
  Hand,
} from "lucide-react";

import type { Piece, Project, Tool } from "../pieces/types";

type Props = {
  tool: Tool;
  selected: Piece | undefined;
  busy: boolean;
  project: Project;
  setTool: Dispatch<SetStateAction<Tool>>;
  history: RefObject<{ past: ImageData[]; future: ImageData[] }>;
  undo: (forward?: boolean) => void;
  brush: number;
  setBrush: Dispatch<SetStateAction<number>>;
};
export function SelectionTools({
  tool,
  selected,
  busy,
  project,
  setTool,
  history,
  undo,
  brush,
  setBrush,
}: Props) {
  return (
    <>
      <div className="piece-tools" role="toolbar" aria-label="Selection tools">
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
    </>
  );
}
