import katex from "katex";
import "katex/dist/katex.min.css";

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

function renderInlineMath(value = "") {
  const text = String(value);
  if (!text.trim()) {
    return "";
  }

  return text.replace(/\$([^$]+)\$/g, (_, expr) => {
    try {
      return katex.renderToString(expr.trim(), {
        throwOnError: false,
        displayMode: false,
        output: "html",
      });
    } catch {
      return escapeHtml(expr);
    }
  });
}

function renderBlockMath(value = "") {
  const text = String(value).trim();
  if (!text) {
    return "";
  }

  try {
    return katex.renderToString(text, {
      throwOnError: false,
      displayMode: true,
      output: "html",
    });
  } catch {
    return escapeHtml(text);
  }
}

function sanitizeSvg(svg = "") {
  return String(svg)
    .replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/g, (match, attrs, text) => {
      const content = renderInlineMath(text)
        .replace(/<[^>]*>/g, "")
        .trim();
      return `<text${attrs}>${escapeHtml(content)}</text>`;
    })
    .replace(/>\s*([^<]+?)\s*</g, (match, text) => {
      return `>${escapeHtml(String(text).trim())}<`;
    });
}

function sanitizeNarration(text = "") {
  return renderInlineMath(String(text).trim());
}

export function normalizeLesson(payload = {}) {
  const scenes = Array.isArray(payload.scenes)
    ? payload.scenes.map((scene, index) => ({
        id: scene?.id || `scene-${index + 1}`,
        title: renderInlineMath(scene?.title || `步骤 ${index + 1}`).replace(/<[^>]*>/g, ""),
        svg:
          typeof scene?.svg === "string" && scene.svg.trim().startsWith("<svg")
            ? sanitizeSvg(scene.svg)
            : fallbackSvg(scene?.title || `步骤 ${index + 1}`),
        narration:
          sanitizeNarration(scene?.narration) ||
          `这是第 ${index + 1} 步，请结合图示理解。`,
      }))
    : [];

  const fullNarration =
    sanitizeNarration(payload.fullNarration) ||
    scenes.map((scene) => scene.narration).join("\n");

  return {
    title: renderInlineMath(payload.title || "AI 老师讲解结果").replace(/<[^>]*>/g, ""),
    summary: renderInlineMath(payload.summary || "系统已根据图片生成分步讲解。"),
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
