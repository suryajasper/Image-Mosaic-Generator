import { defaultHalo, effectPresets, type PieceEffect } from "./piece-effects";
export function EffectSettings({
  name,
  effect,
  sources,
  onChange,
}: {
  name: string;
  effect: PieceEffect | null;
  sources: { id: string; name: string }[];
  onChange: (effect: PieceEffect | null) => void;
}) {
  return (
    <div className="effect-settings">
      <label>
        Portrait treatment
        <select
          aria-label={`${name} portrait treatment`}
          value={effect?.preset ?? "none"}
          onChange={(e) =>
            onChange(
              e.target.value === "none" ? null : defaultHalo(sources[0].id),
            )
          }
        >
          <option value="none">None</option>
          {effectPresets.map((p) => (
            <option key={p.id} value={p.id} disabled={!sources.length}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {!sources.length && <small>Create a subject piece to use a halo.</small>}
      {effect?.preset === "soft-halo" && (
        <>
          <label>
            Halo around
            <select
              aria-label={`${name} halo source`}
              value={effect.sourceId}
              onChange={(e) =>
                onChange({ ...effect, sourceId: e.target.value })
              }
            >
              {sources.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Shape
            <select
              aria-label={`${name} halo shape`}
              value={effect.shape}
              onChange={(e) =>
                onChange({
                  ...effect,
                  shape: e.target.value as PieceEffect["shape"],
                })
              }
            >
              <option value="silhouette">Follow silhouette</option>
              <option value="ellipse">Elliptical</option>
            </select>
          </label>
          <label className="piece-setting-slider">
            <span>
              Reach<strong>{Math.round(effect.reach * 100)}%</strong>
            </span>
            <input
              aria-label={`${name} halo reach`}
              type="range"
              min="0.02"
              max="1"
              step="0.01"
              value={effect.reach}
              onChange={(e) => onChange({ ...effect, reach: +e.target.value })}
            />
          </label>
          <label className="piece-setting-slider">
            <span>
              Strength<strong>{Math.round(effect.strength * 100)}%</strong>
            </span>
            <input
              aria-label={`${name} halo strength`}
              type="range"
              min="0"
              max="0.85"
              step="0.01"
              value={effect.strength}
              onChange={(e) =>
                onChange({ ...effect, strength: +e.target.value })
              }
            />
          </label>
          <label className="piece-defaults">
            <input
              type="checkbox"
              checked={effect.reverse}
              onChange={(e) =>
                onChange({ ...effect, reverse: e.target.checked })
              }
            />
            Reverse transition
          </label>
          <small>
            {effect.reverse
              ? "Photos are clearest near the subject and soften outward."
              : "Photos soften near the subject and become clearer outward."}
          </small>
        </>
      )}
    </div>
  );
}
