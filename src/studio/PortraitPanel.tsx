import React from "react";

import { ArrowRight, ImagePlus, SlidersHorizontal } from "lucide-react";

import { api } from "../api";

import type { Library } from "../types";

type Props = {
  library: Library;
  targetVersion: number;
  goToPage: (next: "photos" | "pieces" | "mosaic") => void;
  hasPieces: boolean;
  busy: boolean;
  generating: boolean;
  action: (fn: () => Promise<unknown>) => Promise<void>;
  refresh: () => Promise<void>;
  preparingBackground: boolean;
  setPreparingBackground: React.Dispatch<React.SetStateAction<boolean>>;
  choosePortrait: (path: string) => Promise<void>;
  target: string;
  setTarget: React.Dispatch<React.SetStateAction<string>>;
  scan: (
    path: string,
    endpoint?: string,
    convert?: boolean,
    skipHeic?: boolean,
  ) => Promise<boolean>;
  portraitFolder: string;
  setPortraitFolder: React.Dispatch<React.SetStateAction<string>>;
  portraitOptions: { id: string; name: string; path: string }[];
};
export function PortraitPanel({
  library,
  targetVersion,
  goToPage,
  hasPieces,
  busy,
  generating,
  action,
  refresh,
  preparingBackground,
  setPreparingBackground,
  choosePortrait,
  target,
  setTarget,
  scan,
  portraitFolder,
  setPortraitFolder,
  portraitOptions,
}: Props) {
  return (
    <>
      <section className="control-card">
        <h3>
          <ImagePlus size={18} />
          The main portrait
        </h3>
        {library.target && (
          <img
            className="target-preview"
            src={"/api/target/image?v=" + targetVersion + ""}
            alt="Main portrait"
          />
        )}
        <button
          className="secondary w-full justify-center mb-4"
          onClick={() => goToPage("pieces")}
        >
          <SlidersHorizontal size={16} />
          {hasPieces ? "Edit portrait pieces" : "Split into portrait pieces"}
        </button>
        {hasPieces && (
          <p className="control-tip mb-4">
            Your named pieces control mosaic areas and photo groups.
          </p>
        )}
        {!hasPieces && (
          <div className="foreground-control">
            <label
              className="block text-sm font-medium mb-2"
              htmlFor="mosaic-region"
            >
              Mosaic area
            </label>
            <select
              id="mosaic-region"
              className="w-full"
              value={library.mosaicRegion}
              disabled={busy || generating || !library.target}
              onChange={(e) => {
                const mosaicRegion = e.target.value;
                action(async () => {
                  await api("/target/options", "POST", {
                    mosaicRegion,
                  });
                  await refresh();
                });
              }}
            >
              <option value="all">Whole portrait</option>
              <option value="foreground" disabled={!library.backgroundReady}>
                Foreground only
              </option>
              <option value="background" disabled={!library.backgroundReady}>
                Background only
              </option>
            </select>
            {library.mosaicRegion !== "all" && (
              <p className="muted text-xs mt-3">
                {library.mosaicRegion === "foreground"
                  ? "Keep the original background."
                  : "Keep the original person."}
              </p>
            )}
            {!library.backgroundReady && (
              <>
                <p className="muted text-xs mt-3">
                  One-time setup downloads a local model (about 176 MB). Photo
                  processing then works offline; no photos are sent.
                </p>
                <button
                  className="secondary w-full justify-center mt-3"
                  disabled={
                    busy || preparingBackground || !library.backgroundAvailable
                  }
                  onClick={() =>
                    action(async () => {
                      setPreparingBackground(true);
                      try {
                        await api("/background/setup", "POST", {});
                        await refresh();
                      } finally {
                        setPreparingBackground(false);
                      }
                    })
                  }
                >
                  {preparingBackground
                    ? "Preparing local model…"
                    : "Prepare background removal"}
                </button>
                {!library.backgroundAvailable && (
                  <p className="muted text-xs mt-3">
                    Install optional dependencies using
                    requirements-background.txt to enable this feature.
                  </p>
                )}
              </>
            )}
            {library.foreground && (
              <p className="muted text-xs mt-3">
                Only tiles in the selected area count toward photo usage. Fine
                edges are clipped to the portrait silhouette.
              </p>
            )}
          </div>
        )}
        <p className="muted text-sm mb-3">
          A clear portrait works beautifully. This image sets the shape and
          colors.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action(async () => {
              await choosePortrait(target);
            });
          }}
        >
          <input
            className="full-input"
            aria-label="Local portrait path"
            placeholder="/Users/you/Pictures/portrait.jpg"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <button
            disabled={busy || !target}
            className="secondary w-full justify-center mt-3"
          >
            {busy
              ? "Opening…"
              : library.target
                ? "Update portrait"
                : "Open portrait"}
            <ArrowRight size={15} />
          </button>
        </form>
        <div className="portrait-folder">
          <label className="slider-label">Or choose from a folder</label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action(() => scan(portraitFolder, "/portraits"));
            }}
          >
            <input
              className="full-input mt-2"
              aria-label="Portrait folder path"
              placeholder="/Users/you/Pictures/Portraits"
              value={portraitFolder}
              onChange={(e) => setPortraitFolder(e.target.value)}
            />
            <button className="text-button mt-3" disabled={busy}>
              Browse portraits <ArrowRight size={14} />
            </button>
          </form>
          {portraitOptions.length > 0 && (
            <div className="portrait-options">
              {portraitOptions.map((p) => (
                <button
                  key={p.id}
                  disabled={busy}
                  title={p.name}
                  aria-label={"Use " + p.name + " as portrait"}
                  onClick={() => action(() => choosePortrait(p.path))}
                >
                  <img src={"/api/portraits/" + p.id + "/image"} alt={p.name} />
                </button>
              ))}
            </div>
          )}
          <p className="muted text-xs mt-3">
            You can also select “Use as portrait” on any library photo.
          </p>
        </div>
      </section>
    </>
  );
}
