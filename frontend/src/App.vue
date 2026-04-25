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
        <span>AI 调用：由当前服务器转发到本机 9109</span>
        <span>输出：SVG 分镜 + 讲解稿 + 语音朗读</span>
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

        <div class="hero-side">
          <div class="hero-note">
            <p class="hero-note-label">适合谁用</p>
            <p>给学生自己看题，也可以给老师快速出讲题草稿。</p>
          </div>
          <div class="hero-note">
            <p class="hero-note-label">讲解风格</p>
            <p>默认用中文老师口吻，按图片内容生成 2 到 4 张 SVG 分镜。</p>
          </div>
          <div class="hero-note">
            <p class="hero-note-label">维护方式</p>
            <p>前端只负责展示和朗读，AI 调用都在后端，后续替换模型很方便。</p>
          </div>
        </div>
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
        重试上一次
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
        <p class="history-kicker">最近记录</p>
        <p class="history-description">成功生成的结果会保存在当前浏览器，本地可继续查看。</p>
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
  gap: 28px;
  min-height: 100vh;
  padding: 24px;
  background: #000000;
}

.hero-shell {
  display: grid;
  gap: 18px;
}

.status-shell {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.status-shell--success,
.status-shell--muted,
.status-shell--pending {
  color: rgba(255, 255, 255, 0.92);
}

.status-shell--error {
  border-color: rgba(255, 138, 138, 0.3);
  background: rgba(255, 138, 138, 0.1);
  color: #ffd7d7;
}

.status-shell--info {
  border-color: rgba(41, 151, 255, 0.26);
  background: rgba(41, 151, 255, 0.1);
  color: #dceeff;
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
  color: #2997ff;
}

.status-shell--error .status-label {
  color: inherit;
}

.status-button {
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  padding: 10px 18px;
  background: transparent;
  color: inherit;
  white-space: nowrap;
}

.hero-topline {
  display: flex;
  gap: 12px 18px;
  flex-wrap: wrap;
  color: rgba(255, 255, 255, 0.62);
  font-size: 12px;
  letter-spacing: -0.12px;
}

.hero-grid {
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
}

.hero-side {
  display: grid;
  gap: 16px;
}

.hero-note {
  display: grid;
  gap: 10px;
  padding: 24px;
  border-radius: var(--radius-card);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.hero-note p {
  margin: 0;
}

.hero-note-label {
  color: #2997ff;
  font-size: 14px;
}

.result-shell {
  display: grid;
  gap: 18px;
}

.history-shell {
  display: grid;
  gap: 18px;
  padding: 24px;
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
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
  color: #2997ff;
  font-size: 14px;
}

.history-description,
.history-time,
.history-summary,
.history-scenes {
  color: rgba(255, 255, 255, 0.68);
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
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid transparent;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.history-card:hover {
  border-color: rgba(41, 151, 255, 0.2);
}

.history-card:focus-visible {
  outline: 2px solid rgba(41, 151, 255, 0.8);
  outline-offset: 3px;
}

.history-card--current {
  border-color: rgba(41, 151, 255, 0.28);
  box-shadow: inset 0 0 0 1px rgba(41, 151, 255, 0.12);
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
  color: rgba(255, 255, 255, 0.62);
}

.footer-note p {
  margin: 0;
}

@media (max-width: 1120px) {
  .hero-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .status-shell {
    align-items: stretch;
    flex-direction: column;
  }

  .page-shell,
  .result-shell {
    padding: 16px;
  }
}
</style>
