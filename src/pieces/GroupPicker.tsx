import type { Group } from "./types";
export function GroupPicker({
  groups,
  chosen,
  onChange,
  disabled,
}: {
  groups: Group[];
  chosen: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  return (
    <div className="piece-group-picker">
      {groups.length ? (
        groups.map((group) => (
          <label key={group.id}>
            <input
              type="checkbox"
              checked={chosen.includes(group.id)}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...chosen, group.id]
                    : chosen.filter((id) => id !== group.id),
                )
              }
            />
            {group.name}
            {group.status !== "available" && <small> unavailable</small>}
          </label>
        ))
      ) : (
        <small>Add a photo group in the library.</small>
      )}
      {chosen.some((id) => !groups.some((g) => g.id === id)) && (
        <>
          <small className="error">
            An assigned group was removed. Restore it or clear its assignment.
          </small>
          <button
            className="text-button"
            disabled={disabled}
            onClick={() =>
              onChange(
                chosen.filter((id) => groups.some((group) => group.id === id)),
              )
            }
          >
            Clear removed groups
          </button>
        </>
      )}
    </div>
  );
}
