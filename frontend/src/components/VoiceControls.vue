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

const emit = defineEmits(["scene-change", "playback-state"]);

const support = getSpeechSupport(typeof window !== "undefined" ? window : undefined);
const isSupported = support.supported;
const isPlaying = ref(false);
const isPaused = ref(false);
const speakingSceneId = ref("");
const playbackError = ref("");
const rememberedSceneId = ref("");
const playbackRunId = ref(0);

const allQueue = computed(() => buildNarrationQueue(props.lesson));
const currentQueue = computed(() =>
  resolveCurrentNarrationQueue(
    props.lesson,
    props.selectedSceneId,
    rememberedSceneId.value,
  ),
);
const speakingSceneLabel = computed(() => {
  const currentItem = allQueue.value.find((item) => item.id === speakingSceneId.value);
  return currentItem?.label || "";
});
const statusText = computed(() => {
  if (speakingSceneLabel.value) {
    return `正在讲解：${speakingSceneLabel.value}`;
  }
  if (playbackError.value) {
    return playbackError.value;
  }
  if (!isSupported) {
    return getUnsupportedMessage(support.reason);
  }
  return "点击开始朗读后，字幕会按照讲解节奏自动同步。";
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

function emitPlaybackState() {
  emit("playback-state", {
    runId: playbackRunId.value,
    isPlaying: isPlaying.value,
    isPaused: isPaused.value,
    sceneId: speakingSceneId.value,
    errorMessage: playbackError.value,
  });
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
  playbackRunId.value += 1;
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

watch(
  [playbackRunId, isPlaying, isPaused, speakingSceneId, playbackError],
  () => {
    emitPlaybackState();
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
      <p class="voice-description">
        直接朗读课堂讲解，舞台区会跟随切换分镜与字幕。
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

    <p class="voice-status" :class="{ 'voice-status--warning': isWarningStatus }">
      {{ statusText }}
    </p>
  </section>
</template>

<style scoped>
.voice-shell {
  display: grid;
  gap: 14px;
  padding: 18px 22px;
  border-radius: 28px;
  background: #ffffff;
  border: 1px solid rgba(0, 113, 227, 0.12);
  box-shadow: rgba(0, 0, 0, 0.06) 0px 18px 40px;
}

.voice-copy {
  display: grid;
  gap: 6px;
}

.voice-label {
  margin: 0;
  color: var(--accent);
  font-size: 14px;
}

.voice-description {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.47;
}

.voice-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.voice-button {
  min-width: 112px;
  padding: 10px 18px;
  border-radius: 999px;
  border: 1px solid var(--border-soft);
  background: #ffffff;
  color: var(--text-primary);
  font: inherit;
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
  font-size: 14px;
}

.voice-status--warning {
  color: #d15700;
}
</style>
