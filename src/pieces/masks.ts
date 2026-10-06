export const palette = [
  "#579b76",
  "#c58857",
  "#658db8",
  "#b3779b",
  "#9a984f",
  "#927cb7",
];
export const makeMask = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};
