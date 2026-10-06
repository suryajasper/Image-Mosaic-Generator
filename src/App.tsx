import { AppLayout } from "./components/AppLayout";
import { Modal } from "./components/Modal";
import { usePhotoLibrary } from "./hooks/usePhotoLibrary";
import { useMosaicStudio } from "./hooks/useMosaicStudio";
import { PhotoLibrary } from "./library/PhotoLibrary";
import { PortraitPanel } from "./studio/PortraitPanel";
import { StudioDefaults } from "./studio/StudioDefaults";
import { ExportPanel } from "./studio/ExportPanel";
import { MosaicPreview } from "./studio/MosaicPreview";
import { PhotoUsage } from "./studio/PhotoUsage";
import { useEffect, useState } from "react";

import { ArrowRight, X, SlidersHorizontal } from "lucide-react";

import { api } from "./api";

import { PieceSettings } from "./PieceSettings";
import { PieceEditor } from "./PieceEditor";

import { CropEditor } from "./components/CropEditor";
export function App() {
  const [page, setPage] = useState<"photos" | "pieces" | "mosaic">("photos");
  const [pieceDirty, setPieceDirty] = useState(false);
  const [pendingPage, setPendingPage] = useState<
    "photos" | "pieces" | "mosaic" | null
  >(null);
  useEffect(() => {
    if (pendingPage && !pieceDirty) {
      setPage(pendingPage);
      setPendingPage(null);
    }
  }, [pendingPage, pieceDirty]);
  function goToPage(next: "photos" | "pieces" | "mosaic") {
    if (page === "pieces" && pieceDirty && next !== "pieces")
      setPendingPage(next);
    else setPage(next);
  }
  const libraryController = usePhotoLibrary(page);
  const {
    library,
    tuningProject,
    hasPieces,
    target,
    setTarget,
    portraitFolder,
    setPortraitFolder,
    portraitOptions,
    conversion,
    setConversion,
    error,
    setError,
    notice,
    setNotice,
    busy,
    editing,
    setEditing,
    cropPreviewPixels,
    changeCropPreviewPixels,
    preparingBackground,
    setPreparingBackground,
    conversionProgress,
    setConversionProgress,
    targetVersion,
    refresh,
    action,
    scan,
    choosePortrait,
    selected,
    savePhoto,
  } = libraryController;
  const {
    columns,
    setColumns,
    variety,
    setVariety,
    tint,
    setTint,
    setSeed,
    mosaic,
    generating,
    zoom,
    setZoom,
    exportSize,
    setExportSize,
    exporting,
    setExporting,
    savedExport,
    setSavedExport,
    canvas,
    viewport,
    previewCard,
    isFullScreen,
    toggleFullScreen,
    draw,
    sharpenTiles,
  } = useMosaicStudio({ page, library, hasPieces, setError });
  const used = mosaic?.counts.filter((n) => n > 0).length || 0;
  const percent = mosaic?.ids.length
    ? Math.round((used / mosaic.ids.length) * 100)
    : 0;
  return (
    <AppLayout
      page={page}
      onNavigate={goToPage}
      photoCount={library.photos.length}
    >
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {page === "photos" ? (
        <PhotoLibrary controller={libraryController} />
      ) : page === "pieces" ? (
        <PieceEditor
          groups={library.groups}
          target={library.target}
          backgroundReady={library.backgroundReady}
          onChange={refresh}
          onDirtyChange={setPieceDirty}
          defaults={{ columns, variety, blend: tint }}
          onChoosePortrait={() => goToPage("mosaic")}
        />
      ) : (
        <div className="studio">
          <div className="studio-main">
            <MosaicPreview
              previewCard={previewCard}
              isFullScreen={isFullScreen}
              generating={generating}
              mosaic={mosaic}
              viewport={viewport}
              zoom={zoom}
              canvas={canvas}
              setZoom={setZoom}
              toggleFullScreen={toggleFullScreen}
            />
            <PhotoUsage
              mosaic={mosaic}
              used={used}
              selected={selected}
              percent={percent}
              library={library}
              setEditing={setEditing}
            />
          </div>
          <aside className="studio-controls">
            {hasPieces && tuningProject && (
              <section className="control-card piece-studio-controls">
                <h3>
                  <SlidersHorizontal size={18} />
                  Piece settings
                </h3>
                {tuningProject.pieces
                  .filter((piece) => piece.mode === "mosaic")
                  .map((piece, index) => (
                    <details
                      className="piece-studio-setting"
                      key={piece.id}
                      open={index === 0}
                    >
                      <summary>{piece.name}</summary>
                      <PieceSettings
                        sources={tuningProject.pieces}
                        name={piece.name}
                        settings={piece}
                        defaults={{ columns, variety, blend: tint }}
                        onSave={async (settings) => {
                          await api("/pieces/" + piece.id, "PATCH", {
                            projectId: tuningProject.id,
                            ...settings,
                          });
                          await refresh();
                        }}
                      />
                    </details>
                  ))}
                {tuningProject.remainder_mode === "mosaic" && (
                  <details
                    className="piece-studio-setting"
                    open={
                      !tuningProject.pieces.some(
                        (piece) => piece.mode === "mosaic",
                      )
                    }
                  >
                    <summary>Everything else</summary>
                    <PieceSettings
                      sources={tuningProject.pieces}
                      name="Everything else"
                      settings={{
                        columns: tuningProject.remainder_columns,
                        variety: tuningProject.remainder_variety,
                        blend: tuningProject.remainder_blend,
                        effect: tuningProject.remainder_effect,
                      }}
                      defaults={{ columns, variety, blend: tint }}
                      onSave={async (settings) => {
                        await api("/project/options", "POST", {
                          projectId: tuningProject.id,
                          ...settings,
                        });
                        await refresh();
                      }}
                    />
                  </details>
                )}
              </section>
            )}
            <PortraitPanel
              library={library}
              targetVersion={targetVersion}
              goToPage={goToPage}
              hasPieces={hasPieces}
              busy={busy}
              generating={generating}
              action={action}
              refresh={refresh}
              preparingBackground={preparingBackground}
              setPreparingBackground={setPreparingBackground}
              choosePortrait={choosePortrait}
              target={target}
              setTarget={setTarget}
              scan={scan}
              portraitFolder={portraitFolder}
              setPortraitFolder={setPortraitFolder}
              portraitOptions={portraitOptions}
            />
            <StudioDefaults
              hasPieces={hasPieces}
              columns={columns}
              setColumns={setColumns}
              variety={variety}
              setVariety={setVariety}
              tint={tint}
              setTint={setTint}
              generating={generating}
              setSeed={setSeed}
            />
            <ExportPanel
              exportSize={exportSize}
              setExportSize={setExportSize}
              mosaic={mosaic}
              generating={generating}
              exporting={exporting}
              setExporting={setExporting}
              sharpenTiles={sharpenTiles}
              draw={draw}
              setSavedExport={setSavedExport}
              setNotice={setNotice}
              setError={setError}
              savedExport={savedExport}
            />
          </aside>
        </div>
      )}
      {pendingPage && (
        <Modal
          className="conversion-modal"
          label="Unsaved portrait selection"
          onClose={() => setPendingPage(null)}
        >
          <h2>Unsaved selection</h2>
          <p className="muted">
            Save your selection in Portrait pieces before leaving, or discard
            these edits.
          </p>
          <div className="flex gap-3 mt-5">
            <button className="primary" onClick={() => setPendingPage(null)}>
              Keep editing
            </button>
            <button
              className="secondary"
              onClick={() => {
                setPieceDirty(false);
                setPage(pendingPage);
                setPendingPage(null);
              }}
            >
              Discard & continue
            </button>
          </div>
        </Modal>
      )}
      {conversion && (
        <Modal className="conversion-modal" label="Convert HEIC photos">
          <span className="eyebrow">KEEP EVERY MEMORY</span>
          <h2>
            Convert {conversion.files.length} HEIC{" "}
            {conversion.files.length === 1 ? "photo" : "photos"}?
          </h2>
          <p className="muted text-sm">
            These photos need JPEG copies to use in the mosaic. Conversion
            happens entirely on your computer. Your originals stay untouched;
            copies are kept in this project’s local cache and reused on future
            scans.
          </p>
          {error && (
            <p className="error p-3 mt-3 rounded text-sm" role="alert">
              {error}
            </p>
          )}
          <div className="conversion-list">
            {conversion.files.map((p) => (
              <div key={p}>{p.split("/").pop()}</div>
            ))}
          </div>
          <div className="flex justify-between gap-3">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                const c = conversion;
                setConversion(null);
                if (c.endpoint === "/import")
                  action(() => scan(c.path, c.endpoint, false, true));
              }}
            >
              Skip for now
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  const c = conversion;
                  setConversionProgress(0);
                  for (const [index, path] of c.files.entries()) {
                    await api("/convert", "POST", { paths: [path] });
                    setConversionProgress(index + 1);
                  }
                  setConversion(null);
                  if (c.endpoint === "/target") await choosePortrait(c.path);
                  else await scan(c.path, c.endpoint, true);
                })
              }
            >
              {busy
                ? `Converting ${conversionProgress}/${conversion.files.length}…`
                : "Convert to JPEG"}
              <ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
      {editing && (
        <CropEditor
          photo={editing}
          onClose={() => setEditing(null)}
          onSave={savePhoto}
          previewPixels={cropPreviewPixels}
          onPreviewPixelsChange={changeCropPreviewPixels}
        />
      )}
    </AppLayout>
  );
}
