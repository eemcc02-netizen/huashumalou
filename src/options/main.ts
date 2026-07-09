import "./options.css";
import { DEFAULT_SETTINGS } from "../shared/constants";
import {
  clearPendingQuickSave,
  createSnippet,
  deleteSnippet,
  deleteSnippets,
  ensureBootstrapData,
  exportAllData,
  findShortcutConflicts,
  getPendingQuickSave,
  getSettings,
  getSnippets,
  importAllData,
  saveSettings,
  saveSnippets,
  upsertSnippet
} from "../shared/storage";
import type { ExportPayload, Snippet, UserSettings } from "../shared/types";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Options root not found");
}

type EditableField = "title" | "shortcut" | "category" | "content";
type BatchDraft = { title: string; shortcut: string; category: string; content: string };

let settings: UserSettings = DEFAULT_SETTINGS;
let snippets: Snippet[] = [];
let pendingText = "";
let importMessage = "";
let batchImportMessage = "";
let activeTab: "basic" | "snippets" | "importExport" | "sites" = "basic";
let snippetFilterPrefix: "all" | "/" | "、" = "all";
let snippetFilterCategory = "all";
let snippetFilterConflictOnly = false;
let snippetFilterRecentOnly = false;
let snippetKeyword = "";
let snippetFormDraft: BatchDraft = {
  title: "",
  shortcut: "",
  category: "",
  content: ""
};
let selectedSnippetIds = new Set<string>();
let keywordFilterTimer: number | null = null;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function summarizeContent(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

function formatRecentTime(snippet: Snippet) {
  if (!snippet.lastUsedAt) {
    return "未使用";
  }
  const date = new Date(snippet.lastUsedAt);
  if (Number.isNaN(date.getTime())) {
    return "未使用";
  }
  return date.toLocaleString("zh-CN");
}

function syncSelectionWithSnippets() {
  const validIds = new Set(snippets.map((item) => item.id));
  selectedSnippetIds = new Set(Array.from(selectedSnippetIds).filter((id) => validIds.has(id)));
}

function getConflictMap() {
  const map = new Map<string, number>();
  for (const item of snippets) {
    map.set(item.shortcutNormalized, (map.get(item.shortcutNormalized) ?? 0) + 1);
  }
  return map;
}

function getFilteredSnippets() {
  const conflictMap = getConflictMap();
  let list = snippets.slice();

  if (snippetFilterPrefix !== "all") {
    list = list.filter((item) => item.shortcut.startsWith(snippetFilterPrefix));
  }

  if (snippetFilterCategory !== "all") {
    if (snippetFilterCategory === "__uncategorized__") {
      list = list.filter((item) => !item.category || !item.category.trim());
    } else {
      list = list.filter((item) => (item.category ?? "").trim() === snippetFilterCategory);
    }
  }

  if (snippetFilterConflictOnly) {
    list = list.filter((item) => (conflictMap.get(item.shortcutNormalized) ?? 0) > 1);
  }

  if (snippetFilterRecentOnly) {
    list = list.filter((item) => Boolean(item.lastUsedAt));
    list.sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""));
  }

  const normalizedKeyword = snippetKeyword.trim().toLowerCase();
  if (normalizedKeyword) {
    list = list.filter((item) =>
      [item.title, item.shortcut, item.content, item.category ?? ""].some((field) =>
        field.toLowerCase().includes(normalizedKeyword)
      )
    );
  }

  return list;
}

function getCategoryOptions() {
  const categories = new Set<string>();
  for (const item of snippets) {
    const value = (item.category ?? "").trim();
    if (value) {
      categories.add(value);
    }
  }
  return Array.from(categories).sort((a, b) => a.localeCompare(b));
}

function getTabsHtml() {
  const tabs = [
    { key: "basic", label: "基础设置" },
    { key: "snippets", label: "片段管理" },
    { key: "importExport", label: "导入导出" },
    { key: "sites", label: "站点规则" }
  ] as const;

  return `
    <div class="tabs">
      ${tabs
        .map(
          (tab) => `
            <button class="tab-button ${activeTab === tab.key ? "active" : ""}" data-tab="${tab.key}">
              ${tab.label}
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function getBasicSettingsHtml() {
  return `
    <div class="card grid">
      <h2>基础设置</h2>
      <label class="switch-row">
        <span>插件总开关</span>
        <input type="checkbox" id="enableExtension" ${settings.enableExtension ? "checked" : ""} />
      </label>
      <label class="grid">
        <span>默认前缀列表</span>
        <input class="input" id="triggerPrefixes" value="${escapeHtml(settings.triggerPrefixes.join(","))}" placeholder="/,、" />
        <span class="muted">用英文逗号分隔，例如：/,、,;</span>
      </label>
      <label class="grid">
        <span>默认签名</span>
        <textarea class="textarea" id="defaultSignature" placeholder="这里可填写 {{signature}} 的默认内容">${escapeHtml(settings.defaultSignature)}</textarea>
      </label>
      <label class="grid">
        <span>站点黑名单</span>
        <textarea class="textarea" id="blacklistSites" placeholder="每行一个域名，例如：mail.google.com">${escapeHtml(settings.blacklistSites.join("\n"))}</textarea>
      </label>
      <p class="muted">作者ID：维护联系用户运营毛传艺</p>
      <button class="button" id="saveSettings">保存设置</button>
    </div>
  `;
}

function getSnippetManageHtml() {
  const conflictItems = findShortcutConflicts(snippets, snippetFormDraft.shortcut);
  const categories = getCategoryOptions();
  const conflictMap = getConflictMap();
  const filtered = getFilteredSnippets();
  const selectedCount = Array.from(selectedSnippetIds).filter((id) => filtered.some((item) => item.id === id)).length;

  return `
    <div class="card grid">
      <h2>新增片段</h2>
      <div class="row three">
        <input class="input" id="snippetTitle" placeholder="标题" value="${escapeHtml(snippetFormDraft.title)}" />
        <input class="input" id="snippetShortcut" placeholder="快捷词，例如：、zd" value="${escapeHtml(snippetFormDraft.shortcut)}" />
        <input class="input" id="snippetCategory" placeholder="分类，例如：客服" value="${escapeHtml(snippetFormDraft.category)}" />
      </div>
      <textarea class="textarea" id="snippetContent" placeholder="话术内容">${escapeHtml(snippetFormDraft.content || pendingText)}</textarea>
      <div class="notice" id="conflictNotice" style="${conflictItems.length > 0 ? "" : "display:none;"}">
        ${conflictItems.length > 0 ? `快捷词冲突：${conflictItems.map((item) => escapeHtml(item.title)).join("、")}` : ""}
      </div>
      <div class="row">
        <button class="button" id="saveSnippet">保存片段</button>
        <button class="button secondary" id="clearPending">清空待保存文本</button>
      </div>
    </div>

    <div class="card grid">
      <h2>Excel 批量导入</h2>
      <div class="excel-paste-zone" id="excelPasteZone" tabindex="0">
        点击此区域后按 Ctrl+V，可直接粘贴 Excel。<br />
        支持列格式：标题\t快捷词\t分类\t内容（或 标题\t快捷词\t内容）。
      </div>
      ${batchImportMessage ? `<div class="notice">${escapeHtml(batchImportMessage)}</div>` : ""}
    </div>

    <div class="card grid">
      <h2>筛选器</h2>
      <div class="row three">
        <label class="grid">
          <span>按前缀</span>
          <select class="select" id="filterPrefix">
            <option value="all" ${snippetFilterPrefix === "all" ? "selected" : ""}>全部</option>
            <option value="/" ${snippetFilterPrefix === "/" ? "selected" : ""}>/</option>
            <option value="、" ${snippetFilterPrefix === "、" ? "selected" : ""}>、</option>
          </select>
        </label>
        <label class="grid">
          <span>按分类</span>
          <select class="select" id="filterCategory">
            <option value="all" ${snippetFilterCategory === "all" ? "selected" : ""}>全部</option>
            <option value="__uncategorized__" ${snippetFilterCategory === "__uncategorized__" ? "selected" : ""}>未分类</option>
            ${categories
              .map((item) => `<option value="${escapeHtml(item)}" ${snippetFilterCategory === item ? "selected" : ""}>${escapeHtml(item)}</option>`)
              .join("")}
          </select>
        </label>
        <label class="grid">
          <span>关键词搜索</span>
          <input class="input" id="filterKeyword" value="${escapeHtml(snippetKeyword)}" placeholder="标题/快捷词/内容" />
        </label>
      </div>
      <div class="row">
        <label><input type="checkbox" id="filterConflictOnly" ${snippetFilterConflictOnly ? "checked" : ""} /> 仅显示冲突</label>
        <label><input type="checkbox" id="filterRecentOnly" ${snippetFilterRecentOnly ? "checked" : ""} /> 按最近使用筛选</label>
      </div>
    </div>

    <div class="card grid">
      <div class="row">
        <h2>片段管理表格（${filtered.length}）</h2>
        <div class="row actions-inline">
          <button class="button danger" id="deleteSelected" ${selectedCount === 0 ? "disabled" : ""}>删除选中（${selectedCount}）</button>
          <button class="button secondary" id="clearSelection" ${selectedCount === 0 ? "disabled" : ""}>清空选择</button>
        </div>
      </div>
      <p class="muted">单击单元格即可编辑；失去焦点或按回车将自动保存。</p>
      <div class="table-wrap">
        <table class="snippet-table">
          <thead>
            <tr>
              <th><input type="checkbox" id="selectAllSnippets" ${filtered.length > 0 && selectedCount === filtered.length ? "checked" : ""} /></th>
              <th>标题</th>
              <th>快捷词</th>
              <th>分类</th>
              <th>内容</th>
              <th>最近使用</th>
              <th>冲突</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length === 0
                ? `<tr><td colspan="8" class="muted">没有匹配到片段。</td></tr>`
                : filtered
                    .map((item) => {
                      const conflictCount = conflictMap.get(item.shortcutNormalized) ?? 0;
                      return `
                        <tr>
                          <td><input type="checkbox" class="row-select" data-id="${item.id}" ${selectedSnippetIds.has(item.id) ? "checked" : ""} /></td>
                          <td><input class="input cell-editable" data-id="${item.id}" data-field="title" value="${escapeHtml(item.title)}" /></td>
                          <td><input class="input cell-editable" data-id="${item.id}" data-field="shortcut" value="${escapeHtml(item.shortcut)}" /></td>
                          <td><input class="input cell-editable" data-id="${item.id}" data-field="category" value="${escapeHtml(item.category ?? "")}" /></td>
                          <td><input class="input cell-editable cell-content" data-id="${item.id}" data-field="content" value="${escapeHtml(summarizeContent(item.content))}" /></td>
                          <td>${escapeHtml(formatRecentTime(item))}</td>
                          <td>${
                            conflictCount > 1
                              ? `<span class="status-conflict">冲突(${conflictCount})</span>`
                              : `<span class="status-ok">正常</span>`
                          }</td>
                          <td>
                            <button class="button danger" data-action="delete-row" data-id="${item.id}">删除</button>
                          </td>
                        </tr>
                      `;
                    })
                    .join("")
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function getImportExportHtml() {
  return `
    <div class="card grid">
      <h2>JSON 导入导出</h2>
      ${importMessage ? `<div class="notice">${escapeHtml(importMessage)}</div>` : ""}
      <div class="row actions">
        <button class="button" id="exportJson">导出 JSON</button>
        <button class="button secondary" id="importJson">导入 JSON</button>
        <button class="button secondary" id="downloadSample">导出示例</button>
      </div>
      <input class="input" id="importFile" type="file" accept="application/json,.json" style="display:none" />
      <span class="muted">导入会覆盖当前片段和设置，建议先导出备份。</span>
    </div>
  `;
}

function getSitesHtml() {
  const siteRuleEntries = Object.entries(settings.siteRules).sort(([a], [b]) => a.localeCompare(b));
  return `
    <div class="card grid">
      <h2>站点规则</h2>
      ${
        siteRuleEntries.length === 0
          ? `<p class="muted">当前还没有单独配置过站点级开关，可在插件弹窗中对当前站点一键启用或关闭。</p>`
          : siteRuleEntries
              .map(
                ([host, enabled]) => `
                  <div class="site-rule">
                    <div>
                      <strong>${escapeHtml(host)}</strong>
                      <div class="muted">${enabled ? "当前启用" : "当前禁用"}</div>
                    </div>
                    <div class="row">
                      <span class="badge">${enabled ? "已启用" : "已禁用"}</span>
                      <button class="button secondary remove-site-rule" data-host="${escapeHtml(host)}">移除规则</button>
                    </div>
                  </div>
                `
              )
              .join("")
      }
    </div>
  `;
}

function render() {
  app.innerHTML = `
    <h1 class="page-title">话术补全助手设置</h1>
    <p class="page-desc">按分区管理设置、片段、导入导出和站点规则。</p>
    ${getTabsHtml()}
    ${activeTab === "basic" ? getBasicSettingsHtml() : ""}
    ${activeTab === "snippets" ? getSnippetManageHtml() : ""}
    ${activeTab === "importExport" ? getImportExportHtml() : ""}
    ${activeTab === "sites" ? getSitesHtml() : ""}
  `;

  bindEvents();
}

function parseBatchImport(rawText: string) {
  const lines = rawText
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rows: [] as BatchDraft[], skipped: 0 };
  }

  const firstCols = lines[0].split("\t").map((item) => item.trim().toLowerCase());
  const hasHeader = firstCols.some((item) => ["标题", "title", "快捷词", "shortcut", "内容", "content", "分类", "category"].includes(item));
  const startIndex = hasHeader ? 1 : 0;

  const rows: BatchDraft[] = [];
  let skipped = 0;

  for (let i = startIndex; i < lines.length; i += 1) {
    const cols = lines[i].split("\t");
    let title = "";
    let shortcut = "";
    let category = "";
    let content = "";

    if (cols.length >= 4) {
      title = cols[0]?.trim() ?? "";
      shortcut = cols[1]?.trim() ?? "";
      category = cols[2]?.trim() ?? "";
      content = cols.slice(3).join("\t").trim();
    } else if (cols.length === 3) {
      title = cols[0]?.trim() ?? "";
      shortcut = cols[1]?.trim() ?? "";
      content = cols[2]?.trim() ?? "";
    } else if (cols.length === 2) {
      shortcut = cols[0]?.trim() ?? "";
      content = cols[1]?.trim() ?? "";
      title = content.slice(0, 12) || `批量导入${rows.length + 1}`;
    } else {
      skipped += 1;
      continue;
    }

    if (!shortcut || !content) {
      skipped += 1;
      continue;
    }

    rows.push({
      title: title || `批量导入${rows.length + 1}`,
      shortcut,
      category,
      content
    });
  }

  return { rows, skipped };
}

async function importByExcelPaste(rawText: string) {
  const { rows, skipped } = parseBatchImport(rawText);
  if (rows.length === 0) {
    batchImportMessage = "未识别到可导入数据，请检查是否为 Excel 复制内容。";
    render();
    return;
  }

  const next = snippets.concat(rows.map((row) => createSnippet(row)));
  await saveSnippets(next);
  snippets = await getSnippets();
  batchImportMessage = `批量导入成功：新增 ${rows.length} 条，跳过 ${skipped} 条。`;
  await chrome.runtime.sendMessage({ type: "SNIPPETS_UPDATED" }).catch(() => undefined);
  render();
}

async function saveCellValue(input: HTMLInputElement) {
  const id = input.dataset.id;
  const field = input.dataset.field as EditableField | undefined;
  if (!id || !field) {
    return;
  }

  const value = input.value;
  const previous = input.dataset.previousValue ?? "";

  if (value === previous) {
    return;
  }

  const existing = snippets.find((item) => item.id === id);
  if (!existing) {
    return;
  }

  const nextValue = field === "category" ? value : value.trim();
  if ((field === "title" || field === "shortcut" || field === "content") && !nextValue) {
    window.alert("标题、快捷词、内容不能为空。已恢复原值。");
    input.value = previous;
    return;
  }

  await upsertSnippet({
    ...existing,
    [field]: nextValue
  });

  snippets = await getSnippets();
  await chrome.runtime.sendMessage({ type: "SNIPPETS_UPDATED" }).catch(() => undefined);
  render();
}

function bindEvents() {
  for (const button of app.querySelectorAll<HTMLButtonElement>(".tab-button[data-tab]")) {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab as typeof activeTab | undefined;
      if (!tab) {
        return;
      }
      activeTab = tab;
      render();
    });
  }

  app.querySelector<HTMLButtonElement>("#saveSettings")?.addEventListener("click", async () => {
    const triggerPrefixes =
      app
        .querySelector<HTMLInputElement>("#triggerPrefixes")
        ?.value.split(",")
        .map((item) => item.trim())
        .filter(Boolean) ?? DEFAULT_SETTINGS.triggerPrefixes;

    const defaultSignature = app.querySelector<HTMLTextAreaElement>("#defaultSignature")?.value ?? "";
    const enableExtension = app.querySelector<HTMLInputElement>("#enableExtension")?.checked ?? true;
    const blacklistSites =
      app
        .querySelector<HTMLTextAreaElement>("#blacklistSites")
        ?.value.split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean) ?? [];

    settings = {
      ...settings,
      enableExtension,
      triggerPrefixes,
      defaultSignature,
      blacklistSites
    };

    await saveSettings(settings);
    await chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED" }).catch(() => undefined);
    window.alert("设置已保存。")
    render();
  });

  app.querySelector<HTMLButtonElement>("#saveSnippet")?.addEventListener("click", async () => {
    const { title, shortcut, content, category } = snippetFormDraft;

    if (!title.trim() || !shortcut.trim() || !content.trim()) {
      window.alert("标题、快捷词和话术内容都不能为空。");
      return;
    }

    await upsertSnippet(createSnippet({ title, shortcut, content, category }));
    snippets = await getSnippets();
    syncSelectionWithSnippets();
    await clearPendingQuickSave();
    pendingText = "";
    snippetFormDraft = {
      title: "",
      shortcut: "",
      category: "",
      content: ""
    };
    await chrome.runtime.sendMessage({ type: "SNIPPETS_UPDATED" }).catch(() => undefined);
    render();
  });

  app.querySelector<HTMLButtonElement>("#clearPending")?.addEventListener("click", async () => {
    pendingText = "";
    snippetFormDraft = {
      title: "",
      shortcut: "",
      category: "",
      content: ""
    };
    await clearPendingQuickSave();
    render();
  });

  app.querySelector<HTMLInputElement>("#snippetTitle")?.addEventListener("input", (event) => {
    snippetFormDraft.title = (event.currentTarget as HTMLInputElement).value;
  });
  app.querySelector<HTMLInputElement>("#snippetShortcut")?.addEventListener("input", (event) => {
    snippetFormDraft.shortcut = (event.currentTarget as HTMLInputElement).value;
    updateConflictNotice();
  });
  app.querySelector<HTMLInputElement>("#snippetCategory")?.addEventListener("input", (event) => {
    snippetFormDraft.category = (event.currentTarget as HTMLInputElement).value;
  });
  app.querySelector<HTMLTextAreaElement>("#snippetContent")?.addEventListener("input", (event) => {
    snippetFormDraft.content = (event.currentTarget as HTMLTextAreaElement).value;
  });

  app.querySelector<HTMLDivElement>("#excelPasteZone")?.addEventListener("paste", async (event) => {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    event.preventDefault();
    await importByExcelPaste(text);
  });

  app.querySelector<HTMLSelectElement>("#filterPrefix")?.addEventListener("change", (event) => {
    snippetFilterPrefix = ((event.currentTarget as HTMLSelectElement).value as typeof snippetFilterPrefix) ?? "all";
    render();
  });
  app.querySelector<HTMLSelectElement>("#filterCategory")?.addEventListener("change", (event) => {
    snippetFilterCategory = (event.currentTarget as HTMLSelectElement).value;
    render();
  });
  app.querySelector<HTMLInputElement>("#filterConflictOnly")?.addEventListener("change", (event) => {
    snippetFilterConflictOnly = (event.currentTarget as HTMLInputElement).checked;
    render();
  });
  app.querySelector<HTMLInputElement>("#filterRecentOnly")?.addEventListener("change", (event) => {
    snippetFilterRecentOnly = (event.currentTarget as HTMLInputElement).checked;
    render();
  });
  app.querySelector<HTMLInputElement>("#filterKeyword")?.addEventListener("input", (event) => {
    snippetKeyword = (event.currentTarget as HTMLInputElement).value;
    if (keywordFilterTimer !== null) {
      window.clearTimeout(keywordFilterTimer);
    }
    keywordFilterTimer = window.setTimeout(() => {
      keywordFilterTimer = null;
      render();
    }, 180);
  });

  app.querySelector<HTMLInputElement>("#selectAllSnippets")?.addEventListener("change", (event) => {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    const filteredIds = getFilteredSnippets().map((item) => item.id);
    if (checked) {
      for (const id of filteredIds) {
        selectedSnippetIds.add(id);
      }
    } else {
      for (const id of filteredIds) {
        selectedSnippetIds.delete(id);
      }
    }
    render();
  });

  for (const checkbox of app.querySelectorAll<HTMLInputElement>(".row-select[data-id]")) {
    checkbox.addEventListener("change", () => {
      const id = checkbox.dataset.id;
      if (!id) {
        return;
      }
      if (checkbox.checked) {
        selectedSnippetIds.add(id);
      } else {
        selectedSnippetIds.delete(id);
      }
      render();
    });
  }

  app.querySelector<HTMLButtonElement>("#clearSelection")?.addEventListener("click", () => {
    selectedSnippetIds.clear();
    render();
  });

  app.querySelector<HTMLButtonElement>("#deleteSelected")?.addEventListener("click", async () => {
    const targets = Array.from(selectedSnippetIds);
    if (targets.length === 0) {
      return;
    }
    if (!window.confirm(`确认删除选中的 ${targets.length} 条片段吗？`)) {
      return;
    }
    await deleteSnippets(targets);
    selectedSnippetIds.clear();
    snippets = await getSnippets();
    await chrome.runtime.sendMessage({ type: "SNIPPETS_UPDATED" }).catch(() => undefined);
    render();
  });

  for (const input of app.querySelectorAll<HTMLInputElement>(".cell-editable[data-id][data-field]")) {
    input.addEventListener("focus", () => {
      input.dataset.previousValue = input.value;
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });

    input.addEventListener("blur", async () => {
      await saveCellValue(input);
    });
  }

  app.querySelector<HTMLButtonElement>("#exportJson")?.addEventListener("click", async () => {
    const payload = await exportAllData();
    downloadJson("text-blaze-like-export.json", payload);
  });

  app.querySelector<HTMLButtonElement>("#downloadSample")?.addEventListener("click", async () => {
    const payload = await exportAllData();
    downloadJson("sample-snippets.json", payload);
  });

  app.querySelector<HTMLButtonElement>("#importJson")?.addEventListener("click", () => {
    app.querySelector<HTMLInputElement>("#importFile")?.click();
  });

  app.querySelector<HTMLInputElement>("#importFile")?.addEventListener("change", async (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text) as ExportPayload;
      await importAllData(payload);
      snippets = await getSnippets();
      settings = await getSettings();
      syncSelectionWithSnippets();
      importMessage = `导入成功，共载入 ${snippets.length} 个片段。`;
      await chrome.runtime.sendMessage({ type: "SNIPPETS_UPDATED" }).catch(() => undefined);
      await chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED" }).catch(() => undefined);
      render();
    } catch (error) {
      importMessage = `导入失败：${error instanceof Error ? error.message : "文件格式不正确"}`;
      render();
    }
  });

  for (const button of app.querySelectorAll<HTMLButtonElement>(".remove-site-rule")) {
    button.addEventListener("click", async () => {
      const host = button.dataset.host;
      if (!host) {
        return;
      }

      const nextRules = { ...settings.siteRules };
      delete nextRules[host];
      settings = {
        ...settings,
        siteRules: nextRules
      };
      await saveSettings(settings);
      await chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED" }).catch(() => undefined);
      render();
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="delete-row"]')) {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;
      if (!id) {
        return;
      }
      await deleteSnippet(id);
      selectedSnippetIds.delete(id);
      snippets = await getSnippets();
      await chrome.runtime.sendMessage({ type: "SNIPPETS_UPDATED" }).catch(() => undefined);
      render();
    });
  }
}

function updateConflictNotice() {
  const notice = app.querySelector<HTMLDivElement>("#conflictNotice");
  if (!notice) {
    return;
  }

  const conflicts = findShortcutConflicts(snippets, snippetFormDraft.shortcut);
  if (conflicts.length === 0) {
    notice.style.display = "none";
    notice.textContent = "";
    return;
  }

  notice.style.display = "block";
  notice.textContent = `快捷词冲突：${conflicts.map((item) => item.title).join("、")}`;
}

function downloadJson(filename: string, payload: ExportPayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function init() {
  await ensureBootstrapData();
  settings = await getSettings();
  snippets = await getSnippets();
  pendingText = (await getPendingQuickSave())?.selectedText ?? "";
  snippetFormDraft.content = pendingText;
  syncSelectionWithSnippets();
  render();
}

void init();
