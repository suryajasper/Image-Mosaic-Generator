import { useEffect, useState } from "react";

/** A viewport-filling preview works consistently in browsers and embedded webviews. */
export function usePreviewFullscreen() {
  const [isFullScreen, setIsFullScreen] = useState(false);
  useEffect(() => {
    if (!isFullScreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullScreen(false);
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", escape);
    };
  }, [isFullScreen]);
  const toggleFullScreen = async () => setIsFullScreen((active) => !active);
  return { isFullScreen, toggleFullScreen };
}
