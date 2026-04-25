import { buildNarrationQueue } from "./lesson.js";

const INTERRUPTED_ERROR_CODES = new Set([
  "aborted",
  "canceled",
  "cancelled",
  "interrupted",
]);

function cloneState(state) {
  return {
    isPlaying: state.isPlaying,
    isPaused: state.isPaused,
    speakingSceneId: state.speakingSceneId,
    errorMessage: state.errorMessage,
  };
}

function resolveSceneItem(queue, sceneId = "") {
  if (!sceneId) {
    return null;
  }
  return queue.find((item) => item.id === sceneId) || null;
}

function mapSpeechError(errorCode) {
  if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
    return "语音播放被浏览器拦截，请先点击页面后再重试。";
  }
  if (errorCode === "audio-busy") {
    return "系统语音服务正忙，请稍后重试。";
  }
  if (errorCode === "network") {
    return "语音服务连接失败，请稍后重试。";
  }
  return "语音播放失败，请稍后重试。";
}

export function getSpeechSupport(target = globalThis) {
  const synth = target?.speechSynthesis;
  const utteranceCtor =
    target?.SpeechSynthesisUtterance ?? globalThis?.SpeechSynthesisUtterance;

  if (!synth) {
    return {
      supported: false,
      reason: "missing-speech-synthesis",
      synth: null,
      utteranceCtor: null,
    };
  }

  const requiredMethods = ["speak", "cancel", "pause", "resume"];
  const hasMethods = requiredMethods.every(
    (method) => typeof synth[method] === "function",
  );

  if (!hasMethods) {
    return {
      supported: false,
      reason: "missing-methods",
      synth,
      utteranceCtor: null,
    };
  }

  if (typeof utteranceCtor !== "function") {
    return {
      supported: false,
      reason: "missing-utterance",
      synth,
      utteranceCtor: null,
    };
  }

  return {
    supported: true,
    reason: "",
    synth,
    utteranceCtor,
  };
}

export function createSpeechSelectionTracker(initialSceneId = "") {
  let rememberedSceneId = initialSceneId || "";
  let drivenSceneId = "";

  return {
    getRememberedSceneId() {
      return rememberedSceneId;
    },
    markDrivenScene(sceneId = "") {
      drivenSceneId = sceneId || "";
    },
    reset(sceneId = "") {
      rememberedSceneId = sceneId || "";
      drivenSceneId = "";
    },
    syncExternalSceneId(sceneId = "") {
      if (!sceneId) {
        drivenSceneId = "";
        return rememberedSceneId;
      }

      if (drivenSceneId && drivenSceneId === sceneId) {
        drivenSceneId = "";
        return rememberedSceneId;
      }

      drivenSceneId = "";
      rememberedSceneId = sceneId;
      return rememberedSceneId;
    },
  };
}

export function resolveCurrentNarrationQueue(
  lesson,
  selectedSceneId = "",
  rememberedSceneId = "",
) {
  const queue = buildNarrationQueue(lesson);
  const currentItem =
    resolveSceneItem(queue, rememberedSceneId) ||
    resolveSceneItem(queue, selectedSceneId) ||
    queue[0] ||
    null;

  return currentItem ? [currentItem] : [];
}

export function createSpeechPlaybackMachine({
  synth,
  createUtterance,
  onSceneStart,
  onUpdate,
} = {}) {
  const state = {
    isPlaying: false,
    isPaused: false,
    speakingSceneId: "",
    errorMessage: "",
  };

  let queue = [];
  let index = 0;
  let sessionId = 0;

  function publish() {
    onUpdate?.(cloneState(state));
  }

  function resetPlaybackState({ clearError = false } = {}) {
    queue = [];
    index = 0;
    state.isPlaying = false;
    state.isPaused = false;
    state.speakingSceneId = "";
    if (clearError) {
      state.errorMessage = "";
    }
    publish();
  }

  function finishSession(expectedSessionId, { silent = false } = {}) {
    if (expectedSessionId !== sessionId) {
      return;
    }
    if (!silent) {
      sessionId += 1;
      try {
        synth?.cancel?.();
      } catch {
        state.errorMessage = "语音播放失败，请稍后重试。";
      }
    }
    resetPlaybackState();
  }

  function playCurrent(expectedSessionId) {
    if (expectedSessionId !== sessionId) {
      return;
    }

    const item = queue[index];
    if (!item) {
      finishSession(expectedSessionId);
      return;
    }

    let utterance;
    try {
      utterance = createUtterance(item.text);
    } catch {
      state.errorMessage = "语音播放失败，请稍后重试。";
      finishSession(expectedSessionId);
      return;
    }

    utterance.lang = "zh-CN";
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onend = () => {
      if (expectedSessionId !== sessionId) {
        return;
      }
      index += 1;
      if (index < queue.length) {
        playCurrent(expectedSessionId);
        return;
      }
      finishSession(expectedSessionId);
    };

    utterance.onerror = (event = {}) => {
      if (expectedSessionId !== sessionId) {
        return;
      }

      const errorCode = typeof event.error === "string" ? event.error : "unknown";
      if (INTERRUPTED_ERROR_CODES.has(errorCode)) {
        finishSession(expectedSessionId);
        return;
      }

      state.errorMessage = mapSpeechError(errorCode);
      finishSession(expectedSessionId);
    };

    state.isPlaying = true;
    state.isPaused = false;
    state.speakingSceneId = item.id;
    publish();
    onSceneStart?.(item.id);

    try {
      synth.speak(utterance);
    } catch {
      state.errorMessage = "语音播放失败，请稍后重试。";
      finishSession(expectedSessionId);
    }
  }

  return {
    getState() {
      return cloneState(state);
    },
    start(nextQueue = []) {
      if (!Array.isArray(nextQueue) || nextQueue.length === 0) {
        this.stop({ clearError: true });
        return false;
      }

      sessionId += 1;
      try {
        synth?.cancel?.();
      } catch {
        state.errorMessage = "语音播放失败，请稍后重试。";
      }
      queue = nextQueue.slice();
      index = 0;
      state.errorMessage = "";
      playCurrent(sessionId);
      return true;
    },
    stop({ clearError = false } = {}) {
      sessionId += 1;
      try {
        synth?.cancel?.();
      } catch {
        state.errorMessage = "语音播放失败，请稍后重试。";
      }
      resetPlaybackState({ clearError });
    },
    togglePause() {
      if (!state.isPlaying) {
        return false;
      }

      try {
        if (state.isPaused) {
          synth.resume();
          state.isPaused = false;
        } else {
          synth.pause();
          state.isPaused = true;
        }
        publish();
        return true;
      } catch {
        state.errorMessage = "语音播放失败，请稍后重试。";
        this.stop();
        return false;
      }
    },
  };
}
