import { GroupPicker } from "./GroupPicker";
import type { Dispatch, SetStateAction } from "react";

import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { api } from "../api";

import { PieceSettings, type StudioDefaults } from "../PieceSettings";

import type { Group, Piece, Project } from "../pieces/types";
import { palette } from "../pieces/masks";

type Props = {
  busy: boolean;
  project: Project;
  run: (fn: () => Promise<void>) => Promise<void>;
  refresh: (select?: string | null) => Promise<Project>;
  dirty: boolean;
  setPendingSelection: Dispatch<SetStateAction<string | null>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  onChange: () => Promise<void>;
  backgroundReady: boolean;
  selectedId: string | null;
  switchPiece: (id: string) => void;
  movePiece: (index: number, delta: number) => Promise<void>;
  setPendingDelete: Dispatch<SetStateAction<string | null>>;
  updatePiece: (piece: Piece, body: unknown) => Promise<void>;
  groups: Group[];
  defaults: StudioDefaults;
  onChoosePortrait: () => void;
};
export function PieceList({
  busy,
  project,
  run,
  refresh,
  dirty,
  setPendingSelection,
  setSelectedId,
  onChange,
  backgroundReady,
  selectedId,
  switchPiece,
  movePiece,
  setPendingDelete,
  updatePiece,
  groups,
  defaults,
  onChoosePortrait,
}: Props) {
  return (
    <>
      <aside className="piece-list-panel">
        <div className="flex items-center justify-between">
          <h3>Named pieces</h3>
          <button
            className="secondary"
            aria-label="Add portrait piece"
            disabled={busy || project.stale}
            onClick={() =>
              run(async () => {
                const result = await api<{ id: string }>("/pieces", "POST", {
                  projectId: project.id,
                  name: `Piece ${project.pieces.length + 1}`,
                });
                await refresh();
                if (dirty) setPendingSelection(result.id);
                else setSelectedId(result.id);
                await onChange();
              })
            }
          >
            <Plus size={16} />
            Add
          </button>
        </div>
        <p className="muted text-xs mt-2 mb-4">
          Higher pieces take priority where selections overlap.
        </p>
        {!project.pieces.length && (
          <div className="piece-start">
            <p>Add a piece and name it Face, Suit, or anything you want.</p>
            {backgroundReady && (
              <button
                className="secondary mt-3"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api("/project/person", "POST", {
                      projectId: project.id,
                    });
                    await refresh();
                    await onChange();
                  })
                }
              >
                Start from Person
              </button>
            )}
          </div>
        )}
        {project.pieces.map((piece, index) => (
          <article
            key={piece.id}
            className={
              selectedId === piece.id ? "piece-card active" : "piece-card"
            }
          >
            <div className="piece-card-top">
              <button
                className="piece-title"
                onClick={() => switchPiece(piece.id)}
              >
                <span style={{ background: palette[index % palette.length] }} />
                {piece.name}
              </button>
              <div className="piece-order">
                <button
                  aria-label={"Move " + piece.name + " up"}
                  disabled={busy || index === 0 || project.stale}
                  onClick={() => run(() => movePiece(index, -1))}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  aria-label={"Move " + piece.name + " down"}
                  disabled={
                    busy || index === project.pieces.length - 1 || project.stale
                  }
                  onClick={() => run(() => movePiece(index, 1))}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  aria-label={"Delete " + piece.name}
                  disabled={busy || project.stale}
                  onClick={() => setPendingDelete(piece.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {selectedId === piece.id && (
              <input
                key={piece.name}
                aria-label="Piece name"
                defaultValue={piece.name}
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name && name !== piece.name)
                    run(() => updatePiece(piece, { name }));
                }}
              />
            )}
            <select
              aria-label={"Rendering for " + piece.name}
              disabled={busy || project.stale}
              value={piece.mode}
              onChange={(e) =>
                run(() => updatePiece(piece, { mode: e.target.value }))
              }
            >
              <option value="mosaic">Mosaic</option>
              <option value="original">Keep original</option>
            </select>
            {piece.mode === "mosaic" && (
              <GroupPicker
                groups={groups}
                chosen={piece.groups}
                disabled={busy || project.stale}
                onChange={(ids) =>
                  run(() => updatePiece(piece, { groups: ids }))
                }
              />
            )}
            {piece.mode === "mosaic" && (
              <PieceSettings
                sources={project.pieces}
                name={piece.name}
                settings={piece}
                defaults={defaults}
                disabled={busy || project.stale}
                onSave={async (settings) => {
                  await api("/pieces/" + piece.id, "PATCH", {
                    projectId: project.id,
                    ...settings,
                  });
                  await refresh();
                  await onChange();
                }}
              />
            )}
            <button
              className="text-button mt-2"
              onClick={() => switchPiece(piece.id)}
            >
              Edit selection
            </button>
          </article>
        ))}
        <article className="piece-card remainder-card">
          <h4>Everything else</h4>
          <p className="muted text-xs">All pixels outside your named pieces.</p>
          <select
            aria-label="Rendering for Everything else"
            value={project.remainder_mode}
            disabled={busy || project.stale}
            onChange={(e) =>
              run(async () => {
                await api("/project/options", "POST", {
                  projectId: project.id,
                  mode: e.target.value,
                });
                await refresh();
                await onChange();
              })
            }
          >
            <option value="original">Keep original</option>
            <option value="mosaic">Mosaic</option>
          </select>
          {project.remainder_mode === "mosaic" && (
            <GroupPicker
              groups={groups}
              chosen={project.remainder_groups}
              disabled={busy || project.stale}
              onChange={(ids) =>
                run(async () => {
                  await api("/project/options", "POST", {
                    projectId: project.id,
                    groups: ids,
                  });
                  await refresh();
                  await onChange();
                })
              }
            />
          )}
          {project.remainder_mode === "mosaic" && (
            <PieceSettings
              sources={project.pieces}
              name="Everything else"
              settings={{
                columns: project.remainder_columns,
                variety: project.remainder_variety,
                blend: project.remainder_blend,
                effect: project.remainder_effect,
              }}
              defaults={defaults}
              disabled={busy || project.stale}
              onSave={async (settings) => {
                await api("/project/options", "POST", {
                  projectId: project.id,
                  ...settings,
                });
                await refresh();
                await onChange();
              }}
            />
          )}
        </article>
        <button
          className="primary w-full justify-center mt-4"
          onClick={onChoosePortrait}
        >
          Preview mosaic
        </button>
      </aside>
    </>
  );
}
