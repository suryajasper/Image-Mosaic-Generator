/** Preset configuration lives apart from tile layout and matching settings. */
export type SoftHalo = {
  preset: "soft-halo";
  sourceId: string;
  reach: number;
  strength: number;
  reverse: boolean;
  shape: "silhouette" | "ellipse";
};
export type PieceEffect = SoftHalo;
export const effectPresets = [{ id: "soft-halo", label: "Soft halo" }] as const;
export function defaultHalo(sourceId: string): SoftHalo {
  return {
    preset: "soft-halo",
    sourceId,
    reach: 0.25,
    strength: 0.55,
    reverse: false,
    shape: "silhouette",
  };
}

export type RenderTreatment = { preset: "soft-halo"; alphaUrl: string };
export function drawPieceTreatment(
  context: CanvasRenderingContext2D,
  treatment: RenderTreatment | null | undefined,
  original: HTMLImageElement,
  images: Map<string, HTMLImageElement>,
) {
  if (!treatment) return;
  switch (treatment.preset) {
    case "soft-halo": {
      const alpha = images.get(treatment.alphaUrl);
      if (!alpha) throw new Error("The halo preview could not be loaded.");
      const overlay = document.createElement("canvas");
      overlay.width = context.canvas.width;
      overlay.height = context.canvas.height;
      const ctx = overlay.getContext("2d")!;
      ctx.drawImage(original, 0, 0, overlay.width, overlay.height);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(alpha, 0, 0, overlay.width, overlay.height);
      context.drawImage(overlay, 0, 0);
      break;
    }
  }
}
