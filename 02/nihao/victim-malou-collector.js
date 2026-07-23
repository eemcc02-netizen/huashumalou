const CRM_USER_BASE_URL = "https://crm.tenclass.com/user/";
const MESSAGE_RETRY_MS = 18000;

export function parseVictimIds(raw) {
  const seen = new Set();
  return String(raw || "")
    .split(/[\s,，;；]+/)
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value))
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

export class VictimMalouCollector {
  constructor() {
    this.cancelled = false;
    this.activeTabIds = new Set();
  }

  async collect(ids, options = {}) {
    this.cancelled = false;
    const concurrency = clampNumber(options.concurrency, 1, 10, 2);
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const onResult = typeof options.onResult === "function" ? options.onResult : () => {};
    const results = new Array(ids.length);
    let cursor = 0;
    let completed = 0;

    const runWorker = async () => {
      const tab = await chrome.tabs.create({ url: "about:blank", active: false });
      this.activeTabIds.add(tab.id);
      try {
        while (!this.cancelled) {
          const index = cursor;
          cursor += 1;
          if (index >= ids.length) return;

          const id = ids[index];
          let result;
          try {
            result = await this.collectInTab(tab.id, id);
          } catch (error) {
            result = {
              id,
              nickname: "",
              avatarData: "",
              avatarMime: "",
              sourceUrl: `${CRM_USER_BASE_URL}${encodeURIComponent(id)}`,
              ok: false,
              error: String(error?.message || error || "采集失败")
            };
          }

          results[index] = result;
          completed += 1;
          onResult(result, index);
          onProgress({
            total: ids.length,
            completed,
            success: results.filter((item) => item?.ok).length,
            failed: results.filter((item) => item && !item.ok).length
          });
        }
      } finally {
        this.activeTabIds.delete(tab.id);
        await closeTabQuietly(tab.id);
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, runWorker));
    return results.filter(Boolean);
  }

  async collectInTab(tabId, id) {
    if (this.cancelled) throw new Error("任务已停止");
    const sourceUrl = `${CRM_USER_BASE_URL}${encodeURIComponent(id)}`;
    await chrome.tabs.update(tabId, { url: sourceUrl });
    const profile = await requestProfileWithRetry(tabId, id, MESSAGE_RETRY_MS);
    if (this.cancelled) throw new Error("任务已停止");
    if (!profile?.ok) throw new Error(profile?.error || "没有识别到用户资料");
    const avatar = await downloadAvatar(profile.avatarUrl);
    return {
      id: String(profile.id || id),
      nickname: String(profile.nickname || ""),
      avatarData: avatar.dataUrl,
      avatarMime: avatar.mime,
      sourceUrl,
      ok: true,
      error: ""
    };
  }

  async cancel() {
    this.cancelled = true;
    const tabIds = [...this.activeTabIds];
    this.activeTabIds.clear();
    await Promise.all(tabIds.map(closeTabQuietly));
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

async function requestProfileWithRetry(tabId, id, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "victim-malou:collect-profile",
        id
      });
      if (response?.ok || response?.error !== "页面正在切换") {
        return response;
      }
      lastError = new Error(response.error);
    } catch (error) {
      lastError = error;
    }
    await delay(120);
  }
  throw new Error(lastError?.message || "CRM 页面采集模块未响应");
}

async function downloadAvatar(url) {
  const avatarUrl = String(url || "").trim();
  if (!avatarUrl) throw new Error("没有找到头像");
  if (avatarUrl.startsWith("data:image/")) {
    return {
      dataUrl: avatarUrl,
      mime: avatarUrl.slice(5, avatarUrl.indexOf(";")) || "image/png"
    };
  }

  const response = await fetch(avatarUrl, {
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`头像下载失败（${response.status}）`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("头像响应不是图片");
  return {
    dataUrl: await blobToDataUrl(blob),
    mime: blob.type
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("头像转换失败"));
    reader.readAsDataURL(blob);
  });
}

async function closeTabQuietly(tabId) {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    // The user may have closed the temporary tab.
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
