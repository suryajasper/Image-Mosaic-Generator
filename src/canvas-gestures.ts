export const MIN_CANVAS_ZOOM = 0.05;

export function stepCanvasZoom(
  current: number,
  direction: -1 | 1,
  maximum: number,
) {
  const fineStep = direction === -1 ? current <= 0.5 : current < 0.5;
  return Math.max(
    MIN_CANVAS_ZOOM,
    Math.min(
      maximum,
      Math.round((current + direction * (fineStep ? 0.05 : 0.25)) * 1000) /
        1000,
    ),
  );
}

/** Native, non-passive listeners can cancel the browser's trackpad pinch zoom. */
export function attachCanvasGestures(
  element: HTMLElement,
  zoomBy: (factor: number) => void,
  enabled: boolean,
  pointerGestures = true,
) {
  const pointers = new Map<number, { x: number; y: number }>();
  let gestureScale: number | null = null;
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    if (!enabled || gestureScale !== null || event.deltaY === 0) return;
    const units =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? element.clientHeight
          : 1;
    zoomBy(
      Math.exp(Math.max(-0.5, Math.min(0.5, -event.deltaY * units * 0.01))),
    );
  };
  const gestureStart = (event: Event) => {
    event.preventDefault();
    gestureScale = 1;
  };
  const gestureChange = (event: Event) => {
    event.preventDefault();
    const scale = (event as Event & { scale: number }).scale;
    if (enabled && gestureScale && Number.isFinite(scale) && scale > 0)
      zoomBy(scale / gestureScale);
    if (Number.isFinite(scale) && scale > 0) gestureScale = scale;
  };
  const gestureEnd = (event: Event) => {
    event.preventDefault();
    gestureScale = null;
  };
  const down = (event: PointerEvent) => {
    if (!enabled || (event.pointerType === "mouse" && event.button !== 0))
      return;
    element.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const move = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const before = distance();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const after = distance();
      if (before > 0 && after > 0 && gestureScale === null)
        zoomBy(after / before);
    } else if (pointers.size === 1) {
      element.scrollLeft -= event.clientX - previous.x;
      element.scrollTop -= event.clientY - previous.y;
    }
  };
  const up = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
  };
  const listeners: [string, EventListener][] = [
    ["wheel", wheel as EventListener],
    ["gesturestart", gestureStart],
    ["gesturechange", gestureChange],
    ["gestureend", gestureEnd],
    ["pointerdown", down as EventListener],
    ["pointermove", move as EventListener],
    ["pointerup", up as EventListener],
    ["pointercancel", up as EventListener],
    ["lostpointercapture", up as EventListener],
  ];
  const activeListeners = pointerGestures
    ? listeners
    : listeners.filter(
        ([name]) =>
          !name.startsWith("pointer") && name !== "lostpointercapture",
      );
  activeListeners.forEach(([name, handler]) =>
    element.addEventListener(name, handler, { passive: false }),
  );
  return () =>
    activeListeners.forEach(([name, handler]) =>
      element.removeEventListener(name, handler),
    );
}
