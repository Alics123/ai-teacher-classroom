<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";

import {
  copyLessonText,
  downloadLessonText,
} from "../utils/lessonExport.js";
import {
  buildSubtitleTimeline,
  getActiveSubtitleCue,
} from "../utils/subtitleTimeline.js";

const props = defineProps({
  lesson: {
    type: Object,
    default: null,
  },
  activeSceneId: {
    type: String,
    default: "",
  },
  playbackState: {
    type: Object,
    default: () => ({
      runId: 0,
      isPlaying: false,
      isPaused: false,
      sceneId: "",
      errorMessage: "",
    }),
  },
});

const emit = defineEmits(["scene-select"]);

const statusText = ref("");
const localSceneId = ref("");
const subtitleElapsedMs = ref(0);
const subtitleAnchorMs = ref(0);

let subtitleFrame = 0;
let subtitleStartedAt = 0;

const scenes = computed(() =>
  Array.isArray(props.lesson?.scenes) ? props.lesson.scenes : [],
);

const resolvedActiveSceneId = computed(() => {
  if (props.activeSceneId) {
    return props.activeSceneId;
  }
  if (localSceneId.value) {
    return localSceneId.value;
  }
  return scenes.value[0]?.id || "";
});

const currentScene = computed(() => {
  return (
    scenes.value.find((scene) => scene.id === resolvedActiveSceneId.value) ||
    scenes.value[0] ||
    null
  );
});

const currentNarration = computed(() => {
  return (
    currentScene.value?.narration?.trim() ||
    props.lesson?.fullNarration?.trim() ||
    ""
  );
});

const sceneTimeline = computed(() =>
  buildSubtitleTimeline(currentNarration.value),
);

const isSceneSpeaking = computed(() => {
  return Boolean(
    props.playbackState?.isPlaying &&
      props.playbackState?.sceneId &&
      props.playbackState.sceneId === resolvedActiveSceneId.value,
  );
});

const activeSubtitleCue = computed(() => {
  if (!isSceneSpeaking.value) {
    return null;
  }
  return getActiveSubtitleCue(sceneTimeline.value, subtitleElapsedMs.value);
});

const subtitleText = computed(() => {
  return (
    activeSubtitleCue.value?.text ||
    currentNarration.value ||
    "讲解字幕会在这里同步显示。"
  );
});

const subtitleProgress = computed(() => {
  const cue = activeSubtitleCue.value;
  if (!cue) {
    return 0;
  }

  const progress =
    (subtitleElapsedMs.value - cue.startMs) / Math.max(cue.durationMs, 1);
  return Math.min(Math.max(progress, 0), 1);
});

const stageKey = computed(
  () => `${resolvedActiveSceneId.value}-${props.playbackState?.runId || 0}`,
);

const reviewParagraphs = computed(() => {
  return String(props.lesson?.fullNarration || "")
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
});

const sceneLocked = computed(() => Boolean(props.playbackState?.isPlaying));

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function cancelSubtitleFrame() {
  if (subtitleFrame) {
    cancelAnimationFrame(subtitleFrame);
    subtitleFrame = 0;
  }
}

function tickSubtitleClock() {
  subtitleElapsedMs.value =
    subtitleAnchorMs.value + (nowMs() - subtitleStartedAt);

  const finalCue = sceneTimeline.value[sceneTimeline.value.length - 1];
  if (finalCue && subtitleElapsedMs.value >= finalCue.endMs) {
    subtitleElapsedMs.value = finalCue.endMs;
    cancelSubtitleFrame();
    return;
  }

  subtitleFrame = requestAnimationFrame(tickSubtitleClock);
}

function startSubtitleClock({ reset = false } = {}) {
  cancelSubtitleFrame();
  if (reset) {
    subtitleElapsedMs.value = 0;
    subtitleAnchorMs.value = 0;
  }
  subtitleStartedAt = nowMs();
  subtitleFrame = requestAnimationFrame(tickSubtitleClock);
}

function pauseSubtitleClock() {
  cancelSubtitleFrame();
  subtitleAnchorMs.value = subtitleElapsedMs.value;
}

function stopSubtitleClock({ reset = true } = {}) {
  cancelSubtitleFrame();
  if (reset) {
    subtitleElapsedMs.value = 0;
    subtitleAnchorMs.value = 0;
  }
}

function selectScene(sceneId) {
  if (!sceneId || sceneLocked.value) {
    return;
  }

  localSceneId.value = sceneId;
  statusText.value = "";
  emit("scene-select", sceneId);
}

async function handleCopyReview() {
  try {
    await copyLessonText(props.lesson?.fullNarration || currentNarration.value);
    statusText.value = "已复制课程回顾。";
  } catch (error) {
    statusText.value =
      error instanceof Error ? error.message : "当前浏览器暂不支持复制。";
  }
}

function handleDownloadLesson() {
  if (!props.lesson) {
    return;
  }

  const { filename } = downloadLessonText(props.lesson, {
    activeSceneId: resolvedActiveSceneId.value,
  });
  statusText.value = `已开始下载 ${filename}。`;
}

watch(
  () => props.lesson,
  () => {
    localSceneId.value = "";
    statusText.value = "";
    stopSubtitleClock({ reset: true });
  },
);

watch(
  () => props.activeSceneId,
  (sceneId) => {
    if (sceneId) {
      localSceneId.value = sceneId;
    }
  },
);

watch(
  currentNarration,
  () => {
    stopSubtitleClock({ reset: true });
  },
);

watch(
  () => [
    props.playbackState?.runId || 0,
    props.playbackState?.sceneId || "",
    Boolean(props.playbackState?.isPlaying),
    Boolean(props.playbackState?.isPaused),
    resolvedActiveSceneId.value,
  ],
  ([runId, spokenSceneId, isPlaying, isPaused, activeSceneId], previous = []) => {
    const [prevRunId, prevSceneId, , , prevActiveSceneId] = previous;
    const shouldReset =
      runId !== prevRunId ||
      spokenSceneId !== prevSceneId ||
      activeSceneId !== prevActiveSceneId;
    const shouldRun =
      isPlaying &&
      !isPaused &&
      spokenSceneId &&
      spokenSceneId === activeSceneId &&
      sceneTimeline.value.length > 0;

    if (!shouldRun) {
      if (isPaused) {
        pauseSubtitleClock();
        return;
      }
      stopSubtitleClock({ reset: true });
      return;
    }

    startSubtitleClock({ reset: shouldReset });
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopSubtitleClock({ reset: true });
});
</script>

<template>
  <section class="lesson-shell">
    <div v-if="!lesson" class="lesson-empty">
      <p class="empty-title">结果会显示在这里</p>
      <p class="empty-description">
        上传图片后，这里会变成一个课堂讲解舞台，只展示分镜 SVG 和同步字幕。
      </p>
    </div>

    <template v-else>
      <header class="lesson-header">
        <div class="lesson-header-copy">
          <p class="lesson-kicker">课堂讲解</p>
          <h2>{{ lesson.title }}</h2>
          <p class="lesson-summary">{{ lesson.summary }}</p>
        </div>
        <div class="lesson-header-meta">
          <span class="lesson-count">{{ scenes.length }} 个讲解步骤</span>
        </div>
      </header>

      <section class="lesson-stage">
        <div class="stage-head">
          <div class="stage-head-copy">
            <p class="stage-label">课堂舞台</p>
            <h3>{{ currentScene?.title || "等待选择分镜" }}</h3>
          </div>
          <p class="stage-hint">
            {{ sceneLocked ? "讲解播放中，舞台会自动跟随语音切换。" : "点击下方步骤可切换分镜。" }}
          </p>
        </div>

        <div
          class="stage-frame"
          :class="{ 'stage-frame--playing': isSceneSpeaking }"
        >
          <div :key="stageKey" class="stage-board">
            <div class="stage-board-grid" aria-hidden="true"></div>
            <div class="stage-board-spotlight" aria-hidden="true"></div>
            <div class="stage-svg-shell">
              <div class="stage-svg" v-html="currentScene?.svg"></div>
            </div>
            <div
              v-if="isSceneSpeaking"
              class="stage-pointer"
              aria-hidden="true"
            ></div>
          </div>
        </div>

        <div class="subtitle-shell">
          <p class="subtitle-label">
            {{ isSceneSpeaking ? "同步字幕" : "当前字幕" }}
          </p>
          <p class="subtitle-text">{{ subtitleText }}</p>
          <div class="subtitle-progress">
            <span :style="{ transform: `scaleX(${subtitleProgress})` }"></span>
          </div>
        </div>
      </section>

      <nav class="scene-rail" aria-label="讲解步骤">
        <button
          v-for="scene in scenes"
          :key="scene.id"
          type="button"
          class="scene-pill"
          :class="{ 'scene-pill--active': resolvedActiveSceneId === scene.id }"
          :disabled="sceneLocked"
          @click="selectScene(scene.id)"
        >
          <span class="scene-pill-index">{{ scene.id }}</span>
          <span class="scene-pill-title">{{ scene.title }}</span>
        </button>
      </nav>

      <p v-if="statusText" class="lesson-status">{{ statusText }}</p>

      <section class="course-review">
        <div class="course-review-head">
          <div>
            <p class="review-label">课程回顾</p>
            <h3 class="review-title">完整讲解整理</h3>
          </div>
          <div class="course-review-actions">
            <button
              type="button"
              class="review-action review-action--primary"
              @click="handleCopyReview"
            >
              复制回顾
            </button>
            <button
              type="button"
              class="review-action"
              @click="handleDownloadLesson"
            >
              下载结果
            </button>
          </div>
        </div>

        <div class="course-review-summary">
          <p>{{ lesson.summary }}</p>
        </div>

        <div class="course-review-body">
          <p
            v-for="(paragraph, index) in reviewParagraphs"
            :key="`${index}-${paragraph.slice(0, 12)}`"
            class="review-paragraph"
          >
            {{ paragraph }}
          </p>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
undefined</style>
