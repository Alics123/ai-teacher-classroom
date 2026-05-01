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
  getLessonStageSnapshot,
  getLessonStageSteps,
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
const stageSteps = computed(() => getLessonStageSteps(appState.value));
const statusInfo = computed(() => {
  const stage = getLessonStageSnapshot(appState.value);

  if (isLoading.value && selectedFile.value) {
    return {
      tone: stage.label === "课堂质检" ? "warning" : "info",
      title: stage.label,
      text: `正在为 ${selectedFile.value.name} 生成讲解结果。${stage.detail}`,
      progress: stage.progress,
    };
  }

  if (errorText.value) {
    return {
      tone: "error",
      title: "生成失败",
      text: errorText.value,
      progress: 0,
    };
  }

  if (selectedFile.value && !visibleRecord.value) {
    return {
      tone: "pending",
      title: stage.label,
      text: "当前预览是新选择的图片；旧结果已留在最近记录中，点击“生成讲解”后才会显示新结果。",
      progress: stage.progress,
    };
  }

  if (visibleRecord.value) {
    return {
      tone: "success",
      title: stage.label,
      text: `当前展示的是 ${visibleRecord.value.fileName} 的讲解结果。`,
      progress: stage.progress,
    };
  }

  return {
    tone: "muted",
    title: stage.label,
    text: stage.detail,
    progress: stage.progress,
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
      <UploadPanel
        :file-name="selectedFile?.name || ''"
        :image-preview="previewUrl"
        :is-loading="isLoading"
        :error-text="errorText"
        @file-select="onFileSelect"
        @submit="onSubmit"
      />
    </section>

    <section class="status-shell" :class="`status-shell--${statusInfo.tone}`">
      <div class="status-copy">
        <p class="status-label">{{ statusInfo.title }}</p>
        <p class="status-text">{{ statusInfo.text }}</p>
        <div class="status-progress">
          <span :style="{ transform: `scaleX(${statusInfo.progress ?? 0})` }"></span>
        </div>
      </div>
      <button
        v-if="canRetry"
        type="button"
        class="status-button"
        @click="onRetry"
      >
        重试
      </button>
    </section>

    <section class="stage-shell">
      <div class="stage-shell-head">
        <div class="stage-flow-head">
          <p class="stage-flow-kicker">阶段流程</p>
          <h3>课堂生成进度</h3>
        </div>
        <p class="stage-shell-meta">
          这不是装饰性的加载条，而是把讲解生成拆成可以理解的阶段。
        </p>
      </div>
      <ol class="stage-flow-list">
        <li
          v-for="step in stageSteps"
          :key="step.label"
          class="stage-flow-item"
          :class="{
            'stage-flow-item--done': step.done,
            'stage-flow-item--active': step.active,
          }"
        >
          <span class="stage-flow-dot"></span>
          <div class="stage-flow-copy">
            <strong>{{ step.label }}</strong>
            <span>{{ step.detail }}</span>
          </div>
        </li>
      </ol>
    </section>

    <section class="result-shell">
      <div class="result-main">
        <LessonViewer
          :lesson="lesson"
          :active-scene-id="activeSceneId"
          :playback-state="lessonPlayback"
          @scene-select="onSceneChange"
        />
      </div>
      <aside class="result-sidebar">
        <VoiceControls
          :key="voiceControlsKey"
          :lesson="lesson"
          :selected-scene-id="activeSceneId"
          @scene-change="onSceneChange"
          @playback-state="onPlaybackStateChange"
        />
        <section class="result-note">
          <p class="result-note-kicker">教学说明</p>
          <h3>三步完成一张图片的讲解</h3>
          <ol>
            <li>识别题目中的关键对象与问题。</li>
            <li>组织成适合课堂展示的分镜。</li>
            <li>生成可朗读、可检查的教学脚本。</li>
          </ol>
        </section>
      </aside>
    </section>

    <section v-if="historyEntries.length" class="history-shell">
      <div class="history-header">
        <p class="history-kicker">历史记录</p>
        <p class="history-description">最近成功生成的结果。</p>
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
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.page-shell {
  display: grid;
  gap: 22px;
  min-height: 100vh;
  padding: 20px;
  background: transparent;
}

.hero-shell,
.result-shell,
.history-shell {
  display: grid;
}

.status-shell,
.stage-flow {
  display: flex;
  gap: 14px;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(248, 244, 236, 0.92)),
    #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow:
    0 18px 44px rgba(96, 77, 51, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.88);
}

.status-progress {
  position: relative;
  height: 4px;
  border-radius: 999px;
  background: rgba(215, 146, 45, 0.12);
  overflow: hidden;
}

.status-progress span {
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: left center;
  background: linear-gradient(90deg, #ffd79e, #d7922d);
}

.status-copy,
.stage-flow-head {
  display: grid;
  gap: 4px;
}

.status-label,
.status-text,
.history-kicker,
.history-description,
.history-file,
.history-time,
.stage-flow-kicker,
.stage-flow h3 {
  margin: 0;
}

.status-label {
  color: #d7922d;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.status-button {
  border: 1px solid rgba(42, 35, 29, 0.08);
  border-radius: 999px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.96);
  color: #2a231d;
}

.stage-shell {
  display: grid;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(248, 244, 236, 0.92)),
    #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow:
    0 18px 44px rgba(96, 77, 51, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.88);
}

.stage-shell-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.stage-shell-meta {
  margin: 0;
  max-width: 480px;
  color: rgba(42, 35, 29, 0.72);
  line-height: 1.6;
}

.stage-flow-list {
  list-style: none;
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
}

.stage-flow-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(0, 0, 0, 0.04);
  color: rgba(42, 35, 29, 0.64);
}

.stage-flow-copy {
  display: grid;
  gap: 3px;
}

.stage-flow-copy strong {
  font-size: 15px;
}

.stage-flow-copy span {
  font-size: 13px;
  line-height: 1.5;
}

.stage-flow-dot {
  width: 12px;
  height: 12px;
  margin-top: 4px;
  border-radius: 50%;
  background: rgba(42, 35, 29, 0.18);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.7);
  flex: 0 0 auto;
}

.stage-flow-item--done .stage-flow-dot {
  background: #d7922d;
}

.stage-flow-item--active {
  background: linear-gradient(180deg, rgba(255, 215, 158, 0.18), rgba(255, 255, 255, 0.84));
  border-color: rgba(215, 146, 45, 0.2);
  color: #2a231d;
}

.stage-flow-item--active .stage-flow-dot {
  background: linear-gradient(180deg, #ffd79e, #d7922d);
  box-shadow: 0 0 0 8px rgba(215, 146, 45, 0.14);
}

.stage-flow-item--done,
.stage-flow-item--active {
  color: #2a231d;
}

.status-shell--info {
  border-color: rgba(215, 146, 45, 0.22);
  background:
    linear-gradient(180deg, rgba(255, 215, 158, 0.16), rgba(255, 255, 255, 0.92)),
    #ffffff;
}

.result-shell {
  gap: 18px;
}

.result-main {
  min-width: 0;
}

.result-sidebar {
  display: grid;
  gap: 16px;
  align-content: start;
}

.result-note {
  display: grid;
  gap: 10px;
  padding: 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.result-note-kicker {
  margin: 0;
  color: #d7922d;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.result-note h3,
.result-note ol {
  margin: 0;
}

.result-note ol {
  padding-left: 18px;
  color: rgba(42, 35, 29, 0.74);
  line-height: 1.7;
}

.history-shell {
  gap: 14px;
  padding: 20px;
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 244, 236, 0.9)),
    #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.history-header {
  display: grid;
  gap: 4px;
}

.history-kicker {
  color: #d7922d;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.history-description,
.history-time {
  color: rgba(42, 35, 29, 0.72);
}

.history-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.history-card {
  display: grid;
  gap: 8px;
  width: 100%;
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}

.history-card:hover {
  border-color: rgba(215, 146, 45, 0.18);
  transform: translateY(-1px);
}

.history-card--current {
  border-color: rgba(215, 146, 45, 0.3);
  box-shadow: inset 0 0 0 1px rgba(215, 146, 45, 0.1);
}

.history-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.history-file {
  color: #2a231d;
  word-break: break-all;
}

.history-title {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
  color: #2a231d;
}

@media (max-width: 960px) {
  .result-shell {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 961px) {
  .result-shell {
    grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.8fr);
  }
}

@media (max-width: 720px) {
  .page-shell {
    padding: 14px;
  }

  .status-shell,
  .stage-shell-head {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
