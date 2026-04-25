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
      <p class="eyebrow">Open the scene</p>
      <h2>上传图片，点亮这场 AI 课堂放映。</h2>
      <p class="description">
        支持题目截图、手写草稿、教材页面或几何图。系统会调用你本地 `9109`
        端口的 AI，自动生成 SVG 分镜和中文讲解稿，也支持直接粘贴截图。
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
  padding: 30px;
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03)),
    rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.upload-copy {
  display: grid;
  gap: 14px;
}

.eyebrow {
  margin: 0;
  color: var(--accent-strong);
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  font-size: clamp(32px, 4vw, 56px);
  line-height: 1.02;
  letter-spacing: -0.04em;
  text-wrap: balance;
}

.description {
  margin: 0;
  max-width: 560px;
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.65;
}

.dropzone {
  display: grid;
  place-items: center;
  min-height: 340px;
  padding: 18px;
  border-radius: 28px;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  background:
    radial-gradient(circle at top, rgba(243, 177, 94, 0.12), transparent 45%),
    rgba(255, 255, 255, 0.05);
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
  color: var(--text-secondary);
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
  color: rgba(255, 255, 255, 0.74);
  word-break: break-all;
}

.primary-button {
  border: none;
  border-radius: 999px;
  padding: 12px 22px;
  background: linear-gradient(180deg, #ffd08c, #f3b15e);
  color: #1c1206;
  font-size: 17px;
  font-weight: 700;
  box-shadow: 0 10px 24px rgba(243, 177, 94, 0.22);
}

.primary-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.error-text {
  margin: 0;
  color: #ffaeae;
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
