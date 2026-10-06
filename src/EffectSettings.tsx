import {
  defaultHalo,
  defaultGradientHalo,
  gradientPalettes,
  effectPresets,
  type GradientHalo,
  type PieceEffect,
} from "./piece-effects";
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
              e.target.value === "none"
                ? null
                : e.target.value === "balanced-gradient-halo"
                  ? defaultGradientHalo(effect?.sourceId ?? sources[0].id)
                  : defaultHalo(effect?.sourceId ?? sources[0].id),
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
      {effect && (
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
              {effect.preset === "balanced-gradient-halo"
                ? "Arrangement strength"
                : "Strength"}
              <strong>{Math.round(effect.strength * 100)}%</strong>
            </span>
            <input
              aria-label={`${name} ${effect.preset === "balanced-gradient-halo" ? "arrangement strength" : "halo strength"}`}
              type="range"
              min="0"
              max={effect.preset === "balanced-gradient-halo" ? 1 : 0.85}
              step="0.01"
              value={effect.strength}
              onChange={(e) =>
                onChange({ ...effect, strength: +e.target.value })
              }
            />
          </label>
          {effect.preset === "balanced-gradient-halo" && (
            <>
              <label>
                Palette
                <select
                  aria-label={`${name} gradient palette`}
                  value={effect.palette}
                  onChange={(e) =>
                    onChange({
                      ...effect,
                      palette: e.target.value as GradientHalo["palette"],
                    })
                  }
                >
                  {gradientPalettes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ["innerBrightness", "Inner brightness"],
                  ["outerBrightness", "Outer brightness"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="piece-setting-slider">
                  <span>
                    {label}
                    <strong>{Math.round(effect[key] * 100)}%</strong>
                  </span>
                  <input
                    aria-label={`${name} ${label.toLowerCase()}`}
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={effect[key]}
                    onChange={(e) =>
                      onChange({ ...effect, [key]: +e.target.value })
                    }
                  />
                </label>
              ))}
              {effect.palette === "custom" && (
                <div className="gradient-colors">
                  <label>
                    Inner color
                    <input
                      aria-label={`${name} inner color`}
                      type="color"
                      value={effect.innerColor}
                      onChange={(e) =>
                        onChange({ ...effect, innerColor: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Outer color
                    <input
                      aria-label={`${name} outer color`}
                      type="color"
                      value={effect.outerColor}
                      onChange={(e) =>
                        onChange({ ...effect, outerColor: e.target.value })
                      }
                    />
                  </label>
                </div>
              )}
              <small>
                Balanced photo usage at every strength. 0% is random; 100%
                organizes all placements. Photos keep their own colors.
              </small>
            </>
          )}
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
            {effect.preset === "balanced-gradient-halo"
              ? "Inner and outer brightness and palette colors follow distance from the selected subject."
              : effect.reverse
                ? "Photos are clearest near the subject and soften outward."
                : "Photos soften near the subject and become clearer outward."}
          </small>
        </>
      )}
    </div>
  );
}
