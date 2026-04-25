<script setup>
import { computed, ref, watch } from "vue";

import {
  copyLessonText,
  downloadLessonText,
} from "../utils/lessonExport.js";

const props = defineProps({
  lesson: {
    type: Object,
    default: null,
  },
  activeSceneId: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["scene-select"]);

const statusText = ref("");
const localSceneId = ref("");

const resolvedActiveSceneId = computed(() => {
  if (props.activeSceneId) {
    return props.activeSceneId;
  }
  if (localSceneId.value) {
    return localSceneId.value;
  }
  return props.lesson?.scenes?.[0]?.id || "";
});

const currentScene = computed(() => {
  const scenes = Array.isArray(props.lesson?.scenes) ? props.lesson.scenes : [];
  return (
    scenes.find((scene) => scene.id === resolvedActiveSceneId.value) ||
    scenes[0] ||
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

watch(
  () => props.lesson,
  () => {
    localSceneId.value = "";
    statusText.value = "";
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

function selectScene(sceneId) {
  if (!sceneId) {
    return;
  }
  localSceneId.value = sceneId;
  statusText.value = "";
  emit("scene-select", sceneId);
}

async function handleCopyNarration() {
  try {
    await copyLessonText(currentNarration.value);
    statusText.value = currentScene.value
      ? `已复制 ${currentScene.value.title} 的讲解。`
      : "已复制完整讲解稿。";
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
</script>

<template>
  <section class="lesson-shell">
    <div v-if="!lesson" class="lesson-empty">
      <p class="empty-title">结果会显示在这里</p>
      <p class="empty-description">
        上传图片后，你会看到 AI 生成的步骤分镜、讲解摘要和完整朗读稿。
      </p>
    </div>

    <template v-else>
      <header class="lesson-header">
        <p class="lesson-kicker">讲解结果</p>
        <h2>{{ lesson.title }}</h2>
        <p class="lesson-summary">{{ lesson.summary }}</p>
      </header>

      <section class="scene-toolbar">
        <div class="scene-focus">
          <p class="scene-focus-label">当前分镜</p>
          <p class="scene-focus-title">
            {{ currentScene ? currentScene.title : "点击任一分镜查看重点" }}
          </p>
          <p class="scene-focus-detail">
            {{
              currentScene
                ? `${currentScene.id} · 点击其他卡片可切换讲解重点`
                : "选择某一张卡片后，可复制当前讲解或下载完整结果。"
            }}
          </p>
        </div>

        <div class="scene-toolbar-actions">
          <button
            type="button"
            class="lesson-action lesson-action--primary"
            :disabled="!currentNarration"
            @click="handleCopyNarration"
          >
            复制当前讲解
          </button>
          <button
            type="button"
            class="lesson-action"
            :disabled="!lesson"
            @click="handleDownloadLesson"
          >
            下载结果
          </button>
        </div>
      </section>

      <p v-if="statusText" class="lesson-status">{{ statusText }}</p>

      <div class="scene-grid">
        <button
          v-for="scene in lesson.scenes"
          :key="scene.id"
          type="button"
          class="scene-card"
          :class="{ 'scene-card--active': resolvedActiveSceneId === scene.id }"
          :aria-pressed="resolvedActiveSceneId === scene.id"
          @click="selectScene(scene.id)"
        >
          <div class="scene-card-top">
            <div class="scene-card-meta">
              <span class="scene-chip">{{ scene.id }}</span>
              <span
                v-if="resolvedActiveSceneId === scene.id"
                class="scene-current-chip"
              >
                当前
              </span>
            </div>
            <h3>{{ scene.title }}</h3>
          </div>
          <div class="scene-svg" v-html="scene.svg"></div>
          <p class="scene-narration">{{ scene.narration }}</p>
        </button>
      </div>

      <section class="full-script">
        <div class="script-header">
          <p class="script-label">完整讲解稿</p>
          <p v-if="currentScene" class="script-scene-note">
            当前聚焦：{{ currentScene.title }}
          </p>
        </div>
        <pre>{{ lesson.fullNarration }}</pre>
      </section>
    </template>
  </section>
</template>

<style scoped>
.lesson-shell {
  display: grid;
  gap: 24px;
  padding: 32px;
  min-height: 100%;
  border-radius: var(--radius-card);
  background: var(--surface-light);
  color: var(--text-primary);
  box-shadow: var(--shadow-soft);
}

.lesson-empty {
  display: grid;
  place-items: center;
  min-height: 480px;
  text-align: center;
}

.empty-title {
  margin: 0 0 8px;
  font-size: 28px;
  line-height: 1.14;
}

.empty-description {
  margin: 0;
  max-width: 360px;
  color: var(--text-secondary);
}

.lesson-header {
  display: grid;
  gap: 10px;
}

.scene-toolbar {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(0, 113, 227, 0.08);
}

.scene-focus {
  display: grid;
  gap: 6px;
}

.scene-focus-label {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.scene-focus-title {
  margin: 0;
  font-size: 21px;
  line-height: 1.19;
  font-weight: 600;
}

.scene-focus-detail {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.43;
}

.scene-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.lesson-action {
  min-width: 128px;
  padding: 10px 18px;
  border-radius: 999px;
  border: 1px solid var(--border-soft);
  background: #ffffff;
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}

.lesson-action--primary {
  border-color: transparent;
  background: var(--accent);
  color: #ffffff;
}

.lesson-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.lesson-status {
  margin: -8px 0 0;
  color: var(--accent);
  font-size: 14px;
}

.lesson-kicker {
  margin: 0;
  color: var(--accent);
  font-size: 14px;
}

h2 {
  margin: 0;
  font-size: clamp(32px, 4vw, 44px);
  line-height: 1.1;
  letter-spacing: -0.28px;
}

.lesson-summary {
  margin: 0;
  color: var(--text-secondary);
  font-size: 17px;
  line-height: 1.47;
}

.scene-grid {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}

.scene-card {
  display: grid;
  gap: 16px;
  width: 100%;
  padding: 20px;
  border-radius: 24px;
  background: var(--surface-white);
  border: 1px solid transparent;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.scene-card:hover {
  transform: translateY(-1px);
  border-color: rgba(0, 113, 227, 0.18);
}

.scene-card:focus-visible {
  outline: 2px solid rgba(0, 113, 227, 0.7);
  outline-offset: 3px;
}

.scene-card--active {
  border-color: rgba(0, 113, 227, 0.3);
  box-shadow:
    inset 0 0 0 1px rgba(0, 113, 227, 0.14),
    0 18px 36px rgba(0, 113, 227, 0.08);
}

.scene-card-top {
  display: grid;
  gap: 10px;
}

.scene-card-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.scene-chip {
  width: fit-content;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(0, 113, 227, 0.1);
  color: var(--accent);
  font-size: 12px;
}

.scene-current-chip {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--accent);
  color: #ffffff;
  font-size: 12px;
}

h3 {
  margin: 0;
  font-size: 24px;
  line-height: 1.14;
}

.scene-svg {
  display: grid;
  place-items: center;
  min-height: 200px;
  padding: 16px;
  border-radius: 20px;
  background: #fbfbfd;
}

.scene-svg :deep(svg) {
  width: 100%;
  height: auto;
}

.scene-narration {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.5;
}

.full-script {
  display: grid;
  gap: 10px;
  padding: 24px;
  border-radius: 24px;
  background: #ffffff;
}

.script-header {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
}

.script-label {
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
}

.script-scene-note {
  margin: 0;
  color: var(--accent);
  font-size: 14px;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  line-height: 1.6;
  color: var(--text-primary);
}

@media (max-width: 720px) {
  .lesson-shell {
    padding: 24px;
  }

  .scene-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
