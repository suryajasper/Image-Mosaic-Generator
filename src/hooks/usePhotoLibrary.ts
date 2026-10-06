import { useEffect, useState } from "react";
import { api } from "../api";
import type { Library, Photo, Scan } from "../types";
import type { TuningProject } from "../PieceSettings";
export function usePhotoLibrary(page: string) {
  const [library, setLibrary] = useState<Library>({
    photos: [],
    groups: [],
    folder: "",
    target: null,
    foreground: false,
    mosaicRegion: "all",
    backgroundReady: false,
    backgroundAvailable: false,
  });
  const [groupFilter, setGroupFilter] = useState("all");
  const [groupName, setGroupName] = useState("");
  const [tuningProject, setTuningProject] = useState<TuningProject | null>(
    null,
  );
  const [hasPieces, setHasPieces] = useState(false);
  const [folder, setFolder] = useState("");
  const [target, setTarget] = useState("");
  const [portraitFolder, setPortraitFolder] = useState("");
  const [portraitOptions, setPortraitOptions] = useState<
    { id: string; name: string; path: string }[]
  >([]);
  const [conversion, setConversion] = useState<{
    path: string;
    endpoint: string;
    files: string[];
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Photo | null>(null);
  const [cropPreviewPixels, setCropPreviewPixels] = useState(() => {
    try {
      const stored = Number(
        localStorage.getItem("memory-mosaic.crop-preview-pixels"),
      );
      return Number.isInteger(stored) && stored >= 16 && stored <= 256
        ? stored
        : 120;
    } catch {
      return 120;
    }
  });
  function changeCropPreviewPixels(pixels: number) {
    setCropPreviewPixels(pixels);
    try {
      localStorage.setItem("memory-mosaic.crop-preview-pixels", String(pixels));
    } catch {
      /* Still shared across photos in this session. */
    }
  }

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [preparingBackground, setPreparingBackground] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [targetVersion, setTargetVersion] = useState(0);
  async function refresh() {
    const lib = await api<Library>("/library");
    setLibrary(lib);
    if (lib.folder) setFolder(lib.folder);
    setTarget(lib.target || "");
    if (lib.target) {
      const project = await api<TuningProject>("/project");
      setTuningProject(project);
      setHasPieces(!!project.enabled);
    } else {
      setHasPieces(false);
      setTuningProject(null);
    }
    if (lib.target)
      setPortraitFolder(
        (previous) =>
          previous || lib.target!.slice(0, lib.target!.lastIndexOf("/")),
      );
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function scan(
    path: string,
    endpoint = "/import",
    convert = false,
    skipHeic = false,
  ) {
    const result = await api<Scan>(endpoint, "POST", {
      path,
      convert,
      skipHeic,
      name: endpoint === "/import" ? groupName || undefined : undefined,
    });
    if (result.needsConversion) {
      setConversion({ path, endpoint, files: result.needsConversion });
      return false;
    }
    if (endpoint === "/portraits") {
      setPortraitOptions(result.options || []);
      setNotice(
        `Found ${result.options?.length || 0} portrait options.${result.skipped.length ? " Some unreadable photos were skipped." : ""}`,
      );
    } else {
      await refresh();
      setNotice(
        `Group updated: ${result.imported} photos.${result.unavailable ? " Folder unavailable; saved edits are retained." : ""}${result.skipped.length ? " Skipped unreadable files: " + result.skipped.join(", ") : ""}`,
      );
    }
    return true;
  }
  async function choosePortrait(path: string) {
    const result = await api<{ needsConversion?: string[] }>(
      "/target",
      "POST",
      { path },
    );
    if (result.needsConversion) {
      setConversion({
        path,
        endpoint: "/target",
        files: result.needsConversion,
      });
      return;
    }
    setTargetVersion((v) => v + 1);
    await refresh();
    setNotice("Main portrait updated.");
  }
  // Rescan saved folder on return to the app. Unchanged files require only a stat check.
  useEffect(() => {
    const rescan = () => {
      if (
        library.groups.length &&
        !busy &&
        !conversion &&
        !editing &&
        page === "photos"
      )
        action(async () => {
          for (const group of library.groups) {
            if (!(await scan(group.path))) break;
          }
        });
    };
    window.addEventListener("focus", rescan);
    return () => window.removeEventListener("focus", rescan);
  }, [library.groups, busy, conversion, editing, page]);
  const selected = library.photos.filter((p) => p.selected);
  const groupPhotos = library.photos.filter(
    (p) => groupFilter === "all" || p.groups.includes(groupFilter),
  );
  const groupSelected = groupPhotos.filter((p) => p.selected);
  const shown = groupPhotos.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" || (filter === "selected" ? p.selected : !p.selected)),
  );
  async function savePhoto(p: Photo) {
    await api("/photos/" + p.id, "PATCH", p);
    await refresh();
  }
  return {
    library,
    groupFilter,
    setGroupFilter,
    groupName,
    setGroupName,
    tuningProject,
    hasPieces,
    folder,
    setFolder,
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
    search,
    setSearch,
    filter,
    setFilter,
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
    groupPhotos,
    groupSelected,
    shown,
    savePhoto,
  };
}
export type PhotoLibraryController = ReturnType<typeof usePhotoLibrary>;
