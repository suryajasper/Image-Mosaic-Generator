import type { Photo } from "./types";
export const photoURL = (p: Photo) =>
  `/api/photos/${p.id}/image?v=${p.revision}`;
export const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new Error("A photo could not be loaded. Check your local folder."),
      );
    img.src = url;
  });
