import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const moduleURL = (source) =>
  "data:text/javascript;base64," +
  Buffer.from(compile(source)).toString("base64");
const imageURL = moduleURL(
  await readFile(new URL("../src/images.ts", import.meta.url), "utf8"),
);
const source = (
  await readFile(
    new URL("../src/studio/image-cache.ts", import.meta.url),
    "utf8",
  )
).replace('"../images"', JSON.stringify(imageURL));
const { MosaicImageCache, withWorkers } = await import(moduleURL(source));

test("image preparation bounds concurrent decodes and skips unused photos", async () => {
  const previous = globalThis.Image;
  let active = 0,
    peak = 0;
  const loaded = [];
  globalThis.Image = class {
    width = 256;
    set src(url) {
      loaded.push(url);
      peak = Math.max(peak, ++active);
      setTimeout(() => {
        active--;
        this.onload();
      }, 1);
    }
  };
  try {
    const cache = new MosaicImageCache(),
      mosaic = {
        ids: Array.from({ length: 20 }, (_, i) => String(i)),
        revisions: Array(20).fill(0),
        counts: Array.from({ length: 20 }, (_, i) => i % 2),
        maskUrl: null,
        backgroundUrl: null,
      };
    await cache.prepare(mosaic);
    assert.equal(loaded.length, 10);
    assert.ok(peak <= 6);
    assert.equal(cache.images.size, 10);
    await cache.prepare(mosaic);
    assert.equal(loaded.length, 10);
  } finally {
    globalThis.Image = previous;
  }
});

test("sharp requests are deduplicated, preserve higher resolution, and retry failures", async () => {
  const previous = globalThis.Image;
  const loaded = [];
  let fail = true;
  globalThis.Image = class {
    width = 256;
    set src(url) {
      loaded.push(url);
      this.width = Number(
        new URL(url, "http://localhost").searchParams.get("size") || 256,
      );
      queueMicrotask(() => {
        if (this.width === 1024 && fail) {
          fail = false;
          this.onerror();
        } else this.onload();
      });
    }
  };
  try {
    const cache = new MosaicImageCache(),
      mosaic = {
        ids: ["a", "b"],
        revisions: [2, 0],
        counts: [1, 0],
        columns: 12,
      };
    await cache.prepare(mosaic);
    await assert.rejects(cache.sharpen(mosaic, 9000), /could not be loaded/);
    await Promise.all([
      cache.sharpen(mosaic, 9000),
      cache.sharpen(mosaic, 9000),
    ]);
    assert.equal(cache.images.get("a:2").width, 1024);
    assert.equal(loaded.filter((url) => url.includes("size=1024")).length, 2);
    await cache.sharpen(mosaic, 4000);
    assert.equal(cache.images.get("a:2").width, 1024);
    assert.ok(loaded.every((url) => !url.includes("/b/")));
  } finally {
    globalThis.Image = previous;
  }
});

test("worker errors propagate to the caller", async () => {
  await assert.rejects(
    withWorkers([1, 2], async () => {
      throw new Error("decode failed");
    }),
    /decode failed/,
  );
});
