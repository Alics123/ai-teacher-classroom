import { normalizeLesson } from "../utils/lesson.js";
import { resolveApiBaseUrl } from "../utils/network.js";

function readEnvValue(key) {
  return typeof import.meta !== "undefined" &&
    import.meta.env &&
    key in import.meta.env
    ? import.meta.env[key]
    : undefined;
}

const API_BASE_URL = resolveApiBaseUrl({
  envBaseUrl: readEnvValue("VITE_API_BASE_URL"),
  currentOrigin:
    typeof window !== "undefined" ? window.location.origin : undefined,
  backendPort: readEnvValue("VITE_API_PORT") || "8008",
});

export class LessonApiError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = "LessonApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

function isJsonResponse(response) {
  const contentType = response.headers?.get?.("content-type") || "";
  return contentType.includes("application/json");
}

function readDetailValue(detail) {
  if (typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object") {
          const location = Array.isArray(item.loc) ? item.loc.join(".") : "";
          const message = typeof item.msg === "string" ? item.msg : "";
          return [location, message].filter(Boolean).join(": ");
        }
        return "";
      })
      .filter(Boolean)
      .join("；");
  }
  return "";
}

export async function readErrorMessage(response) {
  try {
    if (isJsonResponse(response)) {
      const data = await response.json();
      return (
        data?.error?.message ||
        readDetailValue(data?.detail) ||
        data?.message ||
        "请求失败"
      );
    }

    const text = await response.text();
    return text || "请求失败";
  } catch {
    return "请求失败";
  }
}

function shouldRetry(status) {
  return status === 408 || status === 429 || status >= 500;
}

export function isRetryableLessonError(error) {
  return Boolean(error?.retryable);
}

export function createLessonApi({
  baseUrl = API_BASE_URL,
  fetchImpl = fetch,
} = {}) {
  return {
    async generateLesson(file, { signal } = {}) {
      const formData = new FormData();
      formData.append("file", file);

      let response;

      try {
        response = await fetchImpl(`${baseUrl}/api/lesson/generate`, {
          method: "POST",
          body: formData,
          signal,
        });
      } catch (error) {
        if (error?.name === "AbortError") {
          throw error;
        }

        throw new LessonApiError(
          error instanceof Error ? error.message : "请求失败",
          { retryable: true },
        );
      }

      if (!response.ok) {
        throw new LessonApiError(await readErrorMessage(response), {
          status: response.status,
          retryable: shouldRetry(response.status),
        });
      }

      const lesson = normalizeLesson(await response.json());
      if (!Array.isArray(lesson.scenes) || lesson.scenes.length === 0) {
        throw new LessonApiError("AI 返回的讲解结果不完整，请重新生成。", {
          status: response.status,
          retryable: true,
        });
      }

      return lesson;
    },
  };
}

const lessonApi = createLessonApi();

export async function generateLesson(file, options) {
  return lessonApi.generateLesson(file, options);
}

export function isAbortError(error) {
  return error?.name === "AbortError";
}
