const fallbackSvg = (title = "讲解步骤") =>
  `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="320" height="180" rx="24" fill="#f5f5f7" />
    <rect x="18" y="18" width="284" height="144" rx="18" fill="#ffffff" stroke="#0071e3" stroke-width="3" />
    <text x="160" y="94" font-size="20" text-anchor="middle" fill="#1d1d1f">${escapeHtml(title)}</text>
  </svg>`;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function normalizeLesson(payload = {}) {
  const scenes = Array.isArray(payload.scenes)
    ? payload.scenes.map((scene, index) => ({
        id: scene?.id || `scene-${index + 1}`,
        title: scene?.title || `步骤 ${index + 1}`,
        svg:
          typeof scene?.svg === "string" && scene.svg.trim().startsWith("<svg")
            ? scene.svg
            : fallbackSvg(scene?.title || `步骤 ${index + 1}`),
        narration:
          scene?.narration?.trim() || `这是第 ${index + 1} 步，请结合图示理解。`,
      }))
    : [];

  const fullNarration =
    payload.fullNarration?.trim() ||
    scenes.map((scene) => scene.narration).join("\n");

  return {
    title: payload.title?.trim() || "AI 老师讲解结果",
    summary: payload.summary?.trim() || "系统已根据图片生成分步讲解。",
    scenes,
    fullNarration,
  };
}

export function buildNarrationQueue(lesson) {
  if (!lesson || !Array.isArray(lesson.scenes)) {
    return [];
  }
  return lesson.scenes.map((scene) => ({
    id: scene.id,
    label: scene.title,
    text: scene.narration,
  }));
}
