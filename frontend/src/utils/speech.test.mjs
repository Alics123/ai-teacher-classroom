import assert from "node:assert/strict";
import test from "node:test";

import {
  createSpeechPlaybackMachine,
  createSpeechSelectionTracker,
  getSpeechSupport,
  resolveCurrentNarrationQueue,
} from "./speech.js";

function createFakeSynth() {
  return {
    utterances: [],
    cancelled: 0,
    paused: 0,
    resumed: 0,
    speak(utterance) {
      this.utterances.push(utterance);
    },
    cancel() {
      this.cancelled += 1;
    },
    pause() {
      this.paused += 1;
    },
    resume() {
      this.resumed += 1;
    },
  };
}

function createLesson() {
  return {
    scenes: [
      {
        id: "scene-1",
        title: "第一步",
        narration: "先观察图形。",
      },
      {
        id: "scene-2",
        title: "第二步",
        narration: "再计算结果。",
      },
    ],
  };
}

test("getSpeechSupport rejects partial speech implementations", () => {
  const support = getSpeechSupport({
    speechSynthesis: {
      speak() {},
    },
  });

  assert.equal(support.supported, false);
  assert.equal(support.reason, "missing-methods");
});

test("selection tracker keeps external selection when playback only echoes scene change", () => {
  const tracker = createSpeechSelectionTracker("scene-1");

  tracker.markDrivenScene("scene-2");
  tracker.syncExternalSceneId("scene-2");

  assert.equal(tracker.getRememberedSceneId(), "scene-1");

  tracker.syncExternalSceneId("scene-3");

  assert.equal(tracker.getRememberedSceneId(), "scene-3");
});

test("resolveCurrentNarrationQueue falls back to remembered or first scene", () => {
  const lesson = createLesson();

  assert.deepEqual(resolveCurrentNarrationQueue(lesson, "", "").map((item) => item.id), [
    "scene-1",
  ]);

  assert.deepEqual(
    resolveCurrentNarrationQueue(lesson, "missing-scene", "scene-2").map(
      (item) => item.id,
    ),
    ["scene-2"],
  );
});

test("playback machine ignores stale onend callbacks from cancelled sessions", () => {
  const synth = createFakeSynth();
  const sceneChanges = [];
  const machine = createSpeechPlaybackMachine({
    synth,
    createUtterance(text) {
      return { text, onend: null, onerror: null };
    },
    onSceneStart(sceneId) {
      sceneChanges.push(sceneId);
    },
  });

  machine.start([
    { id: "scene-1", text: "先观察图形。" },
    { id: "scene-2", text: "再计算结果。" },
  ]);
  const staleUtterance = synth.utterances[0];

  machine.start([{ id: "scene-9", text: "重播新的讲解。" }]);

  assert.equal(synth.utterances.length, 2);
  assert.deepEqual(sceneChanges, ["scene-1", "scene-9"]);

  staleUtterance.onend();

  assert.equal(synth.utterances.length, 2);
  assert.equal(machine.getState().speakingSceneId, "scene-9");
});

test("playback machine treats interrupted errors as silent stops", () => {
  const synth = createFakeSynth();
  const machine = createSpeechPlaybackMachine({
    synth,
    createUtterance(text) {
      return { text, onend: null, onerror: null };
    },
  });

  machine.start([{ id: "scene-1", text: "先观察图形。" }]);
  synth.utterances[0].onerror({ error: "interrupted" });

  assert.equal(machine.getState().isPlaying, false);
  assert.equal(machine.getState().errorMessage, "");
});

test("playback machine surfaces actionable speech errors", () => {
  const synth = createFakeSynth();
  const machine = createSpeechPlaybackMachine({
    synth,
    createUtterance(text) {
      return { text, onend: null, onerror: null };
    },
  });

  machine.start([{ id: "scene-1", text: "先观察图形。" }]);
  synth.utterances[0].onerror({ error: "not-allowed" });

  assert.equal(machine.getState().isPlaying, false);
  assert.match(machine.getState().errorMessage, /被浏览器拦截/);
});
