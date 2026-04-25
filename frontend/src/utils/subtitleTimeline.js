const SENTENCE_BREAK_RE = /(?<=[。！？!?])/u;
const CLAUSE_BREAK_RE = /(?<=[，；：,;:])/u;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeText(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .replace(/\n+/g, " ")
    .trim();
}

export function splitNarrationIntoCaptions(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const sentences = normalized
    .split(SENTENCE_BREAK_RE)
    .map((part) => part.trim())
    .filter(Boolean);

  return sentences.flatMap((sentence) => {
    if (sentence.length <= 18) {
      return [sentence];
    }

    const clauses = sentence
      .split(CLAUSE_BREAK_RE)
      .map((part) => part.trim())
      .filter(Boolean);

    return clauses.length ? clauses : [sentence];
  });
}

export function buildSubtitleTimeline(text = "", options = {}) {
  const {
    minDurationMs = 1200,
    maxDurationMs = 3200,
    msPerChar = 130,
  } = options;

  return splitNarrationIntoCaptions(text).map((caption, index, captions) => {
    const durationMs = clamp(
      caption.length * msPerChar + 480,
      minDurationMs,
      maxDurationMs,
    );
    const startMs =
      index === 0 ? 0 : captions.slice(0, index).reduce((sum, _, cueIndex) => {
        const previousCue = splitNarrationIntoCaptions(text)[cueIndex];
        return sum + clamp(
          previousCue.length * msPerChar + 480,
          minDurationMs,
          maxDurationMs,
        );
      }, 0);

    return {
      id: `cue-${index + 1}`,
      text: caption,
      startMs,
      endMs: startMs + durationMs,
      durationMs,
    };
  });
}

export function getActiveSubtitleCue(timeline = [], elapsedMs = 0) {
  if (!Array.isArray(timeline) || timeline.length === 0) {
    return null;
  }

  return (
    timeline.find((cue) => elapsedMs >= cue.startMs && elapsedMs < cue.endMs) ||
    timeline[timeline.length - 1]
  );
}
