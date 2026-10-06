import type { Mosaic } from "../types";
import { drawPieceTreatment } from "../piece-effects";
export function drawMosaic(
  c: HTMLCanvasElement,
  m: Mosaic,
  width: number,
  images: Map<string, HTMLImageElement>,
  tint: number,
) {
  c.width = width;
  c.height = Math.round(width * (m.aspectRatio ?? m.rows / m.columns));
  const ctx = c.getContext("2d")!;
  const drawTiles = (
    context: CanvasRenderingContext2D,
    tiles: number[],
    colors: number[][],
    across = m.columns,
    blend = tint,
  ) => {
    const cell = width / across;
    tiles.forEach((index, i) => {
      if (index < 0) return;
      const x = (i % across) * cell,
        y = Math.floor(i / across) * cell,
        img = images.get(m.ids[index] + ":" + m.revisions[index]);
      if (img) context.drawImage(img, x, y, cell + 0.5, cell + 0.5);
      if (blend > 0) {
        context.fillStyle = `rgba(${colors[i].join(",")},${blend})`;
        context.fillRect(x, y, cell + 0.5, cell + 0.5);
      }
    });
  };
  if (m.layers) {
    const original = m.backgroundUrl && images.get(m.backgroundUrl);
    if (!original)
      throw new Error("The original portrait could not be loaded.");
    ctx.drawImage(original, 0, 0, c.width, c.height);
    const layerCanvas = document.createElement("canvas");
    layerCanvas.width = c.width;
    layerCanvas.height = c.height;
    const layerContext = layerCanvas.getContext("2d")!;
    for (const layer of m.layers) {
      layerContext.clearRect(0, 0, c.width, c.height);
      drawTiles(
        layerContext,
        layer.tiles,
        layer.colors,
        layer.columns,
        layer.blend,
      );
      drawPieceTreatment(layerContext, layer.treatment, original, images);
      const mask = images.get(layer.maskUrl);
      if (!mask) throw new Error("A portrait-piece mask could not be loaded.");
      layerContext.globalCompositeOperation = "destination-in";
      layerContext.drawImage(mask, 0, 0, c.width, c.height);
      layerContext.globalCompositeOperation = "source-over";
      ctx.drawImage(layerCanvas, 0, 0);
    }
    return;
  }
  drawTiles(ctx, m.tiles, m.colors);
  if (m.maskUrl) {
    const mask = images.get(m.maskUrl);
    if (!mask) throw new Error("The foreground mask could not be loaded.");
    ctx.globalCompositeOperation =
      m.mosaicRegion === "background" ? "destination-out" : "destination-in";
    ctx.drawImage(mask, 0, 0, c.width, c.height);
    const background = m.backgroundUrl && images.get(m.backgroundUrl);
    if (!background)
      throw new Error("The original portrait background could not be loaded.");
    ctx.globalCompositeOperation = "destination-over";
    ctx.drawImage(background, 0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "source-over";
  }
}
