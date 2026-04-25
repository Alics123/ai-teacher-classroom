function trimTrailingSlash(value = "") {
  return String(value).replace(/\/+$/, "");
}

export function resolveApiBaseUrl({
  envBaseUrl = "",
  currentOrigin,
  backendPort = "8008",
} = {}) {
  if (envBaseUrl) {
    return trimTrailingSlash(envBaseUrl);
  }

  if (currentOrigin) {
    const url = new URL(currentOrigin);
    url.port = String(backendPort);
    return trimTrailingSlash(url.origin);
  }

  return `http://127.0.0.1:${backendPort}`;
}
