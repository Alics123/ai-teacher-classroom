import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClipboardImageFilename,
  extractImageFileFromClipboardData,
} from "./clipboardImage.js";

test("buildClipboardImageFilename maps common mime types to stable names", () => {
  assert.equal(
    buildClipboardImageFilename("image/png", 1710000000000),
    "pasted-image-1710000000000.png",
  );
  assert.equal(
    buildClipboardImageFilename("image/jpeg", 1710000000000),
    "pasted-image-1710000000000.jpg",
  );
});

test("extractImageFileFromClipboardData prefers image files from clipboardData.files", () => {
  const file = new File(["hello"], "", { type: "image/png", lastModified: 1 });
  const result = extractImageFileFromClipboardData(
    { files: [file] },
    { now: () => 1710000000000 },
  );

  assert.equal(result.type, "image/png");
  assert.equal(result.name, "pasted-image-1710000000000.png");
});

test("extractImageFileFromClipboardData falls back to image clipboard items", () => {
  const file = new File(["hello"], "clipboard-shot.png", {
    type: "image/png",
    lastModified: 2,
  });

  const result = extractImageFileFromClipboardData({
    items: [
      {
        kind: "file",
        type: "image/png",
        getAsFile() {
          return file;
        },
      },
    ],
  });

  assert.equal(result.name, "clipboard-shot.png");
});

test("extractImageFileFromClipboardData ignores non-image payloads", () => {
  const result = extractImageFileFromClipboardData({
    files: [new File(["text"], "notes.txt", { type: "text/plain" })],
    items: [
      {
        kind: "string",
        type: "text/plain",
        getAsFile() {
          return null;
        },
      },
    ],
  });

  assert.equal(result, null);
});
