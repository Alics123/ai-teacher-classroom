import test from "node:test";
import assert from "node:assert/strict";

import * as api from "../services/api.js";

test("createLessonApi normalizes successful responses", async () => {
  assert.equal(typeof api.createLessonApi, "function");

  let requestedUrl = "";
  const client = api.createLessonApi({
    baseUrl: "http://example.test",
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      assert.equal(options.method, "POST");
      assert.ok(options.body instanceof FormData);
      return new Response(
        JSON.stringify({
          title: "几何题",
          summary: "看懂辅助线",
          scenes: [{ id: "scene-1", title: "观察", narration: "先观察图形。" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    },
  });

  const lesson = await client.generateLesson(
    new File(["binary"], "geometry.png", { type: "image/png" }),
  );

  assert.equal(requestedUrl, "http://example.test/api/lesson/generate");
  assert.equal(lesson.title, "几何题");
  assert.match(lesson.scenes[0].svg, /<svg/);
});

test("createLessonApi extracts readable retryable errors from failed responses", async () => {
  assert.equal(typeof api.createLessonApi, "function");
  assert.equal(typeof api.isRetryableLessonError, "function");

  const client = api.createLessonApi({
    baseUrl: "http://example.test",
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: { message: "服务暂时不可用" } }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
  });

  await assert.rejects(
    () => client.generateLesson(new File(["binary"], "geometry.png", { type: "image/png" })),
    (error) => {
      assert.match(error.message, /服务暂时不可用/);
      assert.equal(api.isRetryableLessonError(error), true);
      return true;
    },
  );
});

test("createLessonApi rejects successful responses with no usable scenes", async () => {
  const client = api.createLessonApi({
    baseUrl: "http://example.test",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          title: "坏结果",
          summary: "没有分镜",
          scenes: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
  });

  await assert.rejects(
    () => client.generateLesson(new File(["binary"], "geometry.png", { type: "image/png" })),
    /讲解结果不完整/,
  );
});

test("createLessonApi falls back to plain text error messages", async () => {
  const client = api.createLessonApi({
    baseUrl: "http://example.test",
    fetchImpl: async () =>
      new Response("网关超时", {
        status: 504,
        headers: { "Content-Type": "text/plain" },
      }),
  });

  await assert.rejects(
    () => client.generateLesson(new File(["binary"], "geometry.png", { type: "image/png" })),
    /网关超时/,
  );
});
