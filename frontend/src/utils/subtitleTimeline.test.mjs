import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSubtitleTimeline,
  getActiveSubtitleCue,
  splitNarrationIntoCaptions,
} from "./subtitleTimeline.js";

test("splitNarrationIntoCaptions splits narration into readable subtitle chunks", () => {
  const chunks = splitNarrationIntoCaptions(
    "首先观察题目条件。然后写出泰勒展开式，比较同次项系数，最后得到结论。",
  );

  assert.deepEqual(chunks, [
    "首先观察题目条件。",
    "然后写出泰勒展开式，",
    "比较同次项系数，",
    "最后得到结论。",
  ]);
});

test("buildSubtitleTimeline creates ordered cues with bounded durations", () => {
  const timeline = buildSubtitleTimeline("先观察题目。再展开公式。最后得出结论。");

  assert.equal(timeline.length, 3);
  assert.equal(timeline[0].startMs, 0);
  assert.ok(timeline[0].endMs > timeline[0].startMs);
  assert.ok(timeline[2].endMs > timeline[1].endMs);
});

test("getActiveSubtitleCue resolves the current cue from elapsed time", () => {
  const timeline = [
    { id: "cue-1", text: "第一句", startMs: 0, endMs: 1200 },
    { id: "cue-2", text: "第二句", startMs: 1200, endMs: 2400 },
  ];

  assert.equal(getActiveSubtitleCue(timeline, 100)?.text, "第一句");
  assert.equal(getActiveSubtitleCue(timeline, 1500)?.text, "第二句");
  assert.equal(getActiveSubtitleCue(timeline, 9999)?.text, "第二句");
});
