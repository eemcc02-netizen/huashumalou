import { getStorageKeys } from "../shared/constants";
import { ensureBootstrapData, getSettings, setPendingQuickSave } from "../shared/storage";

const QUICK_SAVE_MENU_ID = "tb-quick-save";
const SETTINGS_KEY = getStorageKeys().settings;

function createIcon(size: number, enabled: boolean) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new ImageData(size, size);
  }

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = enabled ? "#2563eb" : "#94a3b8";
  ctx.fillRect(2, 2, size - 4, size - 4);

  ctx.fillStyle = "#ffffff";
  ctx.font = `${Math.round(size * 0.56)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("T", size / 2, size / 2 + 0.5);

  return ctx.getImageData(0, 0, size, size);
}

async function syncActionVisual() {
  const settings = await getSettings();
  const enabled = settings.enableExtension;
  await chrome.action.setIcon({
    imageData: {
      16: createIcon(16, enabled),
      32: createIcon(32, enabled)
    }
  });
  await chrome.action.setTitle({
    title: enabled ? "话术补全助手（已开启）" : "话术补全助手（已关闭）"
  });
}

async function initDefaults() {
  await ensureBootstrapData();
  await syncActionVisual();
}

chrome.runtime.onInstalled.addListener(async () => {
  await initDefaults();

  chrome.contextMenus.create({
    id: QUICK_SAVE_MENU_ID,
    title: "保存为话术片段",
    contexts: ["selection"]
  });
});

chrome.runtime.onStartup.addListener(async () => {
  await initDefaults();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[SETTINGS_KEY]) {
    return;
  }
  void syncActionVisual();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "SETTINGS_UPDATED") {
    void syncActionVisual();
  }
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== QUICK_SAVE_MENU_ID || typeof info.selectionText !== "string") {
    return;
  }

  await setPendingQuickSave({
    selectedText: info.selectionText,
    createdAt: new Date().toISOString()
  });

  await chrome.runtime.openOptionsPage();
});
