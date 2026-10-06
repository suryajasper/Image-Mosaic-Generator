import type { Mosaic } from "../types";
import { loadImage } from "../images";

/** Bound image decoding to keep large local libraries responsive. */
export async function withWorkers<T>(
  items: T[],
  work: (item: T) => Promise<void>,
  limit = 6,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}

export class MosaicImageCache {
  readonly images = new Map<string, HTMLImageElement>();
  private pending = new Map<string, Promise<void>>();
  private ensure(key: string, url: string) {
    if (this.images.has(key)) return Promise.resolve();
    if (!this.pending.has(url))
      this.pending.set(
        url,
        loadImage(url)
          .then((image) => {
            this.images.set(key, image);
          })
          .finally(() => {
            this.pending.delete(url);
          }),
      );
    return this.pending.get(url)!;
  }
  async prepare(mosaic: Mosaic) {
    const urls = new Set<string>();
    for (const layer of mosaic.layers ?? []) {
      urls.add(layer.maskUrl);
      if (layer.treatment) urls.add(layer.treatment.alphaUrl);
    }
    if (mosaic.maskUrl) urls.add(mosaic.maskUrl);
    if (mosaic.backgroundUrl) urls.add(mosaic.backgroundUrl);
    await withWorkers([...urls], (url) => this.ensure(url, url));
    await withWorkers(
      mosaic.ids
        .map((id, i) => ({ id, i }))
        .filter(({ i }) => mosaic.counts[i] > 0),
      ({ id, i }) =>
        this.ensure(
          `${id}:${mosaic.revisions[i]}`,
          `/api/photos/${id}/image?v=${mosaic.revisions[i]}`,
        ),
    );
  }
  async sharpen(mosaic: Mosaic, width: number) {
    const across = Math.min(
      mosaic.columns,
      ...(mosaic.layers ?? []).map((layer) => layer.columns),
    );
    const pixels = width / across,
      size = pixels > 512 ? 1024 : pixels > 256 ? 512 : 256;
    if (size === 256) return;
    await withWorkers(
      mosaic.ids
        .map((id, i) => ({ id, i }))
        .filter(
          ({ id, i }) =>
            mosaic.counts[i] > 0 &&
            (this.images.get(`${id}:${mosaic.revisions[i]}`)?.width ?? 0) <
              size,
        ),
      async ({ id, i }) => {
        const key = `${id}:${mosaic.revisions[i]}`,
          url = `/api/photos/${id}/image?v=${mosaic.revisions[i]}&size=${size}`;
        if (!this.pending.has(url))
          this.pending.set(
            url,
            loadImage(url)
              .then((image) => {
                if (image.width > (this.images.get(key)?.width ?? 0))
                  this.images.set(key, image);
              })
              .catch((error) => {
                this.pending.delete(url);
                throw error;
              }),
          );
        await this.pending.get(url);
      },
    );
  }
}
