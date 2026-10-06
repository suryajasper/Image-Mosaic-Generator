import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Run the production TypeScript utility using the project's existing compiler.
const source = await readFile(
  new URL("../src/crop-drag.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { cropDragUpdate } = await import(
  "data:text/javascript;base64," + Buffer.from(outputText).toString("base64")
);

test("queued crop update survives pointer-up and preserves other crop settings", async () => {
  const drag = { current: { x: 0.2, y: 0.3, px: 10, py: 20 } };
  const update = cropDragUpdate(drag.current, 30, 50, 100, 100);
  const queued = Promise.resolve().then(() =>
    update({ x: 0.2, y: 0.3, size: 0.8, rotation: 90 }),
  );
  drag.current = null; // Pointer-up happens before React evaluates its queued update.
  assert.deepEqual(await queued, { x: 0.4, y: 0.6, size: 0.8, rotation: 90 });
});

test("a new drag cannot alter an already queued move", () => {
  const start = { x: 0.5, y: 0.5, px: 10, py: 10 };
  const update = cropDragUpdate(start, 20, 30, 100, 100);
  Object.assign(start, { x: 0, y: 0, px: 200, py: 200 });
  assert.deepEqual(update({ x: 0, y: 0 }), { x: 0.6, y: 0.7 });
});

test("crop coordinates remain finite and bounded at edges and full-size crops", () => {
  const update = cropDragUpdate(
    { x: 0.5, y: 0.5, px: 0, py: 0 },
    -200,
    200,
    0,
    0,
  );
  assert.deepEqual(update({ x: 0.5, y: 0.5 }), { x: 0, y: 1 });
});
