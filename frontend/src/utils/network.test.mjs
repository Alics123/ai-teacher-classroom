import test from "node:test";
import assert from "node:assert/strict";

import { resolveApiBaseUrl } from "./network.js";


test("resolveApiBaseUrl prefers explicit env base url", () => {
  const result = resolveApiBaseUrl({
    envBaseUrl: "http://10.10.10.8:9000/",
    currentOrigin: "http://192.168.1.50:5173",
  });

  assert.equal(result, "http://10.10.10.8:9000");
});


test("resolveApiBaseUrl follows current browser host for LAN access", () => {
  const result = resolveApiBaseUrl({
    currentOrigin: "http://192.168.31.22:5173",
  });

  assert.equal(result, "http://192.168.31.22:8008");
});


test("resolveApiBaseUrl allows overriding backend port", () => {
  const result = resolveApiBaseUrl({
    currentOrigin: "http://math-teacher.local:5173",
    backendPort: "9001",
  });

  assert.equal(result, "http://math-teacher.local:9001");
});
