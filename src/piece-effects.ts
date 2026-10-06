/** Preset configuration lives apart from tile layout and matching settings. */
export type SoftHalo = {
  preset: "soft-halo";
  sourceId: string;
  reach: number;
  strength: number;
  reverse: boolean;
  shape: "silhouette" | "ellipse";
};
export type GradientHalo = Omit<SoftHalo, "preset"> & {
  preset: "balanced-gradient-halo";
  innerBrightness: number;
  outerBrightness: number;
  palette:
    "brightness" | "cream-charcoal" | "gold-navy" | "rose-plum" | "custom";
  innerColor: string;
  outerColor: string;
};
export type PieceEffect = SoftHalo | GradientHalo;
export const gradientPalettes = [
  { id: "brightness", label: "Brightness only" },
  { id: "cream-charcoal", label: "Cream to charcoal" },
  { id: "gold-navy", label: "Pale gold to navy" },
  { id: "rose-plum", label: "Rose to plum" },
  { id: "custom", label: "Custom colors" },
] as const;
export const effectPresets = [
  { id: "balanced-gradient-halo", label: "Balanced gradient halo" },
  { id: "soft-halo", label: "Soft halo (portrait blend)" },
] as const;
export function defaultGradientHalo(sourceId: string): GradientHalo {
  return {
    ...defaultHalo(sourceId),
    preset: "balanced-gradient-halo",
    strength: 0.75,
    reach: 0.65,
    innerBrightness: 0.85,
    outerBrightness: 0.15,
    palette: "brightness",
    innerColor: "#ffe6a3",
    outerColor: "#142745",
  };
}
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
