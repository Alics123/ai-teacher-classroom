import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLessonExportFilename,
  buildLessonExportText,
  copyLessonText,
} from "./lessonExport.js";

const lesson = {
  title: "Fraction Addition / Level 2",
  summary: "理解同分母分数相加，再过渡到约分。",
  fullNarration: "先看分母，再把分子相加，最后检查是否需要约分。",
  scenes: [
    {
      id: "scene-1",
      title: "观察题目",
      narration: "先观察两个分数的分母是不是相同。",
    },
    {
      id: "scene-2",
      title: "完成计算",
      narration: "保持分母不变，把分子相加。",
    },
  ],
};

test("buildLessonExportText includes summary, active scene and full lesson script", () => {
  const text = buildLessonExportText(lesson, { activeSceneId: "scene-2" });

  assert.match(text, /Fraction Addition \/ Level 2/);
  assert.match(text, /理解同分母分数相加/);
  assert.match(text, /当前选中分镜/);
  assert.match(text, /scene-2 · 完成计算/);
  assert.match(text, /保持分母不变，把分子相加/);
  assert.match(text, /完整讲解稿/);
});

test("buildLessonExportFilename sanitizes title for text download", () => {
  assert.equal(
    buildLessonExportFilename(lesson),
    "lesson-fraction-addition-level-2.txt",
  );
});

test("copyLessonText writes the provided text to clipboard", async () => {
  let written = "";
  const clipboard = {
    async writeText(value) {
      written = value;
    },
  };

  const result = await copyLessonText("当前讲解内容", { clipboard });

  assert.equal(result, "当前讲解内容");
  assert.equal(written, "当前讲解内容");
});
