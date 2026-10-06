import {
  Images,
  ShieldCheck,
  FolderOpen,
  ArrowRight,
  Check,
  RefreshCw,
  Search,
} from "lucide-react";

import { api } from "../api";

import { photoURL } from "../images";

import type { PhotoLibraryController } from "../hooks/usePhotoLibrary";
export function PhotoLibrary({
  controller,
}: {
  controller: PhotoLibraryController;
}) {
  const {
    action,
    scan,
    folder,
    groupName,
    setGroupName,
    setFolder,
    busy,
    groupFilter,
    setGroupFilter,
    library,
    refresh,
    setNotice,
    selected,
    filter,
    setFilter,
    groupPhotos,
    groupSelected,
    search,
    setSearch,
    shown,
    setEditing,
    savePhoto,
    choosePortrait,
  } = controller;
  return (
    <>
      <>
        <section className="folder-card">
          <div className="folder-symbol">
            <FolderOpen size={26} strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <h3>Add a photo group</h3>
            <p>
              Photos stay where they are. We only remember your selections and
              crops.
            </p>
            <form
              className="path-form"
              onSubmit={(e) => {
                e.preventDefault();
                action(async () => {
                  await scan(folder);
                });
              }}
            >
              <input
                aria-label="New group name"
                placeholder="Group name (optional)"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="group-name-input"
              />
              <input
                aria-label="Local photo folder"
                placeholder="/Users/you/Pictures/Family memories"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
              />
              <button className="secondary" disabled={busy || !folder}>
                <FolderOpen size={16} />
                {busy ? "Reading folder…" : "Add / scan group"}
              </button>
            </form>
            <small>
              JPG, PNG & local HEIC conversion · Includes subfolders · Paste a
              local folder path
            </small>
          </div>
        </section>
        <section className="group-manager" aria-label="Photo groups">
          <button
            className={groupFilter === "all" ? "group-all active" : "group-all"}
            onClick={() => setGroupFilter("all")}
          >
            <Images size={17} /> All groups{" "}
            <strong>{library.groups.length}</strong>
          </button>
          <div className="group-cards">
            {library.groups.map((group) => (
              <article
                key={group.id}
                className={
                  groupFilter === group.id ? "group-card active" : "group-card"
                }
              >
                <button
                  className="group-select"
                  onClick={() => setGroupFilter(group.id)}
                  aria-label={"Show group " + group.name}
                >
                  <FolderOpen size={19} />
                  {group.name}
                </button>
                <input
                  key={group.name}
                  aria-label={"Rename group " + group.name}
                  defaultValue={group.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== group.name)
                      action(async () => {
                        await api("/groups/" + group.id, "PATCH", {
                          name,
                        });
                        await refresh();
                      });
                  }}
                />
                <small title={group.path}>{group.path}</small>
                <span>
                  {group.status === "unavailable"
                    ? "Folder unavailable · edits saved"
                    : `${group.photoCount} photos · ${group.selectedCount} selected`}
                </span>
                <div className="flex gap-3 mt-2">
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => action(() => scan(group.path))}
                  >
                    <RefreshCw size={13} /> Scan
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await api("/groups/" + group.id, "DELETE");
                        setGroupFilter("all");
                        await refresh();
                        setNotice(
                          "Group removed. Photos and saved corrections are kept; add its folder to restore it.",
                        );
                      })
                    }
                  >
                    Remove group
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
        <div className="library-summary">
          <div>
            <strong>{library.photos.length}</strong> photos in your library{" "}
            <span className="divider" />
            <span className="selected-text">
              <Check size={14} />
              {selected.length} selected for your mosaic
            </span>
          </div>
          <span className="muted text-sm">Click a photo to crop & rotate</span>
        </div>
        <div className="library-toolbar">
          <div className="tabs">
            {[
              ["all", "All photos"],
              ["selected", "Selected"],
              ["excluded", "Excluded"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? "chosen" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <button
              className="text-button"
              disabled={busy || !groupPhotos.length}
              onClick={() =>
                action(async () => {
                  await api("/selection", "POST", {
                    selected: groupSelected.length !== groupPhotos.length,
                    ids: groupPhotos.map((p) => p.id),
                  });
                  await refresh();
                })
              }
            >
              {groupSelected.length === groupPhotos.length && groupPhotos.length
                ? "Deselect all"
                : "Select all"}
            </button>
            <label className="search">
              <Search size={16} />
              <input
                aria-label="Search photos"
                placeholder="Find a photo…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
        </div>
        {!library.photos.length ? (
          <div className="empty-library">
            <div className="empty-illustration">
              <span />
              <span />
              <span />
              <Images size={40} strokeWidth={1.2} />
            </div>
            <h2>A lifetime of memories starts here</h2>
            <p>
              Open a folder of photos of him with your family and friends.
              <br />
              Then choose and frame the moments you’d like to include.
            </p>
            <span className="empty-step">
              01 <span>ADD YOUR PHOTOS</span>
              <ArrowRight size={15} /> 02 <span>CREATE YOUR MOSAIC</span>
            </span>
          </div>
        ) : (
          <div className="photo-grid">
            {shown.map((p) => (
              <article
                key={p.id}
                className={`photo-card ${p.selected ? "" : "excluded"}`}
              >
                <button
                  className="photo-open"
                  onClick={() => setEditing(p)}
                  aria-label={"Crop " + p.name}
                >
                  <img src={photoURL(p)} loading="lazy" alt={p.name} />
                  <span className="edit-hover">Adjust crop</span>
                </button>
                <button
                  className={"photo-check " + (p.selected ? "checked" : "")}
                  disabled={busy}
                  aria-label={(p.selected ? "Exclude " : "Include ") + p.name}
                  aria-pressed={!!p.selected}
                  onClick={() =>
                    action(() =>
                      savePhoto({ ...p, selected: p.selected ? 0 : 1 }),
                    )
                  }
                >
                  {!!p.selected && <Check size={15} />}
                </button>
                <button
                  className="portrait-choice"
                  onClick={() => action(() => choosePortrait(p.path))}
                  disabled={busy}
                >
                  Use as portrait
                </button>
                <div className="photo-caption">
                  <span title={p.path}>{p.name}</span>
                  {(p.rotation !== 0 ||
                    p.size !== 1 ||
                    p.x !== 0.5 ||
                    p.y !== 0.5) && <span className="edited-tag">Edited</span>}
                </div>
              </article>
            ))}
          </div>
        )}
        {library.photos.length > 0 && !shown.length && (
          <p className="empty-result">No photos match this view.</p>
        )}
        <div className="bottom-note">
          <ShieldCheck size={16} /> Your original photos are always preserved.
          Edits are saved locally and can be changed anytime.
        </div>
      </>
    </>
  );
}
