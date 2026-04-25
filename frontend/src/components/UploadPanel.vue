<script setup>
import { onBeforeUnmount, onMounted } from "vue";

import { extractImageFileFromClipboardData } from "../utils/clipboardImage.js";

const props = defineProps({
  fileName: {
    type: String,
    default: "",
  },
  imagePreview: {
    type: String,
    default: "",
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  errorText: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["file-select", "submit"]);

function emitSelectedFile(file) {
  if (file) {
    emit("file-select", file);
  }
}

function onInputChange(event) {
  const [file] = event.target.files || [];
  emitSelectedFile(file);
  event.target.value = "";
}

function onDrop(event) {
  const [file] = event.dataTransfer?.files || [];
  emitSelectedFile(file);
}

function onPaste(event) {
  const file = extractImageFileFromClipboardData(event.clipboardData);
  if (!file) {
    return;
  }

  event.preventDefault();
  emitSelectedFile(file);
}

onMounted(() => {
  window.addEventListener("paste", onPaste);
});

onBeforeUnmount(() => {
  window.removeEventListener("paste", onPaste);
});
</script>

<template>
  <section class="upload-shell">
    <div class="upload-copy">
      <p class="eyebrow">AI Teacher</p>
      <h1>上传一张图片，让 AI 老师自动画图讲题。</h1>
      <p class="description">
        支持题目截图、手写草稿、教材页面或几何图。系统会调用你本地 `9109`
        端口的 AI，自动生成 SVG 分镜和对应的中文讲解稿。也支持直接
        `Ctrl+V` / `Cmd+V` 粘贴图片。
      </p>
    </div>

    <label
      class="dropzone"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <input
        class="dropzone-input"
        type="file"
        accept="image/*"
        @change="onInputChange"
      />
      <div v-if="imagePreview" class="preview-wrap">
        <img :src="imagePreview" alt="上传预览" class="preview-image" />
      </div>
      <div v-else class="placeholder">
        <p>拖拽图片到这里</p>
        <span>或者点击选择一张图片 / 直接粘贴截图</span>
      </div>
    </label>

    <div class="upload-actions">
      <p class="file-name">
        {{ fileName || "还没有选择文件" }}
      </p>
      <button
        type="button"
        class="primary-button"
        :disabled="!fileName || isLoading"
        @click="emit('submit')"
      >
        {{ isLoading ? "AI 正在讲解..." : "生成讲解" }}
      </button>
    </div>

    <p v-if="errorText" class="error-text">
      {{ errorText }}
    </p>
  </section>
</template>

<style scoped>
.upload-shell {
  display: grid;
  gap: 24px;
  padding: 32px;
  border-radius: var(--radius-card);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.upload-copy {
  display: grid;
  gap: 14px;
}

.eyebrow {
  margin: 0;
  color: #2997ff;
  font-size: 14px;
  letter-spacing: -0.22px;
}

h1 {
  margin: 0;
  font-size: clamp(36px, 5vw, 56px);
  line-height: 1.07;
  letter-spacing: -0.28px;
  font-weight: 600;
}

.description {
  margin: 0;
  max-width: 560px;
  color: rgba(255, 255, 255, 0.76);
  font-size: 17px;
  line-height: 1.47;
  letter-spacing: -0.37px;
}

.dropzone {
  display: grid;
  place-items: center;
  min-height: 320px;
  padding: 18px;
  border-radius: 28px;
  border: 1px dashed rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.06);
}

.dropzone-input {
  display: none;
}

.placeholder {
  display: grid;
  gap: 8px;
  text-align: center;
}

.placeholder p {
  margin: 0;
  font-size: 24px;
}

.placeholder span {
  color: rgba(255, 255, 255, 0.64);
}

.preview-wrap {
  width: 100%;
  overflow: hidden;
  border-radius: 22px;
}

.preview-image {
  display: block;
  width: 100%;
  max-height: 420px;
  object-fit: contain;
  background: #ffffff;
}

.upload-actions {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.file-name {
  margin: 0;
  color: rgba(255, 255, 255, 0.72);
  word-break: break-all;
}

.primary-button {
  border: none;
  border-radius: 999px;
  padding: 12px 22px;
  background: #0071e3;
  color: #ffffff;
  font-size: 17px;
}

.primary-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.error-text {
  margin: 0;
  color: #ff8a8a;
}

@media (max-width: 720px) {
  .upload-shell {
    padding: 24px;
  }

  .upload-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .primary-button {
    width: 100%;
  }
}
</style>
