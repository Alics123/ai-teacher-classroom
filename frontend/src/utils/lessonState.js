export function createFileKey(file = {}) {
  const name = typeof file.name === "string" ? file.name : "";
  const type = typeof file.type === "string" ? file.type : "";
  const size = Number.isFinite(file.size) ? file.size : 0;
  const lastModified = Number.isFinite(file.lastModified)
    ? file.lastModified
    : 0;

  return [name, size, lastModified, type].join("::");
}

export function createLessonAppState({ history = [] } = {}) {
  return {
    phase: history.length ? "success" : "idle",
    errorText: "",
    currentRequestId: 0,
    currentRecord: history[0] || null,
    history,
    lastSubmittedFileKey: "",
    selectedFileKey: "",
  };
}

export function reduceLessonAppState(state, event) {
  switch (event.type) {
    case "history-loaded":
      return {
        ...state,
        phase: event.history?.length ? "success" : state.phase,
        history: event.history || [],
        currentRecord: state.currentRecord || event.history?.[0] || null,
      };
    case "file-selected":
      return {
        ...state,
        phase: event.fileKey ? "ready" : state.currentRecord ? "success" : "idle",
        selectedFileKey: event.fileKey || "",
        errorText: "",
      };
    case "file-cleared":
      return {
        ...state,
        phase: state.currentRecord ? "success" : "idle",
        selectedFileKey: "",
        errorText: event.errorText || "",
      };
    case "submit-start":
      return {
        ...state,
        phase: "loading",
        errorText: "",
        currentRequestId: event.requestId,
        lastSubmittedFileKey: event.fileKey,
      };
    case "submit-success":
      if (event.requestId !== state.currentRequestId) {
        return state;
      }
      return {
        ...state,
        phase: "success",
        errorText: "",
        currentRecord: event.record,
        history: event.history || state.history,
      };
    case "submit-error":
      if (event.requestId !== state.currentRequestId) {
        return state;
      }
      return {
        ...state,
        phase: "error",
        errorText: event.errorText || "生成失败",
      };
    case "history-selected":
      return {
        ...state,
        phase: "success",
        currentRecord: event.record || state.currentRecord,
        selectedFileKey: "",
        errorText: "",
      };
    case "request-cancelled":
      if (event.requestId !== state.currentRequestId) {
        return state;
      }
      return {
        ...state,
        phase: state.selectedFileKey ? "ready" : state.currentRecord ? "success" : "idle",
        errorText: "",
      };
    default:
      return state;
  }
}

export function getVisibleLessonRecord(state) {
  if (!state.currentRecord) {
    return null;
  }
  if (!state.selectedFileKey) {
    return state.currentRecord;
  }
  return state.currentRecord.fileKey === state.selectedFileKey
    ? state.currentRecord
    : null;
}

export function canRetryCurrentSelection(state) {
  return Boolean(
    state.phase === "error" &&
      state.selectedFileKey &&
      state.selectedFileKey === state.lastSubmittedFileKey,
  );
}
