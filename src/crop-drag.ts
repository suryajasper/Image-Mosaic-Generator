export type CropDragStart = { x: number; y: number; px: number; py: number };

/** Capture a pointer move before React queues the update or pointer-up clears the drag. */
export function cropDragUpdate<T extends { x: number; y: number }>(
  start: CropDragStart,
  pointerX: number,
  pointerY: number,
  availableWidth: number,
  availableHeight: number,
): (draft: T) => T {
  const x = Math.max(
    0,
    Math.min(1, start.x + (pointerX - start.px) / Math.max(1, availableWidth)),
  );
  const y = Math.max(
    0,
    Math.min(1, start.y + (pointerY - start.py) / Math.max(1, availableHeight)),
  );
  return (draft) => ({ ...draft, x, y });
}
