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
    stageLabel: "等待上传",
    stageProgress: 0,
    stageDetail: "请选择一张图片开始生成课堂讲解。",
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
        stageLabel: event.history?.length ? "已恢复历史课堂" : state.stageLabel,
        stageProgress: event.history?.length ? 1 : state.stageProgress,
        stageDetail: event.history?.length
          ? "已恢复最近一次成功生成的讲解。"
          : state.stageDetail,
      };
    case "file-selected":
      return {
        ...state,
        phase: event.fileKey ? "ready" : state.currentRecord ? "success" : "idle",
        selectedFileKey: event.fileKey || "",
        errorText: "",
        stageLabel: event.fileKey ? "图片已就绪" : "等待上传",
        stageProgress: event.fileKey ? 0.15 : 0,
        stageDetail: event.fileKey
          ? "图片已选中，点击生成即可开始课堂编排。"
          : "请选择一张图片开始生成课堂讲解。",
      };
    case "file-cleared":
      return {
        ...state,
        phase: state.currentRecord ? "success" : "idle",
        selectedFileKey: "",
        errorText: event.errorText || "",
        stageLabel: event.errorText ? "选择出错" : "等待上传",
        stageProgress: 0,
        stageDetail: event.errorText || "请选择一张图片开始生成课堂讲解。",
      };
    case "submit-start":
      return {
        ...state,
        phase: "loading",
        errorText: "",
        currentRequestId: event.requestId,
        lastSubmittedFileKey: event.fileKey,
        stageLabel: "课堂编排中",
        stageProgress: 0.35,
        stageDetail: "正在分析图片内容、规划分镜和语音讲解。",
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
        stageLabel: "课堂生成完成",
        stageProgress: 1,
        stageDetail: "分镜、讲稿和总结已完成。",
      };
    case "submit-error":
      if (event.requestId !== state.currentRequestId) {
        return state;
      }
      return {
        ...state,
        phase: "error",
        errorText: event.errorText || "生成失败",
        stageLabel: "生成失败",
        stageProgress: 0,
        stageDetail: event.errorText || "请稍后重试。",
      };
    case "history-selected":
      return {
        ...state,
        phase: "success",
        currentRecord: event.record || state.currentRecord,
        selectedFileKey: "",
        errorText: "",
        stageLabel: "已切换历史课堂",
        stageProgress: 1,
        stageDetail: "正在展示此前成功生成的讲解结果。",
      };
    case "request-cancelled":
      if (event.requestId !== state.currentRequestId) {
        return state;
      }
      return {
        ...state,
        phase: state.selectedFileKey ? "ready" : state.currentRecord ? "success" : "idle",
        errorText: "",
        stageLabel: state.selectedFileKey ? "已取消生成" : "等待上传",
        stageProgress: state.selectedFileKey ? 0.15 : 0,
        stageDetail: state.selectedFileKey
          ? "生成已取消，可重新点击生成。"
          : "请选择一张图片开始生成课堂讲解。",
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

export function getLessonStageSnapshot(state) {
  return {
    label: state.stageLabel || "等待上传",
    progress: Number.isFinite(state.stageProgress) ? state.stageProgress : 0,
    detail: state.stageDetail || "请选择一张图片开始生成课堂讲解。",
  };
}

export function getLessonStageSteps(state) {
  const current = state.stageLabel || "等待上传";
  const steps = [
    {
      label: "等待上传",
      detail: "选择图片进入课堂生成流程。",
      done: current !== "等待上传",
      active: current === "等待上传",
    },
    {
      label: "图片已就绪",
      detail: "图片已选中，准备开始分析。",
      done: ["图片已就绪", "课堂编排中", "课堂生成完成", "已切换历史课堂"].includes(current),
      active: current === "图片已就绪",
    },
    {
      label: "课堂编排中",
      detail: "分析题目、规划结构、组织讲解。",
      done: ["课堂编排中", "课堂生成完成", "已切换历史课堂"].includes(current),
      active: current === "课堂编排中",
    },
    {
      label: "课堂生成完成",
      detail: "分镜、讲稿和总结已准备好。",
      done: ["课堂生成完成", "已切换历史课堂"].includes(current),
      active: current === "课堂生成完成",
    },
  ];
  return steps;
}
