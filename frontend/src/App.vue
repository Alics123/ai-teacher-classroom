<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";

import LessonViewer from "./components/LessonViewer.vue";
import UploadPanel from "./components/UploadPanel.vue";
import VoiceControls from "./components/VoiceControls.vue";
import {
  generateLesson,
  isAbortError,
  isRetryableLessonError,
} from "./services/api.js";
import {
  createLessonHistoryEntry,
  loadLessonHistory,
  prependLessonHistory,
  saveLessonHistory,
} from "./utils/lessonHistory.js";
import {
  canRetryCurrentSelection,
  createFileKey,
  createLessonAppState,
  getVisibleLessonRecord,
  reduceLessonAppState,
} from "./utils/lessonState.js";

const selectedFile = ref(null);
const previewUrl = ref("");
const activeSceneId = ref("");
const appState = ref(createLessonAppState());
const isRetryableError = ref(false);
const lessonPlayback = ref({
  runId: 0,
  isPlaying: false,
  isPaused: false,
  sceneId: "",
  errorMessage: "",
});
const MAX_UPLOAD_MEGABYTES = 8;

let activeAbortController = null;
let requestSequence = 0;

const visibleRecord = computed(() => getVisibleLessonRecord(appState.value));
const lesson = computed(() => visibleRecord.value?.lesson || null);
const isLoading = computed(() => appState.value.phase === "loading");
const errorText = computed(() => appState.value.errorText);
const historyEntries = computed(() => appState.value.history);
const hasLesson = computed(() => lesson.value && lesson.value.scenes.length > 0);
const canRetry = computed(
  () =>
    Boolean(selectedFile.value) &&
    isRetryableError.value &&
    canRetryCurrentSelection(appState.value),
);
const voiceControlsKey = computed(() => visibleRecord.value?.id || "voice-empty");
const statusInfo = computed(() => {
  if (isLoading.value && selectedFile.value) {
    return {
      tone: "info",
      title: "AI 正在生成",
      text: `正在为 ${selectedFile.value.name} 生成讲解结果。完成后会替换下方内容。`,
    };
  }

  if (errorText.value) {
    return {
      tone: "error",
      title: "生成失败",
      text: errorText.value,
    };
  }

  if (selectedFile.value && !visibleRecord.value) {
    return {
      tone: "pending",
      title: "新图片已就绪",
      text: "当前预览是新选择的图片；旧结果已留在最近记录中，点击“生成讲解”后才会显示新结果。",
    };
  }

  if (visibleRecord.value) {
    return {
      tone: "success",
      title: "当前结果",
      text: `当前展示的是 ${visibleRecord.value.fileName} 的讲解结果。`,
    };
  }

  return {
    tone: "muted",
    title: "等待上传",
    text: "选择一张图片后即可开始生成；最近成功结果会保存在当前浏览器里。",
  };
});

function getStorage() {
  return typeof window !== "undefined" ? window.localStorage : undefined;
}

function persistHistory(entries) {
  try {
    return saveLessonHistory(entries, getStorage());
  } catch {
    return entries;
  }
}

function clearSelectedFilePreview() {
  selectedFile.value = null;
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
  }
  previewUrl.value = "";
}

function cancelActiveRequest() {
  if (!activeAbortController) {
    return;
  }

  const cancelledRequestId = appState.value.currentRequestId;
  activeAbortController.abort();
  activeAbortController = null;
  appState.value = reduceLessonAppState(appState.value, {
    type: "request-cancelled",
    requestId: cancelledRequestId,
  });
}

function setInlineError(message, { retryable = false } = {}) {
  isRetryableError.value = retryable;
  appState.value = {
    ...appState.value,
    errorText: message,
    phase:
      appState.value.phase === "loading"
        ? "error"
        : appState.value.phase,
  };
}

function formatCreatedAt(createdAt) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

watch(
  lesson,
  (nextLesson) => {
    if (!nextLesson?.scenes?.length) {
      activeSceneId.value = "";
      return;
    }

    const hasActiveScene = nextLesson.scenes.some(
      (scene) => scene.id === activeSceneId.value,
    );
    activeSceneId.value = hasActiveScene
      ? activeSceneId.value
      : nextLesson.scenes[0].id;
  },
  { immediate: true },
);

const restoredHistory = loadLessonHistory(getStorage());
if (restoredHistory.length) {
  appState.value = reduceLessonAppState(appState.value, {
    type: "history-loaded",
    history: restoredHistory,
  });
}

function onFileSelect(file) {
  if (!file?.type?.startsWith("image/")) {
    cancelActiveRequest();
    clearSelectedFilePreview();
    isRetryableError.value = false;
    appState.value = reduceLessonAppState(appState.value, {
      type: "file-cleared",
      errorText: "请选择图片文件",
    });
    return;
  }

  if (file.size > MAX_UPLOAD_MEGABYTES * 1024 * 1024) {
    cancelActiveRequest();
    clearSelectedFilePreview();
    isRetryableError.value = false;
    appState.value = reduceLessonAppState(appState.value, {
      type: "file-cleared",
      errorText: `图片不能超过 ${MAX_UPLOAD_MEGABYTES}MB`,
    });
    return;
  }

  cancelActiveRequest();
  isRetryableError.value = false;
  selectedFile.value = file;
  appState.value = reduceLessonAppState(appState.value, {
    type: "file-selected",
    fileKey: createFileKey(file),
  });

  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
  }
  previewUrl.value = URL.createObjectURL(file);
}

async function onSubmit() {
  if (!selectedFile.value) {
    setInlineError("请先选择一张图片");
    return;
  }

  cancelActiveRequest();
  isRetryableError.value = false;
  requestSequence += 1;
  const requestId = requestSequence;
  const submittedFile = selectedFile.value;
  const fileKey = createFileKey(submittedFile);
  const controller = new AbortController();

  activeAbortController = controller;
  appState.value = reduceLessonAppState(appState.value, {
    type: "submit-start",
    requestId,
    fileKey,
  });

  try {
    const generatedLesson = await generateLesson(submittedFile, {
      signal: controller.signal,
    });
    const historyEntry = createLessonHistoryEntry({
      fileKey,
      fileName: submittedFile.name,
      lesson: generatedLesson,
    });
    const history = persistHistory(
      prependLessonHistory(appState.value.history, historyEntry),
    );

    appState.value = reduceLessonAppState(appState.value, {
      type: "submit-success",
      requestId,
      record: historyEntry,
      history,
    });
  } catch (error) {
    if (isAbortError(error)) {
      appState.value = reduceLessonAppState(appState.value, {
        type: "request-cancelled",
        requestId,
      });
      return;
    }

    isRetryableError.value = isRetryableLessonError(error);
    appState.value = reduceLessonAppState(appState.value, {
      type: "submit-error",
      requestId,
      errorText: error instanceof Error ? error.message : "生成失败",
    });
  } finally {
    if (activeAbortController === controller) {
      activeAbortController = null;
    }
  }
}

function onSceneChange(sceneId) {
  activeSceneId.value = sceneId;
}

function onRetry() {
  onSubmit();
}

function onPlaybackStateChange(nextPlaybackState) {
  lessonPlayback.value = {
    ...lessonPlayback.value,
    ...nextPlaybackState,
  };
}

function onHistorySelect(entry) {
  cancelActiveRequest();
  clearSelectedFilePreview();
  isRetryableError.value = false;
  appState.value = reduceLessonAppState(appState.value, {
    type: "history-selected",
    record: entry,
  });
}

onBeforeUnmount(() => {
  cancelActiveRequest();
  clearSelectedFilePreview();
});
</script>

<template>
  <main class="page-shell">
    <section class="hero-shell">
      <div class="hero-topline">
        <span>放映中：AI Teacher Classroom</span>
        <span>信号：图片输入 · 9109 转发 · SVG 分镜 · 语音旁白</span>
      </div>

      <div class="hero-title-card">
        <span class="hero-title-card__label">片头字幕 / Opening Titles</span>
        <span class="hero-title-card__text">为每道题都准备一段正式开场</span>
      </div>

      <div class="hero-stage">
        <div class="hero-curtain hero-curtain--left" aria-hidden="true"></div>
        <div class="hero-curtain hero-curtain--right" aria-hidden="true"></div>
        <div class="hero-light hero-light--left" aria-hidden="true"></div>
        <div class="hero-light hero-light--right" aria-hidden="true"></div>
        <div class="hero-stage-backdrop" aria-hidden="true"></div>
        <div class="hero-stage-frame">
          <div class="hero-stage-copy">
            <p class="hero-kicker">Cinematic teaching console</p>
            <h1>把一道题，讲成一场可播放的课堂电影。</h1>
            <p class="hero-summary">
              上传题目截图后，AI 会拆出 2 到 4 个分镜，配上中文讲解稿，并在舞台里同步字幕与朗读节奏。
            </p>

            <div class="hero-metrics">
              <div>
                <span class="metric-value">2–4</span>
                <span class="metric-label">分镜输出</span>
              </div>
              <div>
                <span class="metric-value">SVG</span>
                <span class="metric-label">可缩放画面</span>
              </div>
              <div>
                <span class="metric-value">TTS</span>
                <span class="metric-label">语音旁白</span>
              </div>
            </div>
          </div>

          <div class="hero-stage-controls">
            <div class="hero-stage-chip">课堂灯光已就位</div>
            <div class="hero-stage-chip hero-stage-chip--muted">推荐上传清晰、单题、横竖都可</div>
          </div>
        </div>
      </div>

      <div class="hero-grid">
        <UploadPanel
          :file-name="selectedFile?.name || ''"
          :image-preview="previewUrl"
          :is-loading="isLoading"
          :error-text="errorText"
          @file-select="onFileSelect"
          @submit="onSubmit"
        />

        <aside class="hero-aside">
          <div class="hero-note hero-note--spotlight">
            <p class="hero-note-label">本次放映</p>
            <p>{{ statusInfo.title }}</p>
            <span>{{ statusInfo.text }}</span>
          </div>
          <div class="hero-note">
            <p class="hero-note-label">课堂质感</p>
            <p>黑盒剧场 + 金色聚光灯 + 轻微胶片颗粒，让讲题更像一场正在发生的演示。</p>
          </div>
          <div class="hero-note">
            <p class="hero-note-label">工作流</p>
            <p>前端负责展示与朗读，后端负责模型调用，整条链路便于替换和扩展。</p>
          </div>
        </aside>
      </div>
    </section>

    <section class="status-shell" :class="`status-shell--${statusInfo.tone}`">
      <div class="status-copy">
        <p class="status-label">{{ statusInfo.title }}</p>
        <p class="status-text">{{ statusInfo.text }}</p>
      </div>
      <button
        v-if="canRetry"
        type="button"
        class="status-button"
        @click="onRetry"
      >
        重试上一场讲解
      </button>
    </section>

    <section class="result-shell">
      <LessonViewer
        :lesson="lesson"
        :active-scene-id="activeSceneId"
        :playback-state="lessonPlayback"
        @scene-select="onSceneChange"
      />
      <VoiceControls
        :key="voiceControlsKey"
        :lesson="lesson"
        :selected-scene-id="activeSceneId"
        @scene-change="onSceneChange"
        @playback-state="onPlaybackStateChange"
      />
    </section>

    <section v-if="historyEntries.length" class="history-shell">
      <div class="history-header">
        <p class="history-kicker">放映档案</p>
        <p class="history-description">最近成功生成的课堂片段会保存在当前浏览器，方便回看与复用。</p>
      </div>

      <div class="history-grid">
        <button
          v-for="entry in historyEntries"
          :key="entry.id"
          type="button"
          class="history-card"
          :class="{ 'history-card--current': visibleRecord?.id === entry.id }"
          @click="onHistorySelect(entry)"
        >
          <div class="history-meta">
            <p class="history-file">{{ entry.fileName }}</p>
            <p class="history-time">{{ formatCreatedAt(entry.createdAt) }}</p>
          </div>
          <h3 class="history-title">{{ entry.lesson.title }}</h3>
          <p class="history-summary">{{ entry.lesson.summary }}</p>
          <p class="history-scenes">{{ entry.lesson.scenes.length }} 张分镜</p>
        </button>
      </div>
    </section>

    <section v-if="hasLesson" class="footer-note">
      <p>
        提示：如果某一步的图示不够准确，可以重新上传更清晰的图片，或者稍后在后端调 prompt。
      </p>
    </section>
  </main>
</template>

<style scoped>
.page-shell {
  display: grid;
  gap: 26px;
  min-height: 100vh;
  padding: 24px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.5));
}

.hero-shell {
  display: grid;
  gap: 18px;
}

.hero-topline {
  display: flex;
  gap: 12px 18px;
  flex-wrap: wrap;
  color: rgba(245, 241, 232, 0.7);
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.hero-title-card {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
  color: #fff4de;
}

.hero-title-card__label {
  color: var(--accent-strong);
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.hero-title-card__text {
  color: var(--text-secondary);
}

.hero-stage {
  position: relative;
  overflow: hidden;
  border-radius: 34px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(14, 14, 17, 0.94), rgba(5, 5, 7, 0.96));
  box-shadow:
    rgba(0, 0, 0, 0.4) 0px 24px 60px,
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.hero-curtain {
  position: absolute;
  top: -4%;
  bottom: -4%;
  width: 18%;
  z-index: 2;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 18%, rgba(0, 0, 0, 0.22) 60%, rgba(255, 255, 255, 0.02)),
    repeating-linear-gradient(
      90deg,
      rgba(150, 34, 18, 0.88) 0,
      rgba(150, 34, 18, 0.88) 18px,
      rgba(118, 21, 15, 0.92) 18px,
      rgba(118, 21, 15, 0.92) 36px
    );
  filter: saturate(1.12) contrast(1.08);
  box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.28);
}

.hero-curtain--left {
  left: 0;
  border-radius: 0 26px 26px 0;
  clip-path: polygon(0 0, 86% 0, 100% 18%, 100% 82%, 84% 100%, 0 100%);
  animation: curtain-sway-left 8s ease-in-out infinite;
}

.hero-curtain--right {
  right: 0;
  border-radius: 26px 0 0 26px;
  clip-path: polygon(14% 0, 100% 0, 100% 100%, 14% 100%, 0 82%, 0 18%);
  animation: curtain-sway-right 8s ease-in-out infinite;
}

.hero-light {
  position: absolute;
  inset: 12% auto auto 50%;
  width: 32%;
  height: 66%;
  z-index: 1;
  pointer-events: none;
  transform: translateX(-50%);
  background: radial-gradient(circle, rgba(255, 230, 177, 0.26), transparent 62%);
  filter: blur(18px);
  mix-blend-mode: screen;
}

.hero-light--left {
  left: 31%;
  animation: spotlight-sweep-left 9s ease-in-out infinite;
}

.hero-light--right {
  left: 69%;
  animation: spotlight-sweep-right 10.5s ease-in-out infinite;
}

.hero-stage-backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 15% 10%, rgba(243, 177, 94, 0.22), transparent 26%),
    radial-gradient(circle at 85% 18%, rgba(100, 135, 255, 0.2), transparent 28%),
    radial-gradient(circle at 50% 110%, rgba(243, 177, 94, 0.18), transparent 36%);
  opacity: 0.95;
}

.hero-stage-frame {
  position: relative;
  z-index: 3;
  display: grid;
  gap: 26px;
  padding: 30px;
}

.hero-stage-copy {
  display: grid;
  gap: 16px;
  max-width: 860px;
}

.hero-kicker {
  margin: 0;
  color: var(--accent-strong);
  font-size: 13px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.hero-stage h1 {
  margin: 0;
  max-width: 12ch;
  font-size: clamp(42px, 7vw, 92px);
  line-height: 0.92;
  letter-spacing: -0.04em;
  text-wrap: balance;
}

.hero-summary {
  margin: 0;
  max-width: 760px;
  color: var(--text-secondary);
  font-size: clamp(18px, 2vw, 22px);
  line-height: 1.6;
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  max-width: 580px;
}

.hero-metrics > div {
  padding: 16px 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.metric-value {
  display: block;
  color: #fff4de;
  font-size: 28px;
  line-height: 1;
}

.metric-label {
  display: block;
  margin-top: 8px;
  color: var(--text-muted);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-stage-controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.hero-stage-chip {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 245, 228, 0.9);
  font-size: 13px;
}

.hero-stage-chip--muted {
  color: rgba(245, 241, 232, 0.68);
}

.hero-grid {
  display: grid;
  gap: 22px;
  grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);
}

.hero-aside {
  display: grid;
  gap: 16px;
}

.hero-note {
  display: grid;
  gap: 10px;
  padding: 22px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.hero-note--spotlight {
  background: linear-gradient(180deg, rgba(243, 177, 94, 0.12), rgba(255, 255, 255, 0.04));
  border-color: rgba(243, 177, 94, 0.22);
}

.hero-note p,
.hero-note span {
  margin: 0;
}

.hero-note p {
  color: #fff5e5;
  font-size: 18px;
}

.hero-note span {
  color: var(--text-secondary);
  line-height: 1.55;
}

.hero-note-label {
  color: var(--accent-strong);
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.status-shell {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.status-shell--success,
.status-shell--muted,
.status-shell--pending {
  color: rgba(255, 255, 255, 0.92);
}

.status-shell--error {
  border-color: rgba(255, 138, 138, 0.28);
  background: rgba(255, 138, 138, 0.1);
  color: #ffd7d7;
}

.status-shell--info {
  border-color: rgba(243, 177, 94, 0.25);
  background: rgba(243, 177, 94, 0.08);
  color: #ffe8c6;
}

.status-copy {
  display: grid;
  gap: 6px;
}

.status-label,
.status-text {
  margin: 0;
}

.status-label {
  font-size: 14px;
  color: var(--accent-strong);
}

.status-shell--error .status-label {
  color: inherit;
}

.status-button {
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  padding: 10px 18px;
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  white-space: nowrap;
}

.result-shell {
  display: grid;
  gap: 18px;
}

.history-shell {
  display: grid;
  gap: 18px;
  padding: 24px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.history-header {
  display: grid;
  gap: 6px;
}

.history-kicker,
.history-description,
.history-file,
.history-time,
.history-summary,
.history-scenes {
  margin: 0;
}

.history-kicker {
  color: var(--accent-strong);
  font-size: 14px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.history-description,
.history-time,
.history-summary,
.history-scenes {
  color: var(--text-secondary);
}

.history-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.history-card {
  display: grid;
  gap: 10px;
  width: 100%;
  padding: 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid transparent;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.history-card:hover {
  border-color: rgba(243, 177, 94, 0.22);
  transform: translateY(-1px);
}

.history-card:focus-visible {
  outline: 2px solid rgba(243, 177, 94, 0.78);
  outline-offset: 3px;
}

.history-card--current {
  border-color: rgba(243, 177, 94, 0.3);
  box-shadow: inset 0 0 0 1px rgba(243, 177, 94, 0.12);
}

.history-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.history-file {
  color: #ffffff;
  font-size: 14px;
  word-break: break-all;
}

.history-title {
  margin: 0;
  color: #ffffff;
  font-size: 21px;
  line-height: 1.19;
}

.footer-note {
  padding: 0 8px 32px;
  color: var(--text-secondary);
}

.footer-note p {
  margin: 0;
}

@media (max-width: 1120px) {
  .hero-grid,
  .hero-metrics {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .status-shell {
    align-items: stretch;
    flex-direction: column;
  }

  .page-shell {
    padding: 16px;
  }

  .hero-stage-frame {
    padding: 22px;
  }

  .hero-stage h1 {
    max-width: none;
    font-size: clamp(36px, 12vw, 60px);
  }
}
</style>
