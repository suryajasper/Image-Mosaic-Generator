import type { Project, Point } from "./types";
import { palette, makeMask } from "./masks";
export function drawSelection(
  canvas: HTMLCanvasElement,
  portrait: HTMLImageElement,
  project: Project,
  selectedId: string | null,
  draft: HTMLCanvasElement | null,
  masks: Map<string, HTMLCanvasElement>,
  points: Point[],
  box: number[] | null,
  suggestionMask: HTMLImageElement | null,
  showOverlay: boolean,
) {
  const context = canvas.getContext("2d")!;
  context.drawImage(portrait, 0, 0, canvas.width, canvas.height);
  if (showOverlay) {
    const remaining = new Float32Array(canvas.width * canvas.height).fill(1);
    for (const [index, piece] of project.pieces.entries()) {
      const source = piece.id === selectedId ? draft : masks.get(piece.id);
      if (!source) continue;
      const preview = piece.id === selectedId && suggestionMask;
      const maskCanvas = preview
        ? makeMask(canvas.width, canvas.height)
        : source;
      if (preview)
        maskCanvas
          .getContext("2d")!
          .drawImage(preview, 0, 0, canvas.width, canvas.height);
      const data = maskCanvas
        .getContext("2d", { willReadFrequently: true })!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      const overlay = context.createImageData(canvas.width, canvas.height);
      const color = palette[index % palette.length];
      const rgb = [
        parseInt(color.slice(1, 3), 16),
        parseInt(color.slice(3, 5), 16),
        parseInt(color.slice(5, 7), 16),
      ];
      for (let pixel = 0; pixel < remaining.length; pixel++) {
        const coverage = data[pixel * 4] / 255;
        const effective = coverage * remaining[pixel];
        remaining[pixel] *= 1 - coverage;
        overlay.data[pixel * 4] = rgb[0];
        overlay.data[pixel * 4 + 1] = rgb[1];
        overlay.data[pixel * 4 + 2] = rgb[2];
        overlay.data[pixel * 4 + 3] =
          effective * (piece.id === selectedId ? 0.48 : 0.2) * 255;
      }
      const layer = makeMask(canvas.width, canvas.height);
      layer.getContext("2d")!.putImageData(overlay, 0, 0);
      context.drawImage(layer, 0, 0);
    }
  }
  for (const point of points) {
    const x = point.x * canvas.width,
      y = point.y * canvas.height;
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.fillStyle = point.include ? "#2d9964" : "#cf5656";
    context.fill();
    context.strokeStyle = "white";
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = "white";
    context.font = "bold 12px sans-serif";
    context.textAlign = "center";
    context.fillText(point.include ? "+" : "−", x, y + 4);
  }
  if (box) {
    context.strokeStyle = "white";
    context.lineWidth = 2;
    context.setLineDash([8, 5]);
    context.strokeRect(
      box[0] * canvas.width,
      box[1] * canvas.height,
      (box[2] - box[0]) * canvas.width,
      (box[3] - box[1]) * canvas.height,
    );
    context.setLineDash([]);
  }
}
