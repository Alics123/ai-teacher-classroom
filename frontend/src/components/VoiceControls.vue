<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";

import { buildNarrationQueue } from "../utils/lesson.js";
import {
  createSpeechPlaybackMachine,
  createSpeechSelectionTracker,
  getSpeechSupport,
  resolveCurrentNarrationQueue,
} from "../utils/speech.js";

const props = defineProps({
  lesson: {
    type: Object,
    default: null,
  },
  selectedSceneId: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["scene-change"]);

const support = getSpeechSupport(typeof window !== "undefined" ? window : undefined);
const isSupported = support.supported;
const isPlaying = ref(false);
const isPaused = ref(false);
const speakingSceneId = ref("");
const playbackError = ref("");
const rememberedSceneId = ref("");

const allQueue = computed(() => buildNarrationQueue(props.lesson));
const currentQueue = computed(() =>
  resolveCurrentNarrationQueue(
    props.lesson,
    props.selectedSceneId,
    rememberedSceneId.value,
  ),
);
const statusText = computed(() => {
  if (speakingSceneId.value) {
    return `正在朗读：${speakingSceneId.value}`;
  }
  if (playbackError.value) {
    return playbackError.value;
  }
  if (!isSupported) {
    return getUnsupportedMessage(support.reason);
  }
  return "";
});
const isWarningStatus = computed(() => !isSupported || Boolean(playbackError.value));

const selectionTracker = createSpeechSelectionTracker();
const playbackMachine = isSupported
  ? createSpeechPlaybackMachine({
      synth: support.synth,
      createUtterance(text) {
        return new support.utteranceCtor(text);
      },
      onSceneStart(sceneId) {
        selectionTracker.markDrivenScene(sceneId);
        emit("scene-change", sceneId);
      },
      onUpdate(state) {
        isPlaying.value = state.isPlaying;
        isPaused.value = state.isPaused;
        speakingSceneId.value = state.speakingSceneId;
        playbackError.value = state.errorMessage;
      },
    })
  : null;

function getUnsupportedMessage(reason) {
  if (reason === "missing-methods" || reason === "missing-utterance") {
    return "当前浏览器的语音接口不完整，请更换为 Chrome、Edge 或 Safari。";
  }
  return "当前浏览器不支持 SpeechSynthesis，请更换为 Chrome、Edge 或 Safari。";
}

function resetRememberedScene(lesson, selectedSceneId = "") {
  const nextSceneId =
    resolveCurrentNarrationQueue(lesson, selectedSceneId, "")[0]?.id || "";
  selectionTracker.reset(nextSceneId);
  rememberedSceneId.value = selectionTracker.getRememberedSceneId();
}

function stopPlayback(options = {}) {
  playbackMachine?.stop(options);
  if (!playbackMachine) {
    isPlaying.value = false;
    isPaused.value = false;
    speakingSceneId.value = "";
    if (options.clearError) {
      playbackError.value = "";
    }
  }
}

function startPlayback(queue) {
  if (!playbackMachine || !queue.length) {
    return;
  }
  playbackMachine.start(queue);
}

function togglePause() {
  playbackMachine?.togglePause();
}

watch(
  () => props.selectedSceneId,
  (sceneId) => {
    if (!sceneId && isPlaying.value) {
      stopPlayback({ clearError: true });
    }
    selectionTracker.syncExternalSceneId(sceneId);
    rememberedSceneId.value = selectionTracker.getRememberedSceneId();
  },
  {
    immediate: true,
  },
);

watch(
  () => props.lesson,
  (lesson, previousLesson) => {
    if (lesson !== previousLesson) {
      stopPlayback({ clearError: true });
    }
    resetRememberedScene(lesson, props.selectedSceneId);
  },
  {
    immediate: true,
  },
);

onBeforeUnmount(() => {
  stopPlayback({ clearError: true });
});
</script>

<template>
  <section class="voice-shell">
    <div class="voice-copy">
      <p class="voice-label">语音讲解</p>
      <h3>直接朗读 AI 生成的讲解稿</h3>
      <p class="voice-description">
        默认使用浏览器内置语音。你可以播放全部步骤，也可以只播放当前高亮的那一张 SVG。
      </p>
    </div>

    <div class="voice-actions">
      <button
        type="button"
        class="voice-button voice-button--primary"
        :disabled="!allQueue.length || !isSupported"
        @click="startPlayback(allQueue)"
      >
        朗读全部
      </button>
      <button
        type="button"
        class="voice-button"
        :disabled="!currentQueue.length || !isSupported"
        @click="startPlayback(currentQueue)"
      >
        朗读当前
      </button>
      <button
        type="button"
        class="voice-button"
        :disabled="!isPlaying || !isSupported"
        @click="togglePause"
      >
        {{ isPaused ? "继续" : "暂停" }}
      </button>
      <button
        type="button"
        class="voice-button"
        :disabled="!isPlaying || !isSupported"
        @click="stopPlayback"
      >
        停止
      </button>
    </div>

    <p
      v-if="statusText"
      class="voice-status"
      :class="{ 'voice-status--warning': isWarningStatus }"
    >
      {{ statusText }}
    </p>
  </section>
</template>

<style scoped>
.voice-shell {
  display: grid;
  gap: 18px;
  padding: 24px 28px;
  border-radius: 24px;
  background: #ffffff;
}

.voice-copy {
  display: grid;
  gap: 8px;
}

.voice-label {
  margin: 0;
  color: var(--accent);
  font-size: 14px;
}

h3 {
  margin: 0;
  font-size: 28px;
  line-height: 1.14;
  color: var(--text-primary);
}

.voice-description {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.5;
}

.voice-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.voice-button {
  min-width: 108px;
  padding: 10px 18px;
  border-radius: 999px;
  border: 1px solid var(--border-soft);
  background: #ffffff;
  color: var(--text-primary);
}

.voice-button--primary {
  border-color: transparent;
  background: var(--accent);
  color: #ffffff;
}

.voice-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.voice-status {
  margin: 0;
  color: var(--text-secondary);
}

.voice-status--warning {
  color: #d15700;
}
</style>
