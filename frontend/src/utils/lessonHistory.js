import { normalizeLesson } from "./lesson.js";

export const LESSON_HISTORY_LIMIT = 5;
export const LESSON_HISTORY_STORAGE_KEY =
  "ai-teacher-classroom.lesson-history.v1";

function normalizeHistoryEntry(entry, index = 0) {
  if (!entry?.lesson) {
    return null;
  }

  const createdAt = Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now();
  const fileKey = typeof entry.fileKey === "string" ? entry.fileKey : "";

  return {
    id:
      typeof entry.id === "string" && entry.id
        ? entry.id
        : `${fileKey || "lesson"}-${createdAt}-${index}`,
    fileKey,
    fileName:
      typeof entry.fileName === "string" && entry.fileName
        ? entry.fileName
        : "未命名图片",
    createdAt,
    lesson: normalizeLesson(entry.lesson),
  };
}

export function createLessonHistoryEntry({
  createdAt = Date.now(),
  fileKey = "",
  fileName = "未命名图片",
  lesson,
}) {
  return normalizeHistoryEntry(
    {
      id: `${fileKey || "lesson"}-${createdAt}`,
      fileKey,
      fileName,
      createdAt,
      lesson,
    },
    0,
  );
}

export function loadLessonHistory(storage) {
  try {
    const rawValue = storage?.getItem(LESSON_HISTORY_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry, index) => normalizeHistoryEntry(entry, index))
      .filter(Boolean)
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, LESSON_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function saveLessonHistory(entries, storage) {
  if (!storage?.setItem) {
    return [];
  }

  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .map((entry, index) => normalizeHistoryEntry(entry, index))
    .filter(Boolean)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, LESSON_HISTORY_LIMIT);

  storage.setItem(
    LESSON_HISTORY_STORAGE_KEY,
    JSON.stringify(normalizedEntries),
  );

  return normalizedEntries;
}

export function prependLessonHistory(entries, nextEntry) {
  return (Array.isArray(entries) ? [nextEntry, ...entries] : [nextEntry])
    .map((entry, index) => normalizeHistoryEntry(entry, index))
    .filter(Boolean)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, LESSON_HISTORY_LIMIT);
}
