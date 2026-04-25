import test from "node:test";
import assert from "node:assert/strict";

async function loadLessonHistoryModule() {
  try {
    return await import("./lessonHistory.js");
  } catch {
    return null;
  }
}

function createStorageMock(seed = {}) {
  const store = new Map(Object.entries(seed));

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function createRecord(id, createdAt) {
  return {
    id,
    fileKey: `${id}-file`,
    fileName: `${id}.png`,
    createdAt,
    lesson: {
      title: id,
      summary: `${id} summary`,
      fullNarration: `${id} full narration`,
      scenes: [{ id: "scene-1", title: "step", narration: "narration", svg: "<svg></svg>" }],
    },
  };
}

test("loadLessonHistory returns newest valid records and tolerates bad storage data", async () => {
  const lessonHistory = await loadLessonHistoryModule();

  assert.ok(lessonHistory, "lessonHistory.js should exist");
  assert.equal(typeof lessonHistory.loadLessonHistory, "function");
  assert.equal(typeof lessonHistory.LESSON_HISTORY_STORAGE_KEY, "string");

  const brokenStorage = createStorageMock({
    [lessonHistory.LESSON_HISTORY_STORAGE_KEY]: "{not-json",
  });
  assert.deepEqual(lessonHistory.loadLessonHistory(brokenStorage), []);

  const populatedStorage = createStorageMock({
    [lessonHistory.LESSON_HISTORY_STORAGE_KEY]: JSON.stringify([
      createRecord("older", 10),
      createRecord("newer", 20),
    ]),
  });

  const entries = lessonHistory.loadLessonHistory(populatedStorage);

  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["newer", "older"],
  );
  assert.equal(entries[0].lesson.title, "newer");
});

test("saveLessonHistory trims to the configured recent limit", async () => {
  const lessonHistory = await loadLessonHistoryModule();

  assert.ok(lessonHistory, "lessonHistory.js should exist");
  assert.equal(typeof lessonHistory.saveLessonHistory, "function");

  const storage = createStorageMock();
  const entries = Array.from({ length: 8 }, (_, index) =>
    createRecord(`record-${index + 1}`, index + 1),
  );

  lessonHistory.saveLessonHistory(entries, storage);

  const savedEntries = JSON.parse(
    storage.getItem(lessonHistory.LESSON_HISTORY_STORAGE_KEY),
  );

  assert.equal(savedEntries.length, lessonHistory.LESSON_HISTORY_LIMIT);
  assert.equal(savedEntries[0].id, "record-8");
});
