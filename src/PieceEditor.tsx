import { ZoomControls, fitCanvasZoom } from "./components/ZoomControls";
import { usePieceEditor } from "./hooks/usePieceEditor";
import type { PieceEditorProps } from "./pieces/editor-types";

import { Modal } from "./components/Modal";
import { PieceList } from "./pieces/PieceList";
import { SelectionTools } from "./pieces/SelectionTools";

import { Save, Eye, Scissors } from "lucide-react";
import { api } from "./api";

export function PieceEditor(props: PieceEditorProps) {
  const {
    groups,
    target,
    backgroundReady,
    onChange,
    onChoosePortrait,
    defaults,
  } = props;
  const {
    project,
    selectedId,
    setSelectedId,
    tool,
    setTool,
    brush,
    setBrush,
    zoom,
    setZoom,
    showOverlay,
    setShowOverlay,
    dirty,
    busy,
    error,
    setError,
    notice,
    points,
    setPoints,
    box,
    setBox,
    suggestions,
    setSuggestions,
    candidate,
    setCandidate,
    suggestionMask,
    setSuggestionMask,
    pendingSelection,
    setPendingSelection,
    pendingDelete,
    setPendingDelete,
    display,
    viewport,
    draft,
    history,
    drag,
    requestVersion,
    refresh,
    run,
    checkpoint,
    undo,
    down,
    move,
    save,
    switchPiece,
    updatePiece,
    movePiece,
    rerender,
    selected,
    setNotice,
    setDirty,
  } = usePieceEditor(props);
  if (!target)
    return (
      <section className="empty-library">
        <Scissors size={36} />
        <h2>Choose a portrait first</h2>
        <p>Your named pieces will be saved with that portrait.</p>
        <button className="primary mt-5" onClick={onChoosePortrait}>
          Choose portrait
        </button>
      </section>
    );
  if (!project)
    return <p className="muted">{error || "Loading your portrait pieces…"}</p>;
  return (
    <div className="pieces-workspace">
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button
            aria-label="Dismiss selection error"
            onClick={() => setError("")}
          >
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      {project.stale && (
        <div className="alert error">
          <div>
            The portrait file changed. Choose whether to reset its pieces or
            resize and reuse their masks.
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("/project/reset", "POST", {
                  projectId: project.id,
                  reuse: true,
                });
                await refresh();
                await onChange();
              })
            }
          >
            Reuse masks
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("/project/reset", "POST", {
                  projectId: project.id,
                  reuse: false,
                });
                await refresh();
                await onChange();
              })
            }
          >
            Reset pieces
          </button>
        </div>
      )}
      <div className="pieces-layout">
        <section className="piece-editor-card">
          <div className="piece-editor-heading">
            <div>
              <span className="eyebrow">PORTRAIT SELECTION</span>
              <h3>{selected?.name || "Create your first piece"}</h3>
            </div>
            <div className="flex items-center gap-3">
              <span className="muted text-xs">
                {dirty ? "Unsaved selection" : "Saved locally"}
              </span>
              {selected && (
                <button
                  className="primary"
                  disabled={!dirty || busy || project.stale}
                  onClick={() => run(save)}
                >
                  <Save size={15} />
                  Save changes
                </button>
              )}
            </div>
          </div>
          <SelectionTools
            tool={tool}
            selected={selected}
            busy={busy}
            project={project}
            setTool={setTool}
            history={history}
            undo={undo}
            brush={brush}
            setBrush={setBrush}
          />
          <div className="piece-viewport" ref={viewport}>
            <div
              className="piece-canvas-wrap"
              style={{ width: `${zoom * 100}%` }}
            >
              <canvas
                aria-label="Portrait selection canvas"
                style={{ cursor: tool === "pan" ? "grab" : "crosshair" }}
                ref={display}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                onLostPointerCapture={() => {
                  drag.current = null;
                }}
              />
            </div>
          </div>
          <div className="piece-editor-footer">
            <button
              className="text-button"
              onClick={() => setShowOverlay((v) => !v)}
            >
              <Eye size={16} />
              {showOverlay ? "Hide overlays" : "Show overlays"}
            </button>
            <ZoomControls
              portrait
              maximum={5}
              zoom={zoom}
              onChange={setZoom}
              onFit={() => {
                setZoom(
                  fitCanvasZoom(
                    viewport.current,
                    project.height / project.width,
                  ),
                );
                viewport.current?.scrollTo(0, 0);
              }}
            />
          </div>
          {selected && (
            <div className="selection-actions">
              <div className="smart-controls">
                <button
                  className="secondary"
                  disabled={
                    busy ||
                    project.stale ||
                    !project.selectionReady ||
                    (!points.length && !box)
                  }
                  onClick={() =>
                    run(async () => {
                      const version = ++requestVersion.current;
                      const result = await api<{
                        masks: string[];
                        timings: { promptSeconds: number };
                      }>("/project/select", "POST", {
                        projectId: project.id,
                        points,
                        box,
                      });
                      if (version !== requestVersion.current) return;
                      setSuggestions(result.masks);
                      setCandidate(0);
                      setNotice(
                        "Review the suggested boundary, then apply it to your piece.",
                      );
                    })
                  }
                >
                  <Scissors size={16} />
                  {busy ? "Working…" : "Suggest selection"}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setPoints([]);
                    setBox(null);
                    setSuggestions([]);
                    setSuggestionMask(null);
                    requestVersion.current++;
                  }}
                >
                  Clear points & box
                </button>
              </div>
              {suggestions.length > 0 && (
                <div className="suggestion-actions">
                  <span>
                    Suggestion {candidate + 1} / {suggestions.length}
                  </span>
                  <button
                    className="secondary"
                    onClick={() =>
                      setCandidate((v) => (v + 1) % suggestions.length)
                    }
                  >
                    Try alternative
                  </button>
                  <button
                    className="primary"
                    disabled={!suggestionMask}
                    onClick={() => {
                      checkpoint();
                      draft
                        .current!.getContext("2d")!
                        .drawImage(
                          suggestionMask!,
                          0,
                          0,
                          project.width,
                          project.height,
                        );
                      setDirty(true);
                      setSuggestions([]);
                      setSuggestionMask(null);
                      rerender();
                    }}
                  >
                    Apply selection
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSuggestions([]);
                      setSuggestionMask(null);
                    }}
                  >
                    Discard suggestion
                  </button>
                </div>
              )}
              <div className="save-selection">
                <span className="muted text-xs">
                  {tool === "paint" || tool === "erase"
                    ? "Paint to refine the boundary. Zoom for small details."
                    : "Add points inside the piece and exclusion points outside. A box can narrow the selection."}
                </span>
                <button
                  className="primary"
                  disabled={!dirty || busy || project.stale}
                  onClick={() => run(save)}
                >
                  <Save size={16} />
                  Save selection
                </button>
              </div>
            </div>
          )}
          {!project.selectionReady && (
            <div className="selection-setup">
              <strong>Enable local smart selection</strong>
              <p className="muted text-sm">
                The manual brush works now. Smart selection needs a one-time 39
                MB model download; your photos stay on this computer.
              </p>
              {project.selectionAvailable ? (
                <button
                  className="secondary mt-3"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("/selection/setup", "POST", {});
                      await refresh();
                    })
                  }
                >
                  Prepare smart selection
                </button>
              ) : (
                <code>
                  .venv/bin/python -m pip install -r requirements-selection.txt
                </code>
              )}
            </div>
          )}
        </section>
        <PieceList
          busy={busy}
          project={project}
          run={run}
          refresh={refresh}
          dirty={dirty}
          setPendingSelection={setPendingSelection}
          setSelectedId={setSelectedId}
          onChange={onChange}
          backgroundReady={backgroundReady}
          selectedId={selectedId}
          switchPiece={switchPiece}
          movePiece={movePiece}
          setPendingDelete={setPendingDelete}
          updatePiece={updatePiece}
          groups={groups}
          defaults={defaults}
          onChoosePortrait={onChoosePortrait}
        />
      </div>
      {pendingSelection && (
        <Modal
          className="conversion-modal"
          label="Unsaved selection"
          onClose={() => setPendingSelection(null)}
        >
          <h2>Save this selection?</h2>
          <p className="muted">You have unsaved brush or selection changes.</p>
          <div className="flex gap-3 mt-5">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await save();
                  setSelectedId(pendingSelection);
                  setPendingSelection(null);
                })
              }
            >
              Save & switch
            </button>
            <button
              className="secondary"
              onClick={() => {
                setDirty(false);
                setSelectedId(pendingSelection);
                setPendingSelection(null);
              }}
            >
              Discard & switch
            </button>
            <button
              className="text-button"
              onClick={() => setPendingSelection(null)}
            >
              Stay here
            </button>
          </div>
        </Modal>
      )}
      {pendingDelete && (
        <Modal
          className="conversion-modal"
          label="Delete portrait piece"
          onClose={() => setPendingDelete(null)}
        >
          <h2>Delete this piece?</h2>
          <p className="muted">
            Its pixels will belong to the remaining pieces or Everything else.
            The original portrait stays untouched.
          </p>
          <div className="flex gap-3 mt-5">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api("/pieces/" + pendingDelete, "DELETE", {
                    projectId: project.id,
                  });
                  if (pendingDelete === selectedId) setDirty(false);
                  setPendingDelete(null);
                  await refresh();
                  await onChange();
                })
              }
            >
              Delete piece
            </button>
            <button
              className="secondary"
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
