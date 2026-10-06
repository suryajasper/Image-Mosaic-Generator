import { useEffect, useRef, useState } from "react";

import { EffectSettings } from "./EffectSettings";
import { type PieceEffect } from "./piece-effects";

export type PieceTuning = {
  effect?: PieceEffect | null;
  columns: number | null;
  variety: number | null;
  blend: number | null;
};
export type StudioDefaults = {
  columns: number;
  variety: number;
  blend: number;
};
export type TuningProject = {
  id: string;
  enabled: number;
  pieces: (PieceTuning & {
    id: string;
    name: string;
    mode: "mosaic" | "original";
  })[];
  remainder_mode: "mosaic" | "original";
  remainder_columns: number | null;
  remainder_variety: number | null;
  remainder_blend: number | null;
  remainder_effect: PieceEffect | null;
};

/** Coalesce slider movement and serialize saves so older requests cannot win. */
export function PieceSettings({
  name,
  settings,
  defaults,
  disabled = false,
  onSave,
  sources = [],
}: {
  sources?: { id: string; name: string }[];
  name: string;
  settings: PieceTuning;
  defaults: StudioDefaults;
  disabled?: boolean;
  onSave: (settings: PieceTuning) => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(settings);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const save = useRef(onSave);
  save.current = onSave;
  const changed = useRef(false);
  const version = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    if (!changed.current) {
      latest.current = settings;
      setDraft(settings);
    }
  }, [
    settings.columns,
    settings.variety,
    settings.blend,
    JSON.stringify(settings.effect),
  ]);

  function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!changed.current) return;
    const value = { ...latest.current },
      revision = version.current;
    const callback = save.current;
    setSaving(true);
    setError("");
    queue.current = queue.current
      .catch(() => {})
      .then(() => callback(value))
      .then(() => {
        if (revision === version.current) {
          changed.current = false;
          if (mounted.current) setSaving(false);
        }
      })
      .catch((error) => {
        if (mounted.current && revision === version.current) {
          setSaving(false);
          setError(error.message || "Could not save these settings.");
        }
      });
  }
  useEffect(
    () => () => {
      mounted.current = false;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        const value = { ...latest.current },
          callback = save.current;
        queue.current = queue.current
          .catch(() => {})
          .then(() => callback(value))
          .catch(() => {});
      }
    },
    [],
  );
  function change(value: PieceTuning) {
    latest.current = value;
    setDraft(value);
    changed.current = true;
    version.current++;
    setSaving(true);
    setError("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 350);
  }
  const inherited =
    draft.columns === null && draft.variety === null && draft.blend === null;
  const values = {
    columns: draft.columns ?? defaults.columns,
    variety: draft.variety ?? defaults.variety,
    blend: draft.blend ?? defaults.blend,
  };
  const slider = (
    key: keyof StudioDefaults,
    label: string,
    min: number,
    max: number,
    step: number,
  ) => (
    <label className="piece-setting-slider">
      <span>
        {label}
        <strong>
          {key === "columns"
            ? `${values[key]} across`
            : `${Math.round(values[key] * 100)}%`}
        </strong>
      </span>
      <input
        aria-label={`${name} ${label.toLowerCase()}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={values[key]}
        disabled={disabled}
        onChange={(event) =>
          change({
            ...values,
            effect: draft.effect,
            [key]: +event.target.value,
          })
        }
        onPointerUp={() => {
          if (timer.current) flush();
        }}
        onBlur={() => {
          if (timer.current) flush();
        }}
      />
    </label>
  );
  return (
    <fieldset
      className="piece-settings"
      disabled={disabled}
      aria-label={`${name} mosaic settings`}
    >
      <label className="piece-defaults">
        <input
          type="checkbox"
          checked={inherited}
          onChange={(event) => {
            change(
              event.target.checked
                ? {
                    columns: null,
                    variety: null,
                    blend: null,
                    effect: draft.effect,
                  }
                : { ...values, effect: draft.effect },
            );
          }}
        />
        Use studio defaults
      </label>
      {slider("columns", "Resolution", 12, 160, 1)}
      {draft.effect?.preset !== "balanced-gradient-halo" && (
        <>
          {slider("variety", "Photo variety", 0, 1, 0.01)}
          {slider("blend", "Portrait color blend", 0, 0.65, 0.01)}
        </>
      )}
      {draft.effect?.preset === "balanced-gradient-halo" && (
        <small>
          This preset arranges photos with equal usage and no portrait tint. Use
          its arrangement strength to tune randomness.
        </small>
      )}
      {values.variety === 1 &&
        draft.effect?.preset !== "balanced-gradient-halo" && (
          <small>
            100%: random placement, balanced photo usage in this piece.
          </small>
        )}
      <EffectSettings
        name={name}
        sources={sources}
        effect={draft.effect ?? null}
        onChange={(effect) => change({ ...draft, effect })}
      />
      <small role="status">
        {saving
          ? "Saving settings…"
          : inherited
            ? "Following studio defaults"
            : "Custom settings saved locally"}
      </small>
      {error && (
        <div className="error text-xs" role="alert">
          {error}
          <button className="text-button" onClick={flush}>
            Retry save
          </button>
        </div>
      )}
    </fieldset>
  );
}
