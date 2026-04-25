function normalizeClipboardFile(file, now) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    return null;
  }

  if (file.name) {
    return file;
  }

  return new File([file], buildClipboardImageFilename(file.type, now()), {
    type: file.type,
    lastModified: file.lastModified || now(),
  });
}

export function buildClipboardImageFilename(mimeType = "image/png", timestamp) {
  const normalizedMimeType = String(mimeType).toLowerCase();
  const ext =
    normalizedMimeType === "image/jpeg"
      ? "jpg"
      : normalizedMimeType === "image/webp"
        ? "webp"
        : normalizedMimeType === "image/gif"
          ? "gif"
          : "png";

  return `pasted-image-${timestamp}.${ext}`;
}

export function extractImageFileFromClipboardData(
  clipboardData,
  { now = () => Date.now() } = {},
) {
  const files = Array.from(clipboardData?.files || []);
  const fileMatch = files.find((file) => String(file?.type || "").startsWith("image/"));
  if (fileMatch) {
    return normalizeClipboardFile(fileMatch, now);
  }

  const items = Array.from(clipboardData?.items || []);
  for (const item of items) {
    if (item?.kind !== "file" || !String(item?.type || "").startsWith("image/")) {
      continue;
    }

    const file = item.getAsFile?.();
    const normalizedFile = normalizeClipboardFile(file, now);
    if (normalizedFile) {
      return normalizedFile;
    }
  }

  return null;
}
