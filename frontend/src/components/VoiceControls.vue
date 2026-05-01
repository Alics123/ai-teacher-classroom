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
const currentSceneScript = computed(() => {
  const scripts = Array.isArray(props.lesson?.sceneScripts)
    ? props.lesson.sceneScripts
    : [];
  const activeScript = scripts.find((item) => String(item.sceneId) === String(props.selectedSceneId)) || scripts[0] || null;
  return activeScript;
});
const scriptSegments = computed(() => currentSceneScript.value?.voiceScriptSegments || []);

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
      <p class="voice-label">Narration deck</p>
      <p class="voice-description">
        语音旁白会把整场课堂串起来，舞台区也会同步切换分镜与字幕。
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

    <div v-if="scriptSegments.length" class="voice-script">
      <p class="voice-script-label">当前分镜讲稿</p>
      <ul class="voice-script-list">
        <li v-for="(segment, index) in scriptSegments" :key="`${index}-${segment.text}`">
          <strong>{{ segment.tone }}</strong>
          <span>{{ segment.text }}</span>
        </li>
      </ul>
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
  padding: 20px 22px;
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(248, 244, 236, 0.92)),
    #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow:
    0 18px 44px rgba(96, 77, 51, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.88);
  color: #2a231d;
}

.voice-copy {
  display: grid;
  gap: 6px;
}

.voice-label {
  margin: 0;
  color: #d7922d;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.voice-description {
  margin: 0;
  color: rgba(42, 35, 29, 0.72);
  line-height: 1.65;
}

.voice-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.voice-script {
  display: grid;
  gap: 10px;
  padding: 16px 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.voice-script-label {
  margin: 0;
  color: #d7922d;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.voice-script-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 8px;
  color: rgba(42, 35, 29, 0.74);
}

.voice-script-list strong {
  margin-right: 8px;
  color: #2a231d;
}

.voice-button {
  min-width: 112px;
  padding: 10px 18px;
  border-radius: 999px;
  border: 1px solid rgba(42, 35, 29, 0.08);
  background: rgba(255, 255, 255, 0.96);
  color: #2a231d;
  font: inherit;
}

.voice-button--primary {
  border-color: transparent;
  background: linear-gradient(180deg, #ffd79e, #d7922d);
  color: #fffaf0;
  box-shadow: 0 10px 20px rgba(215, 146, 45, 0.18);
}

.voice-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.voice-status {
  margin: 0;
  color: rgba(42, 35, 29, 0.68);
  font-size: 14px;
}

.voice-status--warning {
  color: #b06a12;
}
</style>
