function normalizeScenes(lesson) {
  return Array.isArray(lesson?.scenes) ? lesson.scenes : [];
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildLessonExportText(lesson, options = {}) {
  const scenes = normalizeScenes(lesson);
  const activeScene =
    scenes.find((scene) => scene?.id === options.activeSceneId) || null;
  const narration =
    lesson?.fullNarration?.trim() ||
    scenes
      .map((scene) => scene?.narration?.trim())
      .filter(Boolean)
      .join("\n");

  const sections = [
    lesson?.title?.trim() || "AI 老师讲解结果",
    lesson?.summary?.trim() || "系统已根据图片生成分步讲解。",
  ];

  if (activeScene) {
    sections.push(
      "当前选中分镜",
      `${activeScene.id} · ${activeScene.title || "未命名分镜"}`,
      activeScene.narration?.trim() || "当前分镜暂无讲解文本。",
    );
  }

  if (scenes.length > 0) {
    sections.push(
      "分镜列表",
      scenes
        .map((scene) =>
          [
            `${scene?.id || "scene"} · ${scene?.title || "未命名分镜"}`,
            scene?.narration?.trim() || "暂无讲解文本。",
          ].join("\n"),
        )
        .join("\n\n"),
    );
  }

  sections.push("完整讲解稿", narration || "暂无完整讲解稿。");

  return sections.join("\n\n");
}

export function buildLessonExportFilename(
  lesson,
  { prefix = "lesson", ext = "txt" } = {},
) {
  const safePrefix = slugify(prefix) || "lesson";
  const safeTitle = slugify(lesson?.title) || "export";
  const safeExt = String(ext).replace(/^\./, "") || "txt";

  return `${safePrefix}-${safeTitle}.${safeExt}`;
}

export async function copyLessonText(
  text,
  { clipboard = globalThis.navigator?.clipboard } = {},
) {
  const content = String(text ?? "").trim();

  if (!content) {
    throw new Error("No lesson text available to copy.");
  }

  if (!clipboard?.writeText) {
    throw new Error("Clipboard API is unavailable.");
  }

  await clipboard.writeText(content);
  return content;
}

export function downloadLessonText(lesson, options = {}) {
  const text = buildLessonExportText(lesson, options);
  const filename =
    options.filename || buildLessonExportFilename(lesson, options);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = globalThis.URL.createObjectURL(blob);
  const link = globalThis.document.createElement("a");

  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  globalThis.document.body.append(link);
  link.click();
  link.remove();
  globalThis.URL.revokeObjectURL(url);

  return { filename, text };
}
