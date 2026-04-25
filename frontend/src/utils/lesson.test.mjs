import test from "node:test";
import assert from "node:assert/strict";

import { buildNarrationQueue, normalizeLesson } from "./lesson.js";


test("normalizeLesson keeps scenes and fills missing full narration", () => {
  const lesson = normalizeLesson({
    title: "平面几何",
    summary: "识别三角形的底和高",
    scenes: [
      {
        id: "scene-1",
        title: "第一步",
        svg: "<svg viewBox='0 0 320 180'></svg>",
        narration: "先看三角形的底边。",
      },
      {
        id: "scene-2",
        title: "第二步",
        svg: "<svg viewBox='0 0 320 180'></svg>",
        narration: "再找到与底边对应的高。",
      },
    ],
  });

  assert.equal(lesson.scenes.length, 2);
  assert.match(lesson.fullNarration, /先看三角形的底边/);
  assert.match(lesson.fullNarration, /再找到与底边对应的高/);
});


test("buildNarrationQueue returns ordered play items", () => {
  const queue = buildNarrationQueue({
    title: "分数加法",
    summary: "同分母分数相加",
    fullNarration: "完整讲解",
    scenes: [
      {
        id: "scene-1",
        title: "观察",
        svg: "<svg viewBox='0 0 320 180'></svg>",
        narration: "第一步先观察分数。",
      },
    ],
  });

  assert.equal(queue.length, 1);
  assert.equal(queue[0].label, "观察");
  assert.equal(queue[0].text, "第一步先观察分数。");
});
