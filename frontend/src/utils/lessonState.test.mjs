import test from "node:test";
import assert from "node:assert/strict";

async function loadLessonStateModule() {
  try {
    return await import("./lessonState.js");
  } catch {
    return null;
  }
}

function createHistoryRecord(fileKey, title) {
  return {
    id: `${fileKey}-record`,
    fileKey,
    fileName: `${title}.png`,
    createdAt: 1,
    lesson: {
      title,
      summary: `${title} summary`,
      fullNarration: `${title} full narration`,
      scenes: [{ id: "scene-1", title: "step", narration: "narration", svg: "<svg></svg>" }],
    },
  };
}

test("getVisibleLessonRecord hides stale result after selecting a new file", async () => {
  const lessonState = await loadLessonStateModule();

  assert.ok(lessonState, "lessonState.js should exist");
  assert.equal(typeof lessonState.createLessonAppState, "function");
  assert.equal(typeof lessonState.reduceLessonAppState, "function");
  assert.equal(typeof lessonState.getVisibleLessonRecord, "function");

  const oldRecord = createHistoryRecord("old-file", "旧结果");
  let state = lessonState.createLessonAppState({ history: [oldRecord] });

  state = lessonState.reduceLessonAppState(state, {
    type: "file-selected",
    fileKey: "new-file",
  });

  assert.equal(lessonState.getVisibleLessonRecord(state), null);
});

test("reduceLessonAppState ignores stale request completion and keeps the latest request", async () => {
  const lessonState = await loadLessonStateModule();

  assert.ok(lessonState, "lessonState.js should exist");

  let state = lessonState.createLessonAppState();
  state = lessonState.reduceLessonAppState(state, {
    type: "file-selected",
    fileKey: "first-file",
  });
  state = lessonState.reduceLessonAppState(state, {
    type: "submit-start",
    requestId: 1,
    fileKey: "first-file",
  });
  state = lessonState.reduceLessonAppState(state, {
    type: "file-selected",
    fileKey: "second-file",
  });
  state = lessonState.reduceLessonAppState(state, {
    type: "submit-start",
    requestId: 2,
    fileKey: "second-file",
  });
  state = lessonState.reduceLessonAppState(state, {
    type: "submit-success",
    requestId: 1,
    record: createHistoryRecord("first-file", "旧请求"),
    history: [createHistoryRecord("first-file", "旧请求")],
  });

  assert.equal(state.currentRequestId, 2);
  assert.equal(state.currentRecord, null);

  state = lessonState.reduceLessonAppState(state, {
    type: "submit-success",
    requestId: 2,
    record: createHistoryRecord("second-file", "最新请求"),
    history: [createHistoryRecord("second-file", "最新请求")],
  });

  assert.equal(state.currentRecord?.fileKey, "second-file");
  assert.equal(lessonState.getVisibleLessonRecord(state)?.lesson.title, "最新请求");
});

test("canRetryCurrentSelection only becomes true after the latest request fails", async () => {
  const lessonState = await loadLessonStateModule();

  assert.ok(lessonState, "lessonState.js should exist");
  assert.equal(typeof lessonState.canRetryCurrentSelection, "function");

  let state = lessonState.createLessonAppState();
  state = lessonState.reduceLessonAppState(state, {
    type: "file-selected",
    fileKey: "retry-file",
  });
  state = lessonState.reduceLessonAppState(state, {
    type: "submit-start",
    requestId: 3,
    fileKey: "retry-file",
  });

  assert.equal(lessonState.canRetryCurrentSelection(state), false);

  state = lessonState.reduceLessonAppState(state, {
    type: "submit-error",
    requestId: 3,
    errorText: "网络繁忙",
  });

  assert.equal(lessonState.canRetryCurrentSelection(state), true);
});

test("history-selected restores an old record and clears current file selection", async () => {
  const lessonState = await loadLessonStateModule();

  assert.ok(lessonState, "lessonState.js should exist");

  const currentRecord = createHistoryRecord("current-file", "当前结果");
  const previousRecord = createHistoryRecord("old-file", "历史结果");
  let state = lessonState.createLessonAppState({
    history: [currentRecord, previousRecord],
  });

  state = lessonState.reduceLessonAppState(state, {
    type: "file-selected",
    fileKey: "new-file",
  });

  state = lessonState.reduceLessonAppState(state, {
    type: "history-selected",
    record: previousRecord,
  });

  assert.equal(state.selectedFileKey, "");
  assert.equal(state.currentRecord?.fileKey, "old-file");
  assert.equal(lessonState.getVisibleLessonRecord(state)?.lesson.title, "历史结果");
});
