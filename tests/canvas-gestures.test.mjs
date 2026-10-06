import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL("../src/canvas-gestures.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { attachCanvasGestures } = await import(
  "data:text/javascript;base64," + Buffer.from(outputText).toString("base64")
);
class Viewport extends EventTarget {
  scrollLeft = 0;
  scrollTop = 0;
  clientHeight = 500;
  setPointerCapture() {}
}
function send(element, type, values) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, values);
  element.dispatchEvent(event);
  return event;
}
test("trackpad pinch cancels browser zoom, zooms the canvas, and cleans up", () => {
  const element = new Viewport(),
    factors = [];
  const cleanup = attachCanvasGestures(
    element,
    (factor) => factors.push(factor),
    true,
  );
  const pinch = send(element, "wheel", {
    ctrlKey: true,
    deltaY: -20,
    deltaMode: 0,
  });
  assert.equal(pinch.defaultPrevented, true);
  assert.ok(factors[0] > 1);
  const outside = send(new Viewport(), "wheel", {
    ctrlKey: true,
    deltaY: -20,
    deltaMode: 0,
  });
  assert.equal(outside.defaultPrevented, false);
  cleanup();
  assert.equal(
    send(element, "wheel", { deltaY: 20, deltaMode: 0 }).defaultPrevented,
    false,
  );
  assert.equal(factors.length, 1);
});
test("Safari gestures use relative scale and do not duplicate wheel zoom", () => {
  const element = new Viewport(),
    factors = [];
  attachCanvasGestures(element, (factor) => factors.push(factor), true);
  assert.equal(send(element, "gesturestart", {}).defaultPrevented, true);
  send(element, "gesturechange", { scale: 1.2 });
  send(element, "gesturechange", { scale: 1.8 });
  send(element, "wheel", { deltaY: -20, deltaMode: 0 });
  assert.deepEqual(factors, [1.2, 1.5]);
  assert.equal(send(element, "gestureend", {}).defaultPrevented, true);
});
test("two-finger touch pinches zoom without panning, then resume single-finger pan", () => {
  const element = new Viewport(),
    factors = [];
  attachCanvasGestures(element, (factor) => factors.push(factor), true);
  send(element, "pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    clientX: 0,
    clientY: 0,
  });
  send(element, "pointerdown", {
    pointerId: 2,
    pointerType: "touch",
    clientX: 100,
    clientY: 0,
  });
  send(element, "pointermove", { pointerId: 2, clientX: 200, clientY: 0 });
  assert.deepEqual(factors, [2]);
  assert.equal(element.scrollLeft, 0);
  send(element, "pointerup", { pointerId: 2 });
  send(element, "pointermove", { pointerId: 1, clientX: 10, clientY: 0 });
  assert.equal(element.scrollLeft, -10);
  send(element, "pointercancel", { pointerId: 1 });
  send(element, "pointermove", { pointerId: 1, clientX: 20, clientY: 0 });
  assert.equal(element.scrollLeft, -10);
});

test("selection editor keeps ownership of brush pointers while sharing pinch cancellation", () => {
  const element = new Viewport(),
    factors = [];
  const cleanup = attachCanvasGestures(
    element,
    (factor) => factors.push(factor),
    true,
    false,
  );
  send(element, "pointerdown", {
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    clientX: 0,
    clientY: 0,
  });
  send(element, "pointermove", { pointerId: 1, clientX: 100, clientY: 100 });
  assert.equal(element.scrollLeft, 0);
  assert.equal(element.scrollTop, 0);
  assert.equal(
    send(element, "wheel", { deltaY: -10, deltaMode: 0 }).defaultPrevented,
    true,
  );
  assert.ok(factors[0] > 1);
  cleanup();
});
