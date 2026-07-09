import { DEFAULT_SETTINGS, getStorageKeys } from "../shared/constants";
import { ensureBootstrapData } from "../shared/storage";
import type { Snippet, UserSettings } from "../shared/types";

type EditableElement = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

type SuggestionState = {
  query: string;
  items: Snippet[];
  selectedIndex: number;
};

let snippets: Snippet[] = [];
let settings: UserSettings | null = null;
let activeEditable: EditableElement | null = null;
let suggestionState: SuggestionState | null = null;
let isComposing = false;
let isApplyingSnippet = false;
let autoSendObserver: MutationObserver | null = null;
let autoSendScanTimer: number | null = null;

const STORAGE_KEYS = getStorageKeys();
const SNIPPETS_KEY = STORAGE_KEYS.snippets;
const SETTINGS_KEY = STORAGE_KEYS.settings;
const TEMPLATE_REGEX = /\{\{([a-zA-Z0-9_]+)\}\}/g;

const panel = document.createElement("div");
panel.style.position = "fixed";
panel.style.zIndex = "2147483647";
panel.style.minWidth = "240px";
panel.style.maxWidth = "360px";
panel.style.background = "#ffffff";
panel.style.border = "1px solid #cbd5e1";
panel.style.borderRadius = "12px";
panel.style.boxShadow = "0 12px 32px rgba(15, 23, 42, 0.18)";
panel.style.padding = "8px";
panel.style.fontFamily = 'Arial, "Microsoft YaHei", sans-serif';
panel.style.display = "none";

function normalizeShortcut(shortcut: string) {
  return shortcut.trim().toLowerCase();
}

function applySettingsDefaults(value?: Partial<UserSettings>): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    triggerPrefixes: value?.triggerPrefixes?.filter(Boolean) ?? DEFAULT_SETTINGS.triggerPrefixes,
    blacklistSites: value?.blacklistSites?.filter(Boolean) ?? DEFAULT_SETTINGS.blacklistSites,
    siteRules: value?.siteRules ?? DEFAULT_SETTINGS.siteRules,
    completionMode: value?.completionMode === "auto" ? "auto" : DEFAULT_SETTINGS.completionMode,
    matchMode: ["prefix", "contains", "exact"].includes(value?.matchMode ?? "")
      ? value?.matchMode ?? DEFAULT_SETTINGS.matchMode
      : DEFAULT_SETTINGS.matchMode,
    suggestionWidth: clampNumber(value?.suggestionWidth, 240, 560, DEFAULT_SETTINGS.suggestionWidth),
    suggestionOpacity: clampNumber(value?.suggestionOpacity, 40, 100, DEFAULT_SETTINGS.suggestionOpacity),
    textHotSeparator: value?.textHotSeparator ?? DEFAULT_SETTINGS.textHotSeparator
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numberValue)));
}

async function getSnippets() {
  const result = await chrome.storage.local.get(SNIPPETS_KEY);
  return (result[SNIPPETS_KEY] as Snippet[] | undefined) ?? [];
}

async function getSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return applySettingsDefaults(result[SETTINGS_KEY] as UserSettings | undefined);
}

async function trackSnippetUsage(id: string) {
  const currentSnippets = await getSnippets();
  const now = new Date().toISOString();
  const next = currentSnippets.map((item) =>
    item.id === id
      ? {
          ...item,
          lastUsedAt: now,
          useCount: item.useCount + 1,
          updatedAt: now
        }
      : item
  );

  await chrome.storage.local.set({ [SNIPPETS_KEY]: next });
}

function findTemplateKeys(content: string) {
  const keys = new Set<string>();
  for (const match of content.matchAll(TEMPLATE_REGEX)) {
    keys.add(match[1]);
  }
  return Array.from(keys);
}

function renderTemplate(content: string, values: Record<string, string>) {
  return content.replace(TEMPLATE_REGEX, (_, key: string) => values[key] ?? "");
}

function getCurrentHost() {
  return window.location.hostname.toLowerCase();
}

function isInputElement(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function isContentEditableElement(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && target.isContentEditable;
}

function isEditableTarget(target: EventTarget | null): target is EditableElement {
  return isInputElement(target) || isContentEditableElement(target);
}

function matchesTriggerKey(event: KeyboardEvent, triggerKey: UserSettings["triggerKey"]) {
  if (triggerKey === "Tab") {
    return event.key === "Tab";
  }

  if (triggerKey === "Space") {
    return event.key === " ";
  }

  return event.key === "Enter";
}

function isSensitiveElement(element: EditableElement) {
  if (!settings) {
    return false;
  }

  if (element instanceof HTMLInputElement) {
    if (settings.disableInPasswordFields && element.type === "password") {
      return true;
    }

    if (!settings.disableInSensitiveFields) {
      return false;
    }

    const hints = [element.name, element.autocomplete, element.getAttribute("aria-label") ?? "", element.id]
      .join(" ")
      .toLowerCase();

    return ["otp", "验证码", "card", "银行卡", "cvv", "支付", "payment"].some((keyword) =>
      hints.includes(keyword.toLowerCase())
    );
  }

  return false;
}

function isSiteEnabled() {
  if (!settings) {
    return true;
  }

  if (!settings.enableExtension) {
    return false;
  }

  const host = getCurrentHost();
  const explicitRule = settings.siteRules[host];
  if (typeof explicitRule === "boolean") {
    return explicitRule;
  }

  const blacklisted = settings.blacklistSites.some((item) => {
    const rule = item.toLowerCase();
    return host === rule || host.endsWith(`.${rule}`);
  });

  return !blacklisted;
}

function getTextBeforeCaret(element: EditableElement) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value.slice(0, element.selectionStart ?? 0);
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return "";
  }

  const range = selection.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString();
}

function getExactMatches(textBeforeCaret: string) {
  const normalizedText = textBeforeCaret.toLowerCase();
  return snippets
    .filter((snippet) => normalizedText.endsWith(snippet.shortcutNormalized))
    .sort((a, b) => b.shortcutNormalized.length - a.shortcutNormalized.length);
}

function canConfirmSuggestionByKey(element: EditableElement, snippet: Snippet) {
  const textBeforeCaret = getTextBeforeCaret(element).toLowerCase();
  return textBeforeCaret.endsWith(snippet.shortcutNormalized);
}

function getCurrentQuery(textBeforeCaret: string) {
  if (!settings || settings.triggerPrefixes.length === 0) {
    return "";
  }

  const lastWindow = textBeforeCaret.slice(-48);
  let bestQuery = "";

  for (const prefix of settings.triggerPrefixes) {
    const index = lastWindow.lastIndexOf(prefix);
    if (index === -1) {
      continue;
    }

    const query = lastWindow.slice(index);
    if (/\s/.test(query)) {
      continue;
    }

    if (query.length > bestQuery.length) {
      bestQuery = query;
    }
  }

  return bestQuery;
}

function getMatchingSuggestions(query: string) {
  const normalized = normalizeShortcut(query);
  if (!normalized) {
    return [];
  }

  return snippets
    .filter((item) => matchesQuery(item.shortcutNormalized, normalized))
    .sort((a, b) => a.shortcutNormalized.length - b.shortcutNormalized.length)
    .slice(0, 6);
}

function matchesQuery(shortcut: string, query: string) {
  if (!settings) {
    return false;
  }
  if (settings.matchMode === "exact") {
    return shortcut === query;
  }
  if (settings.matchMode === "contains") {
    return shortcut.includes(query);
  }
  return shortcut.startsWith(query);
}

function setPanelPosition(element: EditableElement) {
  const rect = element.getBoundingClientRect();
  const top = Math.min(window.innerHeight - 12, rect.bottom + 8);
  const left = Math.min(window.innerWidth - 372, rect.left);
  panel.style.top = `${top}px`;
  panel.style.left = `${Math.max(12, left)}px`;
}

function renderPanel() {
  if (!suggestionState || suggestionState.items.length === 0 || !activeEditable) {
    hidePanel();
    return;
  }

  setPanelPosition(activeEditable);
  const opacity = Math.max(0.4, Math.min(1, (settings?.suggestionOpacity ?? 96) / 100));
  panel.style.maxWidth = `${settings?.suggestionWidth ?? 360}px`;
  panel.style.minWidth = `${Math.min(240, settings?.suggestionWidth ?? 360)}px`;
  panel.style.opacity = String(opacity);
  panel.style.display = "block";
  panel.innerHTML = suggestionState.items
    .map((item, index) => {
      const active = index === suggestionState.selectedIndex;
      const background = active ? "#eff6ff" : "#ffffff";
      const typeLabel = item.type === "image" ? "图片" : "文本";
      const preview = item.type === "image" ? item.imageName || "图片话术" : item.content;
      return `
        <div
          data-id="${item.id}"
          style="padding:8px 10px;border-radius:8px;cursor:pointer;background:${background};display:grid;gap:4px"
        >
          <strong style="font-size:13px;color:#0f172a">${escapeHtml(item.title)}</strong>
          <span style="font-size:12px;color:#2563eb">${escapeHtml(item.shortcut)} · ${typeLabel}</span>
          <span style="font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(preview)}</span>
        </div>
      `;
    })
    .join("");

  for (const item of panel.querySelectorAll<HTMLElement>("[data-id]")) {
    item.addEventListener("mousedown", async (event) => {
      event.preventDefault();
      const id = item.dataset.id;
      const snippet = suggestionState?.items.find((entry) => entry.id === id);
      if (!snippet || !activeEditable) {
        return;
      }
      await applySnippet(activeEditable, snippet);
      hidePanel();
    });
  }
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hidePanel() {
  suggestionState = null;
  panel.style.display = "none";
  panel.innerHTML = "";
}

function getBuiltinTemplateValue(key: string) {
  if (!settings) {
    return "";
  }

  if (key === "date") {
    return new Date().toLocaleDateString("zh-CN");
  }

  if (key === "time") {
    return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }

  if (key === "signature") {
    return settings.defaultSignature ?? "";
  }

  return "";
}

function openVariableModal(keys: string[]) {
  return new Promise<Record<string, string> | null>((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(15, 23, 42, 0.35)";
    overlay.style.zIndex = "2147483647";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const card = document.createElement("div");
    card.style.width = "min(92vw, 420px)";
    card.style.background = "#fff";
    card.style.borderRadius = "14px";
    card.style.padding = "18px";
    card.style.boxShadow = "0 20px 48px rgba(15, 23, 42, 0.25)";
    card.style.fontFamily = 'Arial, "Microsoft YaHei", sans-serif';

    const form = document.createElement("form");
    form.style.display = "grid";
    form.style.gap = "12px";

    const title = document.createElement("h3");
    title.textContent = "填写模板变量";
    title.style.margin = "0";

    form.appendChild(title);

    const dynamicKeys = keys.filter((key) => !["date", "time", "signature"].includes(key));

    if (dynamicKeys.length === 0) {
      const text = document.createElement("p");
      text.textContent = "当前模板只包含内置变量，将直接按默认值填充。";
      text.style.margin = "0";
      text.style.color = "#64748b";
      form.appendChild(text);
    }

    for (const key of dynamicKeys) {
      const label = document.createElement("label");
      label.style.display = "grid";
      label.style.gap = "6px";
      label.textContent = key;

      const input = document.createElement("input");
      input.name = key;
      input.placeholder = `请输入 ${key}`;
      input.style.border = "1px solid #cbd5e1";
      input.style.borderRadius = "10px";
      input.style.padding = "10px 12px";
      input.style.font = '14px Arial, "Microsoft YaHei", sans-serif';
      label.appendChild(input);
      form.appendChild(label);
    }

    const actionRow = document.createElement("div");
    actionRow.style.display = "flex";
    actionRow.style.gap = "8px";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    cancel.style.flex = "1";
    cancel.style.border = "1px solid #cbd5e1";
    cancel.style.background = "#fff";
    cancel.style.borderRadius = "10px";
    cancel.style.padding = "10px 12px";
    cancel.style.cursor = "pointer";

    const confirm = document.createElement("button");
    confirm.type = "submit";
    confirm.textContent = "确认插入";
    confirm.style.flex = "1";
    confirm.style.border = "1px solid #2563eb";
    confirm.style.background = "#2563eb";
    confirm.style.color = "#fff";
    confirm.style.borderRadius = "10px";
    confirm.style.padding = "10px 12px";
    confirm.style.cursor = "pointer";

    actionRow.append(cancel, confirm);
    form.appendChild(actionRow);
    card.appendChild(form);
    overlay.appendChild(card);
    document.documentElement.appendChild(overlay);

    const cleanup = (value: Record<string, string> | null) => {
      overlay.remove();
      resolve(value);
    };

    cancel.addEventListener("click", () => cleanup(null));
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) {
        cleanup(null);
      }
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const values: Record<string, string> = {};
      for (const key of keys) {
        values[key] = getBuiltinTemplateValue(key);
      }

      for (const input of form.querySelectorAll<HTMLInputElement>("input[name]")) {
        values[input.name] = input.value;
      }

      cleanup(values);
    });

    form.querySelector<HTMLInputElement>("input[name]")?.focus();
  });
}

async function resolveSnippetContent(content: string) {
  const keys = findTemplateKeys(content);
  if (keys.length === 0) {
    return content;
  }

  const values = await openVariableModal(keys);
  if (!values) {
    return null;
  }

  return renderTemplate(content, values);
}

function applyTextHotSeparator(content: string) {
  const separator = settings?.textHotSeparator?.trim();
  if (!separator) {
    return content;
  }
  return content
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

function createInputEvent() {
  return new InputEvent("input", {
    bubbles: true,
    cancelable: true,
    inputType: "insertReplacementText"
  });
}

function dispatchInputLikeEvents(element: EditableElement) {
  element.dispatchEvent(createInputEvent());
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function replaceTextInput(element: HTMLInputElement | HTMLTextAreaElement, matchText: string, replacement: string) {
  const start = (element.selectionStart ?? 0) - matchText.length;
  const end = element.selectionStart ?? 0;
  const nextValue = `${element.value.slice(0, start)}${replacement}${element.value.slice(end)}`;
  const setter = Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")?.set;

  setter?.call(element, nextValue);
  const caret = start + replacement.length;
  element.setSelectionRange(caret, caret);
  dispatchInputLikeEvents(element);
}

function getTextNodes(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }
  return nodes;
}

function findTextPosition(root: HTMLElement, offset: number) {
  const textNodes = getTextNodes(root);
  let cursor = 0;

  for (const node of textNodes) {
    const next = cursor + node.data.length;
    if (offset <= next) {
      return { node, offset: offset - cursor };
    }
    cursor = next;
  }

  const lastNode = textNodes[textNodes.length - 1];
  if (!lastNode) {
    return null;
  }

  return { node: lastNode, offset: lastNode.data.length };
}

function replaceContentEditable(element: HTMLElement, matchText: string, replacement: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const textBeforeCaret = getTextBeforeCaret(element);
  const endIndex = textBeforeCaret.length;
  const startIndex = endIndex - matchText.length;

  const start = findTextPosition(element, startIndex);
  const end = findTextPosition(element, endIndex);

  if (!start || !end) {
    return false;
  }

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  range.deleteContents();
  range.insertNode(document.createTextNode(replacement));
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  dispatchInputLikeEvents(element);
  return true;
}

function dataUrlToBlob(dataUrl: string) {
  const [meta, data] = dataUrl.split(",");
  const mimeMatch = /^data:([^;]+);base64$/i.exec(meta);
  if (!mimeMatch || !data) {
    throw new Error("Invalid image data URL");
  }
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeMatch[1] });
}

async function pasteImageToPage(snippet: Snippet) {
  if (!snippet.imageDataUrl) {
    return false;
  }
  const blob = dataUrlToBlob(snippet.imageDataUrl);
  const item = new ClipboardItem({ [blob.type]: blob });
  await navigator.clipboard.write([item]);
  const pasteEvent = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: new DataTransfer()
  });
  pasteEvent.clipboardData?.items.add(new File([blob], snippet.imageName || "snippet-image.png", { type: blob.type }));
  activeEditable?.dispatchEvent(pasteEvent);
  return document.execCommand("paste");
}

function scheduleAutoSendImageScan() {
  if (autoSendScanTimer !== null) {
    window.clearTimeout(autoSendScanTimer);
  }
  autoSendScanTimer = window.setTimeout(() => {
    autoSendScanTimer = null;
    tryAutoClickImageSend();
  }, 120);
}

function isVisible(element: Element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function tryAutoClickImageSend() {
  if (!settings?.enableExtension || !settings.autoSendImageConfirm) {
    return;
  }
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>("[role='dialog'], .ant-modal, .ant-modal-root .ant-modal"));
  for (const dialog of dialogs) {
    if (!isVisible(dialog) || dialog.dataset.tbImageAutoSent === "1") {
      continue;
    }
    const text = (dialog.innerText || "").replace(/\s+/g, "");
    const hasImageHint = dialog.querySelector("img") || /图片|发送图片|预览/.test(text);
    if (!hasImageHint) {
      continue;
    }
    const button = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => {
      const buttonText = (candidate.innerText || "").replace(/\s+/g, "");
      return isVisible(candidate) && !candidate.disabled && /^(发送|确定|确认)$/.test(buttonText);
    });
    if (!button) {
      continue;
    }
    dialog.dataset.tbImageAutoSent = "1";
    button.click();
    return;
  }
}

function setupAutoSendImageObserver() {
  if (autoSendObserver) {
    return;
  }
  autoSendObserver = new MutationObserver(() => {
    if (settings?.autoSendImageConfirm) {
      scheduleAutoSendImageScan();
    }
  });
  autoSendObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

async function applySnippet(element: EditableElement, snippet: Snippet) {
  if (!settings) {
    return;
  }

  const textBeforeCaret = getTextBeforeCaret(element);
  if (snippet.type === "image") {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      replaceTextInput(element, textBeforeCaret.slice(-snippet.shortcut.length), "");
    } else {
      replaceContentEditable(element, textBeforeCaret.slice(-snippet.shortcut.length), "");
    }
    const pasted = await pasteImageToPage(snippet).catch(() => false);
    if (pasted && snippet.autoSendAfterInsert) {
      scheduleAutoSendImageScan();
    }
    void trackSnippetUsage(snippet.id);
    return;
  }

  const resolved = await resolveSnippetContent(snippet.content);
  const replacement = resolved === null ? null : applyTextHotSeparator(resolved);
  if (replacement === null) {
    return;
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    replaceTextInput(element, textBeforeCaret.slice(-snippet.shortcut.length), replacement);
  } else {
    replaceContentEditable(element, textBeforeCaret.slice(-snippet.shortcut.length), replacement);
  }

  void trackSnippetUsage(snippet.id);
}

async function tryAutoExpand(element: EditableElement) {
  if (!settings || isComposing || isApplyingSnippet) {
    return;
  }
  if (settings.completionMode !== "auto") {
    return;
  }
  if (!isSiteEnabled()) {
    hidePanel();
    return;
  }

  const exactMatches = getExactMatches(getTextBeforeCaret(element));
  if (exactMatches.length === 0) {
    return;
  }

  isApplyingSnippet = true;
  try {
    await applySnippet(element, exactMatches[0]);
    hidePanel();
  } finally {
    isApplyingSnippet = false;
  }
}

function updateSuggestions(element: EditableElement) {
  if (!settings || !settings.enableSuggestionPanel) {
    hidePanel();
    return;
  }
  if (!isSiteEnabled()) {
    hidePanel();
    return;
  }

  const query = getCurrentQuery(getTextBeforeCaret(element));
  if (!query) {
    hidePanel();
    return;
  }

  const items = getMatchingSuggestions(query);
  if (items.length === 0) {
    hidePanel();
    return;
  }

  suggestionState = {
    query,
    items,
    selectedIndex: 0
  };
  renderPanel();
}

async function reloadState() {
  await ensureBootstrapData();
  [snippets, settings] = await Promise.all([getSnippets(), getSettings()]);
}

document.documentElement.appendChild(panel);

document.addEventListener("focusin", (event) => {
  if (!isEditableTarget(event.target)) {
    activeEditable = null;
    hidePanel();
    return;
  }

  activeEditable = event.target;
  updateSuggestions(activeEditable);
});

document.addEventListener("click", (event) => {
  if (event.target instanceof Node && panel.contains(event.target)) {
    return;
  }

  if (activeEditable) {
    updateSuggestions(activeEditable);
  } else {
    hidePanel();
  }
});

document.addEventListener("compositionstart", () => {
  isComposing = true;
});

document.addEventListener("compositionend", (event) => {
  isComposing = false;
  if (!isEditableTarget(event.target)) {
    return;
  }
  activeEditable = event.target;
  updateSuggestions(event.target);
  void tryAutoExpand(event.target);
});

document.addEventListener("input", async (event) => {
  if (!isEditableTarget(event.target)) {
    return;
  }

  if (event.target !== activeEditable) {
    activeEditable = event.target;
  }

  updateSuggestions(event.target);
  if ((event as InputEvent).isComposing || isComposing) {
    return;
  }
  await tryAutoExpand(event.target);
});

document.addEventListener("keydown", async (event) => {
  if (!activeEditable || !settings) {
    return;
  }

  if (event.isComposing || isComposing || event.keyCode === 229) {
    return;
  }

  if (suggestionState) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      suggestionState.selectedIndex = (suggestionState.selectedIndex + 1) % suggestionState.items.length;
      renderPanel();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      suggestionState.selectedIndex =
        (suggestionState.selectedIndex - 1 + suggestionState.items.length) % suggestionState.items.length;
      renderPanel();
      return;
    }

    if (event.key === "Escape") {
      hidePanel();
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      const selected = suggestionState.items[suggestionState.selectedIndex];
      if (selected) {
        if (canConfirmSuggestionByKey(activeEditable, selected)) {
          event.preventDefault();
          await applySnippet(activeEditable, selected);
          hidePanel();
          return;
        }
      }
    }
  }

  if (matchesTriggerKey(event, settings.triggerKey)) {
    const exactMatches = getExactMatches(getTextBeforeCaret(activeEditable));
    if (exactMatches.length > 0) {
      event.preventDefault();
      await applySnippet(activeEditable, exactMatches[0]);
      hidePanel();
    }
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "SNIPPETS_UPDATED" || message?.type === "SETTINGS_UPDATED") {
    void reloadState().then(() => {
      if (activeEditable) {
        updateSuggestions(activeEditable);
      }
    });
  }
});

void reloadState();
setupAutoSendImageObserver();
