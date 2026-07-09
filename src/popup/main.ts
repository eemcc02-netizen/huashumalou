import "./popup.css";
import {
  createSnippet,
  deleteSnippet,
  ensureBootstrapData,
  findShortcutConflicts,
  getSettings,
  getSnippets,
  saveSettings,
  upsertSnippet
} from "../shared/storage";
import type { Snippet, UserSettings } from "../shared/types";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Popup root not found");
}

let snippets: Snippet[] = [];
let query = "";
let editingId = "";
let currentHost = "";
let settings: UserSettings | null = null;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function filteredSnippets() {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return snippets.slice().sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""));
  }

  return snippets.filter((item) =>
    [item.title, item.shortcut, item.content].some((field) => field.toLowerCase().includes(normalized))
  );
}

function getCurrentDraft() {
  return {
    title: app.querySelector<HTMLInputElement>("#title")?.value ?? "",
    shortcut: app.querySelector<HTMLInputElement>("#shortcut")?.value ?? "",
    content: app.querySelector<HTMLTextAreaElement>("#content")?.value ?? ""
  };
}

function getConflictItems() {
  const draft = getCurrentDraft();
  return findShortcutConflicts(snippets, draft.shortcut, editingId || undefined);
}

function updateConflictWarning() {
  const container = app.querySelector<HTMLDivElement>("#conflict-warning");
  if (!container) {
    return;
  }

  const conflicts = getConflictItems();
  if (conflicts.length === 0) {
    container.style.display = "none";
    container.textContent = "";
    return;
  }

  container.style.display = "block";
  container.textContent = `快捷词冲突：${conflicts.map((item) => item.title).join("、")}`;
}

function getCurrentSiteStatusText() {
  if (!currentHost || !settings) {
    return "当前页面站点信息不可用";
  }

  const enabled = settings.siteRules[currentHost] ?? true;
  return enabled ? `${currentHost} 已启用` : `${currentHost} 已禁用`;
}

async function detectCurrentHost() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0]?.url;
    if (!url) {
      currentHost = "";
      return;
    }
    currentHost = new URL(url).hostname;
  } catch {
    currentHost = "";
  }
}

function render() {
  const items = filteredSnippets();
  const conflicts = getConflictItems();
  const isEditing = Boolean(editingId);
  const siteStatus = getCurrentSiteStatusText();
  const extensionEnabled = settings?.enableExtension ?? true;
  const currentSiteEnabled = currentHost && settings ? (settings.siteRules[currentHost] ?? true) : false;
  const draft = getCurrentDraft();

  app.innerHTML = `
    <div class="card">
      <h1 class="title">话术补全助手</h1>
      <p class="muted">支持自定义快捷词，例如 <strong>、zd</strong> 或 <strong>/ty</strong></p>
    </div>
    <div class="card stack">
      <div class="row">
        <span class="chip">${extensionEnabled ? "插件已开启" : "插件已关闭"}</span>
        <button class="button secondary" id="toggle-extension">
          ${extensionEnabled ? "关闭插件" : "开启插件"}
        </button>
      </div>
    </div>
    <div class="card stack">
      <div class="row">
        <span class="chip">${escapeHtml(siteStatus)}</span>
        <button class="button secondary" id="toggle-site" ${currentHost ? "" : "disabled"}>
          ${currentSiteEnabled ? "关闭当前站点" : "启用当前站点"}
        </button>
      </div>
    </div>
    <div class="card stack">
      <input class="input" id="search" placeholder="搜索标题、快捷词、内容" value="${escapeHtml(query)}" />
      <span class="label">${isEditing ? "编辑片段" : "新建片段"}</span>
      <input class="input" id="title" placeholder="标题，例如：账单说明" value="${escapeHtml(draft.title)}" />
      <input class="input" id="shortcut" placeholder="快捷词，例如：、zd" value="${escapeHtml(draft.shortcut)}" />
      <textarea class="textarea" id="content" placeholder="输入对应话术内容">${escapeHtml(draft.content)}</textarea>
      <div class="warning" id="conflict-warning" style="${conflicts.length > 0 ? "" : "display:none;"}">
        ${conflicts.length > 0 ? `快捷词冲突：${conflicts.map((item) => escapeHtml(item.title)).join("、")}` : ""}
      </div>
      <div class="row actions">
        <button class="button" id="save">${isEditing ? "保存修改" : "保存片段"}</button>
        <button class="button secondary" id="reset-form">${isEditing ? "取消编辑" : "清空表单"}</button>
      </div>
    </div>
    <div class="card stack">
      <div class="row">
        <button class="button secondary" id="open-options">更多设置</button>
      </div>
      <div class="stack" id="list">
        ${
          items.length === 0
            ? `<p class="muted">还没有片段，先创建一个吧。</p>`
            : items
                .map(
                  (item) => `
                  <div class="snippet" data-id="${item.id}">
                    <div class="snippet-head">
                      <strong>${escapeHtml(item.title)}</strong>
                      <span class="shortcut">${escapeHtml(item.shortcut)}</span>
                    </div>
                    <p class="content-preview">${escapeHtml(item.content)}</p>
                    <div class="snippet-actions">
                      <button class="button secondary edit-button" data-id="${item.id}">编辑</button>
                      <button class="button secondary delete-button" data-id="${item.id}">删除</button>
                    </div>
                  </div>
                `
                )
                .join("")
        }
      </div>
    </div>
  `;

  bindEvents();
}

async function refresh() {
  await ensureBootstrapData();
  [snippets, settings] = await Promise.all([getSnippets(), getSettings()]);
  render();
}

function fillForm(snippet?: Snippet) {
  const title = app.querySelector<HTMLInputElement>("#title");
  const shortcut = app.querySelector<HTMLInputElement>("#shortcut");
  const content = app.querySelector<HTMLTextAreaElement>("#content");

  if (!title || !shortcut || !content) {
    return;
  }

  title.value = snippet?.title ?? "";
  shortcut.value = snippet?.shortcut ?? "";
  content.value = snippet?.content ?? "";
}

function bindEvents() {
  app.querySelector<HTMLInputElement>("#search")?.addEventListener("input", (event) => {
    query = (event.currentTarget as HTMLInputElement).value;
    render();
  });

  app.querySelector<HTMLInputElement>("#shortcut")?.addEventListener("input", updateConflictWarning);

  app.querySelector<HTMLButtonElement>("#save")?.addEventListener("click", async () => {
    const { title, shortcut, content } = getCurrentDraft();

    if (!title.trim() || !shortcut.trim() || !content.trim()) {
      window.alert("标题、快捷词和话术内容都不能为空。");
      return;
    }

    if (editingId) {
      const existing = snippets.find((item) => item.id === editingId);
      if (!existing) {
        editingId = "";
        await refresh();
        return;
      }

      await upsertSnippet({
        ...existing,
        title,
        shortcut,
        content
      });
    } else {
      await upsertSnippet(createSnippet({ title, shortcut, content }));
    }

    editingId = "";
    await chrome.runtime.sendMessage({ type: "SNIPPETS_UPDATED" }).catch(() => undefined);
    await refresh();
    fillForm();
  });

  app.querySelector<HTMLButtonElement>("#open-options")?.addEventListener("click", async () => {
    await chrome.runtime.openOptionsPage();
  });

  app.querySelector<HTMLButtonElement>("#reset-form")?.addEventListener("click", () => {
    editingId = "";
    fillForm();
    render();
  });

  app.querySelector<HTMLButtonElement>("#toggle-site")?.addEventListener("click", async () => {
    if (!currentHost || !settings) {
      return;
    }

    const current = settings.siteRules[currentHost] ?? true;
    settings = {
      ...settings,
      siteRules: {
        ...settings.siteRules,
        [currentHost]: !current
      }
    };

    await saveSettings(settings);
    await chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED" }).catch(() => undefined);
    render();
  });

  app.querySelector<HTMLButtonElement>("#toggle-extension")?.addEventListener("click", async () => {
    if (!settings) {
      return;
    }
    settings = {
      ...settings,
      enableExtension: !settings.enableExtension
    };
    await saveSettings(settings);
    await chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED" }).catch(() => undefined);
    render();
  });

  for (const button of app.querySelectorAll<HTMLButtonElement>(".edit-button")) {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      const snippet = snippets.find((item) => item.id === id);
      if (!snippet) {
        return;
      }

      editingId = snippet.id;
      fillForm(snippet);
      render();
      fillForm(snippet);
      updateConflictWarning();
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>(".delete-button")) {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;
      if (!id) {
        return;
      }
      await deleteSnippet(id);
      await chrome.runtime.sendMessage({ type: "SNIPPETS_UPDATED" }).catch(() => undefined);
      await refresh();
    });
  }
}

void detectCurrentHost().then(refresh);
