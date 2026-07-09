const STORAGE_KEYS = window.NihaoStorage.STORAGE_KEYS;
const settingsLib = window.NihaoSettings;
const storageLib = window.NihaoStorage;
const panelLib = window.NihaoPanel;
const miniMax = window.NihaoMiniMax;
const Z_INDEX_TOP = 2147483647;
const MAX_SUGGESTIONS = 8;
const MONKEY_IMAGE_URL = chrome.runtime.getURL("assets/snow-king-mascot.png");
const CRM_MONKEY_SEARCH_URL = "https://crm.tenclass.com/user/search";
const MONKEY_REMARK_SEARCH_TASK_KEY = "tb-monkey-remark-search";
const MONKEY_REMARK_QUERY_KEY = "tb_monkey_remark";
const MONKEY_REMARK_FIELD_DETECT_TIMEOUT = 10000;
const DEFAULT_CHANGE_ESSAY_TEMPLATE = "【异动处理】\n学员：{{名字}}\n课程：{{课程}}\n金额：{{金额}}\n\n您好，已收到您关于课程异动的申请，当前为您登记的信息如下：\n1. 学员姓名：{{名字}}\n2. 涉及课程：{{课程}}\n3. 涉及金额：{{金额}}\n\n我们会尽快为您核对并推进处理，如有进一步结果会第一时间同步给您。";

const BUILTIN_VARIABLES = new Set(["date", "time", "signature"]);

let snippets = [];
let settings = {
  enabled: true,
  activated: false,
  monkeyEyeEnabled: false,
  autoSendImageConfirm: false,
  imageAutoSendStrategy: "click",
  aiReplySuggestEnabled: false,
  aiApiFormat: "openai",
  aiApiHostPreset: "minimax-cn",
  aiApiBaseUrl: "https://api.minimaxi.com/v1",
  aiApiKey: "",
  aiModel: "MiniMax-M2.7",
  aiTriggerWord: "ai",
  aiSuggestCount: 3,
  aiArgumentSeparator: "*",
  aiSystemPrompt: "你是资深客服助手，请基于上下文生成简洁、礼貌、可直接发送的回复建议。",
  changeEssayTemplate: DEFAULT_CHANGE_ESSAY_TEMPLATE,
  aiReplyBranches: [],
  aiExtensionRules: [
    {
      id: "ext-default-ai",
      title: "默认润色",
      keyword: "ai",
      prompt: "你是资深客服助手，请对用户提供的话术进行润色，要求礼貌、自然、简洁、可直接发送，不要改变原意。"
    }
  ],
  triggerPrefixes: ["/", "、"],
  completionMode: "manual",
  matchMode: "prefix",
  insertEffectScope: "both",
  snippetEffectStyle: "cyber-flame",
  snippetEffectIntensity: 100,
  snippetEffectSize: 100,
  snippetEffectSpread: 100,
  snippetEffectDuration: 100,
  aiEffectStyle: "magic-circle",
  aiEffectIntensity: 100,
  aiEffectSize: 100,
  aiEffectSpread: 100,
  aiEffectDuration: 100,
  suggestionWidth: 360,
  suggestionHeight: 280,
  suggestionFontSize: 13,
  suggestionRemoveHue: false,
  suggestionOpacity: 96,
  suggestionSnippetDisplayMode: "content",
  suggestionSnippetPreviewLength: 10,
  suggestionOffsetX: 0,
  suggestionOffsetY: 10,
  suggestionExpandDirection: "prefer-up",
  snippetEffectPrimaryColor: "#8b5cf6",
  snippetEffectAccentColor: "#60a5fa",
  aiEffectPrimaryColor: "#22d3ee",
  aiEffectAccentColor: "#a78bfa",
  defaultSignature: "",
  blacklistSites: [],
  quickClickRules: []
};

const uiState = {
  host: null,
  panel: null,
  list: null,
  visible: false,
  activeIndex: 0,
  suggestions: [],
  context: null,
  aiRequestSeq: 0
};
const monkeyMemoState = {
  host: null,
  shadow: null,
  visible: false,
  items: [],
  position: { x: 32, y: 120 },
  dragPointerId: null,
  dragOffsetX: 0,
  dragOffsetY: 0
};
const changeHelperState = {
  host: null,
  shadow: null,
  visible: false,
  position: { x: 380, y: 120 },
  dragPointerId: null,
  dragOffsetX: 0,
  dragOffsetY: 0
};
const monkeyImageState = {
  host: null,
  visible: false
};
const insertionFxState = {
  host: null
};
const quickClickPickState = {
  active: false,
  mode: "selector",
  overlay: null,
  hint: null,
  current: null
};
let autoSendObserver = null;
let autoSendScanTimer = null;
let autoSendImageHandledAt = 0;
let autoSendImageEnterState = null;
let monkeyEyeObserver = null;
let monkeyEyeScanTimer = null;
let monkeyRemarkSearchTimer = null;
let monkeyRemarkDebugToastTimer = null;
let monkeyRemarkPageObserver = null;
let monkeyRemarkFieldDetectStartedAt = 0;
let monkeyRemarkWorkflowRunning = false;
const chatCaptureState = {
  observer: null,
  newMessages: []
};

void init();

async function init() {
  await loadInitialData();
  setupStorageSync();
  setupGlobalEvents();
  setupAutoSendImageObserver();
  setupMonkeyEyeObserver();
  setupAiReplyCaptureObserver();
  scheduleAutoSendImageScan();
  scheduleMonkeyEyeScan();
  setupMonkeyRemarkAutomationHooks();
  void maybeResumeMonkeyRemarkSearch();
}

async function loadInitialData() {
  const data = await storageLib.loadInitialData(normalizeSettings, normalizeSnippets);
  settings = data.settings;
  snippets = data.snippets;
}

function setupStorageSync() {
  storageLib.watchChanges((changes) => {
    if (changes[STORAGE_KEYS.SNIPPETS]) {
      snippets = normalizeSnippets(changes[STORAGE_KEYS.SNIPPETS].newValue || [], settings.triggerPrefixes);
    }
    if (changes[STORAGE_KEYS.SETTINGS]) {
      settings = normalizeSettings(changes[STORAGE_KEYS.SETTINGS].newValue || {});
      snippets = normalizeSnippets(snippets, settings.triggerPrefixes);
      applyPanelStyles();
      scheduleAutoSendImageScan();
      syncMonkeyEyeButtons();
    }
    if (changes[MONKEY_REMARK_SEARCH_TASK_KEY]) {
      if (!changes[MONKEY_REMARK_SEARCH_TASK_KEY].newValue) {
        monkeyRemarkFieldDetectStartedAt = 0;
      }
      void onMonkeyRemarkPageProgress();
    }
  });
}

function setupGlobalEvents() {
  document.addEventListener("input", debounce(handleInputEvent, 80), true);
  document.addEventListener("keydown", handleKeydownEvent, true);
  window.addEventListener("scroll", () => {
    if (uiState.visible && uiState.context) {
      positionPanel(uiState.context.target);
    }
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "tb-ai-validate-div") {
      const data = collectConversationFromPage();
      const preview = data.messages.slice(-2).map((m) => `${m.role}:${m.text}`).join(" | ").slice(0, 120);
      sendResponse({
        ok: true,
        total: data.messages.length,
        studentCount: data.studentCount,
        teacherCount: data.teacherCount,
        preview
      });
      return;
    }
    if (window.top !== window) return;
    if (message.type === "tb-toggle-monkey-memo") {
      void (async () => {
        await toggleMonkeyMemo();
        sendResponse({ ok: true });
      })();
      return true;
    }
    if (message.type === "tb-toggle-change-helper") {
      void (async () => {
        await toggleChangeHelper();
        sendResponse({ ok: true });
      })();
      return true;
    }
    if (message.type === "tb-sync-monkey-eye") {
      syncMonkeyEyeButtons();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "tb-show-monkey-image") {
      showMonkeyImageOverlay();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "tb-start-quick-click-pick") {
      startQuickClickPick(message.mode === "coordinate" ? "coordinate" : "selector");
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "tb-test-quick-click") {
      const result = executeQuickClickRule(message.rule);
      sendResponse(result);
      return;
    }
  });
}

function setupMonkeyEyeObserver() {
  if (window.top !== window || monkeyEyeObserver) return;
  monkeyEyeObserver = new MutationObserver(() => {
    if (!settings.monkeyEyeEnabled || settings.activated === false) return;
    scheduleMonkeyEyeScan();
  });
  monkeyEyeObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function scheduleMonkeyEyeScan() {
  if (window.top !== window) return;
  if (monkeyEyeScanTimer) {
    clearTimeout(monkeyEyeScanTimer);
  }
  monkeyEyeScanTimer = setTimeout(() => {
    monkeyEyeScanTimer = null;
    syncMonkeyEyeButtons();
  }, 80);
}

function syncMonkeyEyeButtons() {
  if (window.top !== window) return;
  if (settings.activated === false || settings.monkeyEyeEnabled !== true) {
    removeMonkeyEyeButtons();
    return;
  }
  const targets = getMonkeyEyeTargets();
  targets.forEach((target) => ensureMonkeyEyeButton(target));
}

function getMonkeyEyeTargets() {
  const selectors = [
    "span.chat-title-text___Yr-ZI",
    "span[class*='chat-title-text']",
    ".chat-title-text",
    ".session-title span",
    ".conversation-title span"
  ];
  const nodes = new Set();
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      if (!(node instanceof HTMLSpanElement)) return;
      const text = (node.innerText || "").replace(/\s+/g, " ").trim();
      if (!text || !isVisible(node)) return;
      nodes.add(node);
    });
  });
  return [...nodes];
}

function ensureMonkeyEyeButton(target) {
  if (target.dataset.tbMonkeyEyeBound === "1") return;
  if (!target.parentElement) return;
  if (window.getComputedStyle(target.parentElement).display === "contents") return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.tbMonkeyEyeFor = "1";
  setMonkeyEyeButtonMode(button, "copy");
  button.style.marginLeft = "8px";
  button.style.padding = "3px 8px";
  button.style.borderRadius = "999px";
  button.style.fontSize = "12px";
  button.style.cursor = "pointer";
  button.style.verticalAlign = "middle";
  button.style.boxShadow = "0 6px 14px rgba(76, 29, 149, 0.12)";
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const text = (target.innerText || "").replace(/\s+/g, " ").trim();
    if (!text) {
      showMonkeyToast("复制失败：未识别到猴名", true);
      return;
    }
    if (button.dataset.tbMonkeyEyeMode === "search") {
      const remark = String(button.dataset.tbMonkeyRemark || text).trim();
      await launchMonkeyRemarkSearch(remark, button);
      return;
    }
    const ok = await copyToClipboard(text);
    if (!ok) {
      showMonkeyToast("复制失败，请检查页面权限", true);
      return;
    }
    void trackFeatureUsage("monkey-copy");
    button.dataset.tbMonkeyRemark = text;
    setMonkeyEyeButtonMode(button, "search");
    showMonkeyToast(`复制成功：${text}，再次点击可搜索备注`, false);
  });
  target.insertAdjacentElement("afterend", button);
  target.dataset.tbMonkeyEyeBound = "1";
}

function removeMonkeyEyeButtons() {
  document.querySelectorAll("button[data-tb-monkey-eye-for]").forEach((node) => node.remove());
  document.querySelectorAll("span[data-tb-monkey-eye-bound='1']").forEach((node) => {
    delete node.dataset.tbMonkeyEyeBound;
  });
}

function setMonkeyEyeButtonMode(button, mode) {
  if (!(button instanceof HTMLButtonElement)) return;
  const isSearch = mode === "search";
  button.dataset.tbMonkeyEyeMode = isSearch ? "search" : "copy";
  button.textContent = isSearch ? "搜索备注" : "复制备注";
  button.style.border = isSearch
    ? "1px solid rgba(34,197,94,.35)"
    : "1px solid rgba(168,85,247,.35)";
  button.style.background = isSearch
    ? "linear-gradient(135deg, rgba(34,197,94,.18), rgba(16,185,129,.12))"
    : "linear-gradient(135deg, rgba(124,58,237,.16), rgba(59,130,246,.1))";
  button.style.color = isSearch ? "#16a34a" : "#a855f7";
}

async function launchMonkeyRemarkSearch(remark, button) {
  const normalizedRemark = String(remark || "").replace(/\s+/g, " ").trim();
  if (!normalizedRemark) {
    showMonkeyToast("搜索失败：未识别到备注内容", true);
    return;
  }
  await chrome.storage.local.set({
    [MONKEY_REMARK_SEARCH_TASK_KEY]: {
      remark: normalizedRemark,
      createdAt: new Date().toISOString(),
      sourceUrl: window.location.href
    }
  });
  const crmUrl = new URL(CRM_MONKEY_SEARCH_URL);
  crmUrl.searchParams.set(MONKEY_REMARK_QUERY_KEY, normalizedRemark);
  const popup = window.open(crmUrl.toString(), "_blank");
  if (!popup) {
    await chrome.storage.local.remove(MONKEY_REMARK_SEARCH_TASK_KEY);
    showMonkeyToast("无法打开搜索页，请检查浏览器是否拦截新窗口", true);
    return;
  }
  void trackFeatureUsage("monkey-search");
  if (button instanceof HTMLButtonElement) {
    delete button.dataset.tbMonkeyRemark;
    setMonkeyEyeButtonMode(button, "copy");
  }
  showMonkeyToast(`已打开备注搜索页：${normalizedRemark}`, false);
}

async function maybeResumeMonkeyRemarkSearch() {
  if (window.top !== window || !isCrmMonkeySearchPage()) return;
  const remark = await getMonkeyRemarkTaskRemark();
  if (!remark) return;
  if (monkeyRemarkWorkflowRunning) return;
  if (!monkeyRemarkFieldDetectStartedAt) {
    monkeyRemarkFieldDetectStartedAt = Date.now();
  }
  monkeyRemarkWorkflowRunning = true;
  logMonkeyRemarkDebug("resume_task", {
    remark,
    href: window.location.href
  });
  showMonkeyToast(`已进入 CRM，准备搜索备注：${remark}`, false);
  try {
    await executeMonkeyRemarkSearchWorkflow(remark);
    await clearMonkeyRemarkTask();
    showMonkeyToast(`已搜索备注：${remark}`, false);
  } catch (error) {
    await clearMonkeyRemarkTask();
    const message = String(error?.message || "备注搜索执行失败，请稍后重试。");
    logMonkeyRemarkDebug("workflow_error", {
      message,
      structure: probeMonkeyRemarkSearchStructure()
    });
    showMonkeyToast(message, true);
  } finally {
    monkeyRemarkFieldDetectStartedAt = 0;
    monkeyRemarkWorkflowRunning = false;
  }
}

function isCrmMonkeySearchPage() {
  try {
    const url = new URL(window.location.href);
    const normalizedPath = url.pathname.replace(/\/+$/, "");
    return url.origin === "https://crm.tenclass.com" && normalizedPath === "/user/search";
  } catch (_error) {
    return false;
  }
}

function setupMonkeyRemarkAutomationHooks() {
  if (window.top !== window) return;
  window.addEventListener("load", onMonkeyRemarkPageProgress, true);
  window.addEventListener("pageshow", onMonkeyRemarkPageProgress, true);
  document.addEventListener("visibilitychange", onMonkeyRemarkPageProgress, true);
  if (!monkeyRemarkPageObserver && document.documentElement) {
    monkeyRemarkPageObserver = new MutationObserver(() => {
      void onMonkeyRemarkPageProgress();
    });
    monkeyRemarkPageObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "title", "value", "aria-expanded"]
    });
  }
}

async function onMonkeyRemarkPageProgress() {
  if (!isCrmMonkeySearchPage()) return;
  const remark = await getMonkeyRemarkTaskRemark();
  if (!remark) return;
  if (!monkeyRemarkFieldDetectStartedAt) {
    monkeyRemarkFieldDetectStartedAt = Date.now();
  }
  clearTimeout(monkeyRemarkSearchTimer);
  monkeyRemarkSearchTimer = setTimeout(() => {
    void maybeResumeMonkeyRemarkSearch();
  }, 180);
}

async function getMonkeyRemarkTaskRemark() {
  const queryRemark = getMonkeyRemarkFromQuery();
  if (queryRemark) return queryRemark;
  const data = await chrome.storage.local.get(MONKEY_REMARK_SEARCH_TASK_KEY);
  return String(data[MONKEY_REMARK_SEARCH_TASK_KEY]?.remark || "").trim();
}

function getMonkeyRemarkFromQuery() {
  try {
    const url = new URL(window.location.href);
    return String(url.searchParams.get(MONKEY_REMARK_QUERY_KEY) || "").trim();
  } catch (_error) {
    return "";
  }
}

function cleanupMonkeyRemarkQueryParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(MONKEY_REMARK_QUERY_KEY)) return;
    url.searchParams.delete(MONKEY_REMARK_QUERY_KEY);
    window.history.replaceState({}, "", url.toString());
  } catch (_error) {
    // ignore cleanup errors
  }
}

function hasMonkeyRemarkLoginPrompt() {
  if (/登录|扫码登录|企微扫码登录/.test((document.body?.innerText || "").replace(/\s+/g, ""))) {
    const modalCandidates = Array.from(document.querySelectorAll(".ant-modal, .ant-modal-root, [role='dialog'], .login-modal, .login-dialog"));
    if (modalCandidates.some((node) => node instanceof HTMLElement && isVisible(node))) {
      return true;
    }
  }
  const explicitCandidates = Array.from(document.querySelectorAll("div, section, aside"));
  return explicitCandidates.some((node) => {
    if (!(node instanceof HTMLElement) || !isVisible(node)) return false;
    const text = (node.innerText || "").replace(/\s+/g, "");
    return text.includes("企微扫码登录") || text.includes("扫码登录");
  });
}

function getMonkeyRemarkSearchControls() {
  const fieldLabel = Array.from(document.querySelectorAll("span.ant-select-selection-item[title], span.ant-select-selection-item, .ant-select-selection-item"))
    .find((node) => node instanceof HTMLElement && isVisible(node) && /^(用户ID|企微备注|企业微信备注)$/.test((node.getAttribute("title") || node.innerText || "").replace(/\s+/g, "")));
  const fieldSelectRoot = fieldLabel instanceof HTMLElement
    ? (fieldLabel.closest(".ant-select") || fieldLabel.parentElement?.closest?.(".ant-select") || null)
    : null;
  const fieldTrigger = fieldLabel instanceof HTMLElement
    ? (
      fieldLabel.closest(".ant-select-selector")
      || fieldLabel.parentElement?.querySelector?.(".ant-select-selector")
      || fieldLabel.closest(".ant-select")
      || fieldLabel
    )
    : null;
  const input = Array.from(document.querySelectorAll("input.ant-input[placeholder='请输入'], input.ant-input, input[placeholder='请输入'], input[type='text']"))
    .find((node) => node instanceof HTMLInputElement && isVisible(node));
  const searchButton = Array.from(document.querySelectorAll("button.ant-input-search-button, button.ant-btn.ant-btn-primary.ant-input-search-button, button.ant-btn-primary, button"))
    .find((node) => node instanceof HTMLButtonElement && isVisible(node) && (node.innerText || "").replace(/\s+/g, "") === "搜索");
  if (
    !(fieldLabel instanceof HTMLElement) ||
    !(fieldTrigger instanceof HTMLElement) ||
    !(input instanceof HTMLInputElement) ||
    !(searchButton instanceof HTMLButtonElement)
  ) {
    return null;
  }
  return {
    fieldLabel,
    fieldSelectRoot: fieldSelectRoot instanceof HTMLElement ? fieldSelectRoot : null,
    fieldTrigger,
    input,
    searchButton
  };
}

function getMonkeyRemarkFieldText(fieldLabel) {
  return (fieldLabel?.getAttribute?.("title") || fieldLabel?.innerText || "").replace(/\s+/g, "");
}

function getMonkeyRemarkOption(targetLabel) {
  const labels = targetLabel === "企微备注"
    ? ["企微备注", "企业微信备注"]
    : [targetLabel];
  const optionCandidates = Array.from(document.querySelectorAll(".ant-select-item-option, .ant-select-item-option-content, [title]"));
  const option = optionCandidates.find((node) => {
    if (!(node instanceof HTMLElement)) return false;
    const root = node.closest(".ant-select-item-option") || node;
    const text = (node.getAttribute("title") || node.innerText || root.innerText || "").replace(/\s+/g, "");
    return isVisible(root) && labels.includes(text);
  });
  if (!(option instanceof HTMLElement)) return null;
  const clickable = option.closest(".ant-select-item-option") || option;
  return clickable instanceof HTMLElement ? clickable : option;
}

function setNativeInputValue(input, value) {
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return false;
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")
    || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")
    || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
  const nextValue = String(value || "");
  if (descriptor && typeof descriptor.set === "function") {
    descriptor.set.call(input, nextValue);
  } else {
    input.value = nextValue;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
  return true;
}

function triggerNativeClick(element) {
  if (!(element instanceof HTMLElement)) return;
  element.scrollIntoView({ block: "center", inline: "center" });
  if (typeof element.focus === "function") {
    element.focus({ preventScroll: true });
  }
  const mouseEvents = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
  mouseEvents.forEach((type) => {
    element.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window
    }));
  });
  element.click();
}

function probeMonkeyRemarkSearchStructure() {
  const fieldCandidates = Array.from(document.querySelectorAll("span.ant-select-selection-item[title], span.ant-select-selection-item, .ant-select-selection-item"))
    .filter((node) => node instanceof HTMLElement && isVisible(node))
    .map((node) => (node.getAttribute("title") || node.innerText || "").replace(/\s+/g, ""))
    .filter(Boolean);
  const optionCandidates = Array.from(document.querySelectorAll(".ant-select-item-option, .ant-select-item-option-content, [title='企微备注'], [title='企业微信备注']"))
    .filter((node) => node instanceof HTMLElement && isVisible(node))
    .map((node) => (node.getAttribute("title") || node.innerText || "").replace(/\s+/g, ""))
    .filter(Boolean);
  const inputCount = Array.from(document.querySelectorAll("input.ant-input, input[placeholder='请输入'], input[type='text']"))
    .filter((node) => node instanceof HTMLInputElement && isVisible(node)).length;
  const buttonTexts = Array.from(document.querySelectorAll("button"))
    .filter((node) => node instanceof HTMLButtonElement && isVisible(node))
    .map((node) => (node.innerText || "").replace(/\s+/g, ""))
    .filter(Boolean)
    .slice(0, 8);
  return {
    fieldCandidates: fieldCandidates.slice(0, 6),
    optionCandidates: optionCandidates.slice(0, 8),
    inputCount,
    buttonTexts
  };
}

function logMonkeyRemarkDebug(stage, payload) {
  const info = { stage, ...(payload || {}) };
  try {
    window.__tbMonkeyRemarkDebug = info;
    console.info("[tb-monkey-remark]", info);
  } catch (_error) {
    // ignore logging errors
  }
  clearTimeout(monkeyRemarkDebugToastTimer);
  if (stage === "controls_missing" || stage === "field_pending") {
    const shortText = stage === "controls_missing"
      ? "正在侦测 CRM 页面结构..."
      : "已打开筛选，正在定位“企微备注”...";
    showMonkeyToast(shortText, false);
    monkeyRemarkDebugToastTimer = setTimeout(() => {
      monkeyRemarkDebugToastTimer = null;
    }, 300);
  }
}

async function executeMonkeyRemarkSearchWorkflow(remark) {
  if (hasMonkeyRemarkLoginPrompt()) {
    throw new Error("请先登录 CRM，再使用搜索备注功能。");
  }

  const userIdControls = await waitForMonkeyRemarkCondition(() => {
    if (hasMonkeyRemarkLoginPrompt()) {
      throw new Error("请先登录 CRM，再使用搜索备注功能。");
    }
    const controls = getMonkeyRemarkSearchControls();
    if (!controls) return null;
    return getMonkeyRemarkFieldText(controls.fieldLabel) === "用户ID" ? controls : null;
  }, {
    timeoutMs: MONKEY_REMARK_FIELD_DETECT_TIMEOUT,
    intervalMs: 300,
    stage: "wait_user_id",
    pendingMessage: "正在等待 CRM 出现“用户ID”字段...",
    timeoutMessage: "10秒内未识别到“用户ID”字段，已停止备注搜索。"
  });

  const remarkControls = await ensureMonkeyRemarkSearchField(userIdControls, "企微备注");
  const filledControls = await fillMonkeyRemarkInput(remarkControls, remark);

  logMonkeyRemarkDebug("search_click", {
    remark,
    field: getMonkeyRemarkFieldText(filledControls.fieldLabel)
  });
  triggerNativeClick(filledControls.searchButton);
}

async function ensureMonkeyRemarkSearchField(controls, targetLabel) {
  const currentText = getMonkeyRemarkFieldText(controls.fieldLabel);
  if (targetLabel === "企微备注" && (currentText === "企微备注" || currentText === "企业微信备注")) {
    return controls;
  }
  if (currentText === targetLabel) {
    return controls;
  }

  logMonkeyRemarkDebug("open_field_selector", {
    currentField: currentText,
    targetField: targetLabel
  });
  showMonkeyToast(`正在切换搜索字段到“${targetLabel}”...`, false);
  triggerNativeClick(controls.fieldTrigger);

  const option = await waitForMonkeyRemarkCondition(() => getMonkeyRemarkOption(targetLabel), {
    timeoutMs: 4000,
    intervalMs: 200,
    stage: "wait_field_option",
    pendingMessage: `正在定位“${targetLabel}”选项...`,
    timeoutMessage: `未找到“${targetLabel}”选项，请确认 CRM 页面结构是否变化。`
  });

  triggerNativeClick(option);

  return waitForMonkeyRemarkCondition(() => {
    const refreshed = getMonkeyRemarkSearchControls();
    if (!refreshed) return null;
    const text = getMonkeyRemarkFieldText(refreshed.fieldLabel);
    if (targetLabel === "企微备注") {
      return text === "企微备注" || text === "企业微信备注" ? refreshed : null;
    }
    return text === targetLabel ? refreshed : null;
  }, {
    timeoutMs: 3000,
    intervalMs: 200,
    stage: "confirm_field_switch",
    pendingMessage: `正在确认已切换到“${targetLabel}”...`,
    timeoutMessage: `字段未成功切换到“${targetLabel}”。`
  });
}

async function fillMonkeyRemarkInput(controls, remark) {
  logMonkeyRemarkDebug("fill_input", {
    remarkLength: remark.length
  });
  if (!setNativeInputValue(controls.input, remark)) {
    throw new Error("备注输入失败，请确认搜索输入框可用。");
  }
  return waitForMonkeyRemarkCondition(() => {
    const refreshed = getMonkeyRemarkSearchControls();
    if (!refreshed) return null;
    return (refreshed.input.value || "").trim() === remark ? refreshed : null;
  }, {
    timeoutMs: 2000,
    intervalMs: 120,
    stage: "confirm_input",
    pendingMessage: "正在写入备注内容...",
    timeoutMessage: "备注输入未生效，请确认输入框可编辑。"
  });
}

async function waitForMonkeyRemarkCondition(checker, options = {}) {
  const timeoutMs = Math.max(300, Number(options.timeoutMs || 3000));
  const intervalMs = Math.max(80, Number(options.intervalMs || 200));
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() <= deadline) {
    try {
      const result = await checker();
      if (result) return result;
      lastError = null;
    } catch (error) {
      lastError = error;
      break;
    }
    if (options.stage) {
      logMonkeyRemarkDebug(options.stage, probeMonkeyRemarkSearchStructure());
    }
    if (options.pendingMessage) {
      showMonkeyToast(options.pendingMessage, false);
    }
    await waitMonkeyRemarkDelay(intervalMs);
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error(String(options.timeoutMessage || "备注搜索步骤执行超时。"));
}

function waitMonkeyRemarkDelay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function clearMonkeyRemarkTask() {
  await chrome.storage.local.remove(MONKEY_REMARK_SEARCH_TASK_KEY);
  cleanupMonkeyRemarkQueryParam();
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_error) {
    try {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.focus();
      input.select();
      const ok = document.execCommand("copy");
      input.remove();
      return ok;
    } catch (_fallbackError) {
      return false;
    }
  }
}

function showMonkeyToast(message, isError) {
  let toast = document.getElementById("tb-monkey-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "tb-monkey-toast";
    toast.style.position = "fixed";
    toast.style.left = "50%";
    toast.style.bottom = "36px";
    toast.style.transform = "translateX(-50%)";
    toast.style.zIndex = String(Z_INDEX_TOP);
    toast.style.padding = "10px 14px";
    toast.style.borderRadius = "999px";
    toast.style.font = "13px/1.2 -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif";
    toast.style.boxShadow = "0 12px 36px rgba(0,0,0,.24)";
    document.documentElement.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.background = isError
    ? "rgba(127, 29, 29, 0.92)"
    : "linear-gradient(135deg, rgba(109,40,217,.94), rgba(59,130,246,.92))";
  toast.style.color = "#fff";
  toast.style.display = "block";
  clearTimeout(showMonkeyToast.timer);
  showMonkeyToast.timer = setTimeout(() => {
    toast.style.display = "none";
  }, 1600);
}
showMonkeyToast.timer = null;

async function toggleMonkeyMemo() {
  await ensureMonkeyMemoLoaded();
  ensureMonkeyMemoUI();
  monkeyMemoState.visible = !monkeyMemoState.visible;
  monkeyMemoState.host.style.display = monkeyMemoState.visible ? "block" : "none";
  if (monkeyMemoState.visible) {
    renderMonkeyMemo();
  }
}

async function toggleChangeHelper() {
  await ensureChangeHelperLoaded();
  ensureChangeHelperUI();
  changeHelperState.visible = !changeHelperState.visible;
  changeHelperState.host.style.display = changeHelperState.visible ? "block" : "none";
  if (changeHelperState.visible) {
    renderChangeHelper("请填写名字、课程、金额，点击“小作文”自动复制。");
  }
}

async function ensureChangeHelperLoaded() {
  if (changeHelperState.host) return;
  const data = await chrome.storage.local.get(STORAGE_KEYS.CHANGE_HELPER_POSITION);
  const pos = data[STORAGE_KEYS.CHANGE_HELPER_POSITION];
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    changeHelperState.position = {
      x: Math.max(12, Number(pos.x)),
      y: Math.max(12, Number(pos.y))
    };
  }
}

function ensureChangeHelperUI() {
  if (changeHelperState.host) return;
  const host = document.createElement("div");
  host.id = "tb-change-helper-host";
  host.style.position = "fixed";
  host.style.left = `${changeHelperState.position.x}px`;
  host.style.top = `${changeHelperState.position.y}px`;
  host.style.zIndex = String(Z_INDEX_TOP);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    .panel {
      width: 360px;
      color: #f5edff;
      border: 1px solid rgba(192,132,252,.36);
      border-radius: 18px;
      background:
        radial-gradient(circle at top left, rgba(168,85,247,.24), transparent 42%),
        linear-gradient(180deg, rgba(16,12,29,.96), rgba(4,4,10,.98));
      box-shadow: 0 30px 70px rgba(8,8,20,.55), inset 0 1px 0 rgba(255,255,255,.08);
      backdrop-filter: blur(18px);
      overflow: hidden;
      font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      background: linear-gradient(90deg, rgba(109,40,217,.22), rgba(15,23,42,.08));
      cursor: move;
      user-select: none;
    }
    .title {
      font-weight: 800;
      letter-spacing: .06em;
      text-transform: uppercase;
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    .close, .action {
      border: 1px solid rgba(216,180,254,.24);
      background: rgba(255,255,255,.06);
      color: #f5edff;
      border-radius: 12px;
      padding: 8px 12px;
      cursor: pointer;
      font: inherit;
    }
    .close { padding: 6px 10px; }
    .body { padding: 14px 16px 16px; }
    .tip { color: #c4b5fd; font-size: 12px; margin-bottom: 12px; }
    .status { min-height: 18px; margin: 10px 0 12px; color: #f0abfc; font-size: 12px; }
    .form {
      display: grid;
      gap: 10px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
      color: #e9d5ff;
    }
    input, textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid rgba(216,180,254,.24);
      border-radius: 12px;
      background: rgba(255,255,255,.04);
      color: #fff;
      padding: 10px 12px;
      outline: none;
      font: inherit;
    }
    textarea {
      min-height: 120px;
      resize: vertical;
      line-height: 1.55;
    }
    input:focus, textarea:focus {
      border-color: #c084fc;
      box-shadow: 0 0 0 2px rgba(192,132,252,.18);
    }
    .toolbar {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 12px;
    }
    .preview {
      margin-top: 12px;
      max-height: 200px;
      overflow: auto;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.03);
      color: #e2e8f0;
      white-space: pre-wrap;
      line-height: 1.6;
      font-size: 12px;
    }
    .variables {
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px dashed rgba(216,180,254,.2);
      color: #cbd5e1;
      font-size: 12px;
      line-height: 1.6;
    }
    code {
      color: #f5d0fe;
    }
  `;
  const wrapper = document.createElement("div");
  wrapper.className = "panel";
  wrapper.innerHTML = `
    <div class="header" data-role="drag">
      <div class="title">异动处理</div>
      <div class="actions">
        <button type="button" class="action" id="tb-change-capture">获取名字</button>
        <button type="button" class="close" id="tb-change-close">关闭</button>
      </div>
    </div>
    <div class="body">
      <div class="tip">悬浮窗与猴目备忘录一致，可拖拽；支持变量模板自动替换与复制。</div>
      <div class="status" id="tb-change-status"></div>
      <div class="form">
        <label>名字<input id="tb-change-name" type="text" placeholder="请输入名字"></label>
        <label>课程<input id="tb-change-course" type="text" placeholder="请输入课程"></label>
        <label>金额<input id="tb-change-amount" type="text" placeholder="请输入金额"></label>
      </div>
      <div class="toolbar">
        <button type="button" class="action" id="tb-change-compose">小作文</button>
        <button type="button" class="action" id="tb-change-copy-preview">复制预览</button>
      </div>
      <div class="variables">可用变量：<code>{{名字}}</code> <code>{{课程}}</code> <code>{{金额}}</code>，也兼容 <code>{{name}}</code> <code>{{course}}</code> <code>{{amount}}</code>。</div>
      <textarea id="tb-change-preview" class="preview" placeholder="这里会显示生成后的异动处理文本。"></textarea>
    </div>
  `;
  shadow.appendChild(style);
  shadow.appendChild(wrapper);
  document.documentElement.appendChild(host);
  changeHelperState.host = host;
  changeHelperState.shadow = shadow;

  const header = shadow.querySelector("[data-role='drag']");
  const btnCapture = shadow.getElementById("tb-change-capture");
  const btnClose = shadow.getElementById("tb-change-close");
  const btnCompose = shadow.getElementById("tb-change-compose");
  const btnCopyPreview = shadow.getElementById("tb-change-copy-preview");
  header.addEventListener("pointerdown", startChangeHelperDrag);
  btnCapture.addEventListener("click", () => {
    fillChangeHelperName();
  });
  btnClose.addEventListener("click", () => {
    changeHelperState.visible = false;
    host.style.display = "none";
  });
  btnCompose.addEventListener("click", () => {
    void composeChangeHelperEssay();
  });
  btnCopyPreview.addEventListener("click", () => {
    void copyChangeHelperPreview();
  });
}

function renderChangeHelper(statusText = "") {
  if (!changeHelperState.shadow) return;
  const status = changeHelperState.shadow.getElementById("tb-change-status");
  const nameInput = changeHelperState.shadow.getElementById("tb-change-name");
  if (status) status.textContent = statusText;
  if (nameInput instanceof HTMLInputElement && !nameInput.value.trim()) {
    nameInput.value = resolveMonkeyNameFromPage();
  }
  changeHelperState.host.style.left = `${changeHelperState.position.x}px`;
  changeHelperState.host.style.top = `${changeHelperState.position.y}px`;
}

function fillChangeHelperName() {
  if (!changeHelperState.shadow) return;
  const name = resolveMonkeyNameFromPage();
  const nameInput = changeHelperState.shadow.getElementById("tb-change-name");
  if (!(nameInput instanceof HTMLInputElement)) return;
  if (!name) {
    renderChangeHelper("未识别到名字，请手动输入。");
    return;
  }
  nameInput.value = name;
  renderChangeHelper(`已带入名字：${name}`);
}

async function composeChangeHelperEssay() {
  if (!changeHelperState.shadow) return;
  const nameInput = changeHelperState.shadow.getElementById("tb-change-name");
  const courseInput = changeHelperState.shadow.getElementById("tb-change-course");
  const amountInput = changeHelperState.shadow.getElementById("tb-change-amount");
  const preview = changeHelperState.shadow.getElementById("tb-change-preview");
  if (!(nameInput instanceof HTMLInputElement) || !(courseInput instanceof HTMLInputElement) || !(amountInput instanceof HTMLInputElement) || !(preview instanceof HTMLTextAreaElement)) {
    return;
  }
  const name = String(nameInput.value || "").trim();
  const course = String(courseInput.value || "").trim();
  const amount = String(amountInput.value || "").trim();
  if (!name || !course || !amount) {
    renderChangeHelper("请先完整填写名字、课程、金额。");
    return;
  }
  const template = String(settings.changeEssayTemplate || DEFAULT_CHANGE_ESSAY_TEMPLATE).trim();
  const content = buildChangeEssay(template, { name, course, amount });
  preview.value = content;
  const copied = await copyToClipboard(content);
  renderChangeHelper(copied ? "已生成并复制到剪贴板。" : "已生成文本，但复制失败，请手动复制。");
}

async function copyChangeHelperPreview() {
  if (!changeHelperState.shadow) return;
  const preview = changeHelperState.shadow.getElementById("tb-change-preview");
  if (!(preview instanceof HTMLTextAreaElement)) return;
  const text = String(preview.value || "").trim();
  if (!text) {
    renderChangeHelper("当前还没有可复制的文本，请先点击“小作文”。");
    return;
  }
  const copied = await copyToClipboard(text);
  renderChangeHelper(copied ? "已复制预览文本。" : "复制失败，请手动复制。");
}

function buildChangeEssay(template, fields) {
  return String(template || "")
    .replace(/\{\{\s*名字\s*\}\}/g, fields.name)
    .replace(/\{\{\s*name\s*\}\}/gi, fields.name)
    .replace(/\{\{\s*课程\s*\}\}/g, fields.course)
    .replace(/\{\{\s*course\s*\}\}/gi, fields.course)
    .replace(/\{\{\s*金额\s*\}\}/g, fields.amount)
    .replace(/\{\{\s*amount\s*\}\}/gi, fields.amount)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function startChangeHelperDrag(event) {
  if (!(event.target instanceof Element) || event.target.closest("button")) return;
  event.preventDefault();
  changeHelperState.dragPointerId = event.pointerId;
  changeHelperState.dragOffsetX = event.clientX - changeHelperState.position.x;
  changeHelperState.dragOffsetY = event.clientY - changeHelperState.position.y;
  window.addEventListener("pointermove", onChangeHelperDragMove, true);
  window.addEventListener("pointerup", endChangeHelperDrag, true);
}

function onChangeHelperDragMove(event) {
  if (changeHelperState.dragPointerId !== event.pointerId || !changeHelperState.host) return;
  const maxX = Math.max(12, window.innerWidth - 380);
  const maxY = Math.max(12, window.innerHeight - 160);
  changeHelperState.position = {
    x: Math.max(12, Math.min(maxX, event.clientX - changeHelperState.dragOffsetX)),
    y: Math.max(12, Math.min(maxY, event.clientY - changeHelperState.dragOffsetY))
  };
  changeHelperState.host.style.left = `${changeHelperState.position.x}px`;
  changeHelperState.host.style.top = `${changeHelperState.position.y}px`;
}

function endChangeHelperDrag(event) {
  if (changeHelperState.dragPointerId !== event.pointerId) return;
  changeHelperState.dragPointerId = null;
  window.removeEventListener("pointermove", onChangeHelperDragMove, true);
  window.removeEventListener("pointerup", endChangeHelperDrag, true);
  void chrome.storage.local.set({
    [STORAGE_KEYS.CHANGE_HELPER_POSITION]: changeHelperState.position
  });
}

async function ensureMonkeyMemoLoaded() {
  if (monkeyMemoState.items.length || monkeyMemoState.host) return;
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.MONKEY_MEMO_ITEMS,
    STORAGE_KEYS.MONKEY_MEMO_POSITION
  ]);
  monkeyMemoState.items = Array.isArray(data[STORAGE_KEYS.MONKEY_MEMO_ITEMS])
    ? data[STORAGE_KEYS.MONKEY_MEMO_ITEMS].map((item) => ({
      id: String(item.id || crypto.randomUUID()),
      name: String(item.name || "").trim(),
      done: item.done === true
    })).filter((item) => item.name)
    : [];
  const pos = data[STORAGE_KEYS.MONKEY_MEMO_POSITION];
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    monkeyMemoState.position = {
      x: Math.max(12, Number(pos.x)),
      y: Math.max(12, Number(pos.y))
    };
  }
}

function ensureMonkeyMemoUI() {
  if (monkeyMemoState.host) return;
  const host = document.createElement("div");
  host.id = "tb-monkey-memo-host";
  host.style.position = "fixed";
  host.style.left = `${monkeyMemoState.position.x}px`;
  host.style.top = `${monkeyMemoState.position.y}px`;
  host.style.zIndex = String(Z_INDEX_TOP);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    .memo {
      width: 320px;
      color: #f5edff;
      border: 1px solid rgba(192,132,252,.36);
      border-radius: 18px;
      background:
        radial-gradient(circle at top left, rgba(168,85,247,.26), transparent 42%),
        linear-gradient(180deg, rgba(16,12,29,.96), rgba(4,4,10,.98));
      box-shadow: 0 30px 70px rgba(8,8,20,.55), inset 0 1px 0 rgba(255,255,255,.08);
      backdrop-filter: blur(18px);
      overflow: hidden;
      font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    }
    .memo-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      background: linear-gradient(90deg, rgba(109,40,217,.22), rgba(15,23,42,.08));
      cursor: move;
      user-select: none;
    }
    .memo-title { font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .memo-close, .memo-action {
      border: 1px solid rgba(216,180,254,.24);
      background: rgba(255,255,255,.06);
      color: #f5edff;
      border-radius: 12px;
      padding: 8px 12px;
      cursor: pointer;
      font: inherit;
    }
    .memo-close { padding: 6px 10px; }
    .memo-body { padding: 14px 16px 16px; }
    .memo-tip { color: #c4b5fd; font-size: 12px; margin-bottom: 12px; }
    .memo-status { min-height: 18px; margin: 10px 0 12px; color: #f0abfc; font-size: 12px; }
    .memo-list { display: flex; flex-direction: column; gap: 8px; max-height: 260px; overflow: auto; }
    .memo-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.04);
      color: #f8fafc;
    }
    .memo-item-main {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      text-align: left;
      background: transparent;
      border: 0;
      color: inherit;
      padding: 0;
      font: inherit;
    }
    .memo-item-text {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .memo-item-delete {
      flex: 0 0 auto;
      border: 1px solid rgba(244,114,182,.24);
      background: rgba(244,114,182,.08);
      color: #fda4af;
      border-radius: 10px;
      padding: 6px 10px;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
    }
    .memo-item-copy {
      flex: 0 0 auto;
      border: 1px solid rgba(34,211,238,.24);
      background: rgba(34,211,238,.08);
      color: #a5f3fc;
      border-radius: 10px;
      padding: 6px 10px;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
    }
    .memo-item-copy:hover {
      background: rgba(34,211,238,.14);
      color: #ecfeff;
    }
    .memo-item-delete:hover {
      background: rgba(244,114,182,.14);
      color: #ffe4e6;
    }
    .memo-item.done {
      opacity: .68;
      text-decoration: line-through;
      background: rgba(34,197,94,.12);
      border-color: rgba(74,222,128,.2);
    }
    .memo-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: linear-gradient(180deg, #a855f7, #7c3aed);
      box-shadow: 0 0 18px rgba(168,85,247,.65);
      flex: 0 0 auto;
    }
    .memo-item.done .memo-dot {
      background: linear-gradient(180deg, #34d399, #22c55e);
      box-shadow: 0 0 18px rgba(34,197,94,.45);
    }
    .memo-empty {
      padding: 16px;
      border-radius: 12px;
      border: 1px dashed rgba(216,180,254,.25);
      color: #c4b5fd;
      text-align: center;
    }
    .memo-actions { display: flex; gap: 10px; }
  `;
  const wrapper = document.createElement("div");
  wrapper.className = "memo";
  wrapper.innerHTML = `
    <div class="memo-header" data-role="drag">
      <div class="memo-title">猴名备忘录</div>
      <div class="memo-actions">
        <button type="button" class="memo-action" id="tb-memo-capture">获取猴名</button>
        <button type="button" class="memo-close" id="tb-memo-close">关闭</button>
      </div>
    </div>
    <div class="memo-body">
      <div class="memo-tip">点击“获取猴名”后，会优先读取当前选中的名字，其次识别聊天标题中的 span 文本。</div>
      <div class="memo-status" id="tb-memo-status"></div>
      <div class="memo-list" id="tb-memo-list"></div>
    </div>
  `;
  shadow.appendChild(style);
  shadow.appendChild(wrapper);
  document.documentElement.appendChild(host);
  monkeyMemoState.host = host;
  monkeyMemoState.shadow = shadow;

  const header = shadow.querySelector("[data-role='drag']");
  const btnCapture = shadow.getElementById("tb-memo-capture");
  const btnClose = shadow.getElementById("tb-memo-close");
  header.addEventListener("pointerdown", startMonkeyMemoDrag);
  btnCapture.addEventListener("click", () => {
    void captureMonkeyNameIntoMemo();
  });
  btnClose.addEventListener("click", () => {
    monkeyMemoState.visible = false;
    host.style.display = "none";
  });
}

function renderMonkeyMemo(statusText = "") {
  if (!monkeyMemoState.shadow) return;
  const list = monkeyMemoState.shadow.getElementById("tb-memo-list");
  const status = monkeyMemoState.shadow.getElementById("tb-memo-status");
  if (status) {
    status.textContent = statusText;
  }
  if (!list) return;
  list.innerHTML = "";
  if (!monkeyMemoState.items.length) {
    const empty = document.createElement("div");
    empty.className = "memo-empty";
    empty.textContent = "还没有记录猴名，先点一次“获取猴名”。";
    list.appendChild(empty);
  } else {
    monkeyMemoState.items.forEach((item) => {
      const row = document.createElement("div");
      row.className = `memo-item${item.done ? " done" : ""}`;
      row.innerHTML = `
        <button type="button" class="memo-item-main">
          <span class="memo-dot"></span>
          <span class="memo-item-text">${escapeHtml(item.name)}</span>
        </button>
        <button type="button" class="memo-item-copy">复制</button>
        <button type="button" class="memo-item-delete">删除</button>
      `;
      const mainBtn = row.querySelector(".memo-item-main");
      const copyBtn = row.querySelector(".memo-item-copy");
      const deleteBtn = row.querySelector(".memo-item-delete");
      mainBtn?.addEventListener("click", () => {
        void toggleMonkeyMemoItem(item.id);
      });
      copyBtn?.addEventListener("click", () => {
        void copyMonkeyMemoItem(item.id);
      });
      deleteBtn?.addEventListener("click", () => {
        void deleteMonkeyMemoItem(item.id);
      });
      list.appendChild(row);
    });
  }
  monkeyMemoState.host.style.left = `${monkeyMemoState.position.x}px`;
  monkeyMemoState.host.style.top = `${monkeyMemoState.position.y}px`;
}

async function captureMonkeyNameIntoMemo() {
  const monkeyName = resolveMonkeyNameFromPage();
  if (!monkeyName) {
    renderMonkeyMemo("未识别到猴名，请先选中名字对应的 span 或切到聊天页标题。");
    return;
  }
  const existing = monkeyMemoState.items.find((item) => item.name === monkeyName);
  if (existing) {
    renderMonkeyMemo(`“${monkeyName}” 已在备忘录中。`);
    return;
  }
  monkeyMemoState.items.unshift({
    id: crypto.randomUUID(),
    name: monkeyName,
    done: false
  });
  await persistMonkeyMemoItems();
  renderMonkeyMemo(`已加入猴名：${monkeyName}`);
}

function resolveMonkeyNameFromPage() {
  const selected = String(window.getSelection()?.toString() || "").trim();
  if (selected) {
    return selected.replace(/\s+/g, " ").slice(0, 80);
  }
  const selectors = [
    "span.trae-browser-inspect-draggable",
    "span.chat-title-text___Yr-ZI",
    "[class*='chat-title-text']",
    ".chat-title-text",
    ".session-title",
    ".conversation-title"
  ];
  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll(selector));
    for (const el of elements) {
      if (!(el instanceof HTMLElement) || !isVisible(el)) continue;
      const text = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (text) {
        return text.slice(0, 80);
      }
    }
  }
  return "";
}

async function toggleMonkeyMemoItem(itemId) {
  monkeyMemoState.items = monkeyMemoState.items.map((item) => (
    item.id === itemId ? { ...item, done: !item.done } : item
  ));
  await persistMonkeyMemoItems();
  renderMonkeyMemo();
}

async function deleteMonkeyMemoItem(itemId) {
  const target = monkeyMemoState.items.find((item) => item.id === itemId);
  monkeyMemoState.items = monkeyMemoState.items.filter((item) => item.id !== itemId);
  await persistMonkeyMemoItems();
  renderMonkeyMemo(target ? `已删除猴名：${target.name}` : "");
}

async function copyMonkeyMemoItem(itemId) {
  const target = monkeyMemoState.items.find((item) => item.id === itemId);
  if (!target || !target.name) {
    renderMonkeyMemo("未找到可复制的猴名。");
    return;
  }
  const ok = await copyToClipboard(target.name);
  renderMonkeyMemo(ok ? `已复制猴名：${target.name}` : `复制失败：${target.name}`);
}

async function persistMonkeyMemoItems() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.MONKEY_MEMO_ITEMS]: monkeyMemoState.items
  });
}

function startMonkeyMemoDrag(event) {
  if (!(event.target instanceof Element) || event.target.closest("button")) return;
  event.preventDefault();
  monkeyMemoState.dragPointerId = event.pointerId;
  monkeyMemoState.dragOffsetX = event.clientX - monkeyMemoState.position.x;
  monkeyMemoState.dragOffsetY = event.clientY - monkeyMemoState.position.y;
  window.addEventListener("pointermove", onMonkeyMemoDragMove, true);
  window.addEventListener("pointerup", endMonkeyMemoDrag, true);
}

function onMonkeyMemoDragMove(event) {
  if (monkeyMemoState.dragPointerId !== event.pointerId || !monkeyMemoState.host) return;
  const maxX = Math.max(12, window.innerWidth - 340);
  const maxY = Math.max(12, window.innerHeight - 120);
  monkeyMemoState.position = {
    x: Math.max(12, Math.min(maxX, event.clientX - monkeyMemoState.dragOffsetX)),
    y: Math.max(12, Math.min(maxY, event.clientY - monkeyMemoState.dragOffsetY))
  };
  monkeyMemoState.host.style.left = `${monkeyMemoState.position.x}px`;
  monkeyMemoState.host.style.top = `${monkeyMemoState.position.y}px`;
}

function endMonkeyMemoDrag(event) {
  if (monkeyMemoState.dragPointerId !== event.pointerId) return;
  monkeyMemoState.dragPointerId = null;
  window.removeEventListener("pointermove", onMonkeyMemoDragMove, true);
  window.removeEventListener("pointerup", endMonkeyMemoDrag, true);
  void chrome.storage.local.set({
    [STORAGE_KEYS.MONKEY_MEMO_POSITION]: monkeyMemoState.position
  });
}

function showMonkeyImageOverlay() {
  if (window.top !== window) return;
  ensureMonkeyImageOverlay();
  monkeyImageState.visible = true;
  monkeyImageState.host.style.display = "flex";
}

function ensureMonkeyImageOverlay() {
  if (monkeyImageState.host) return;
  const host = document.createElement("div");
  host.id = "tb-monkey-image-host";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = String(Z_INDEX_TOP);
  host.style.display = "none";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    .overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at center, rgba(124,58,237,.18), rgba(2,6,23,.72));
      backdrop-filter: blur(8px);
    }
    .card {
      position: relative;
      width: min(30vw, 460px);
      min-width: 280px;
      border-radius: 24px;
      overflow: hidden;
      border: 1px solid rgba(216,180,254,.35);
      box-shadow: 0 30px 90px rgba(10,10,28,.58);
      background: #0b0613;
    }
    img {
      display: block;
      width: 100%;
      height: auto;
    }
    .close {
      position: absolute;
      top: 12px;
      right: 12px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(15,23,42,.72);
      color: #fff;
      border-radius: 999px;
      width: 34px;
      height: 34px;
      cursor: pointer;
      font: 16px/1 Arial, sans-serif;
    }
  `;
  const wrapper = document.createElement("div");
  wrapper.className = "overlay";
  wrapper.innerHTML = `
    <div class="card">
      <button type="button" class="close" aria-label="close">×</button>
      <img alt="话术马喽马喽版" src="${MONKEY_IMAGE_URL}">
    </div>
  `;
  shadow.appendChild(style);
  shadow.appendChild(wrapper);
  document.documentElement.appendChild(host);
  monkeyImageState.host = host;
  const close = shadow.querySelector(".close");
  const overlay = shadow.querySelector(".overlay");
  close.addEventListener("click", hideMonkeyImageOverlay);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      hideMonkeyImageOverlay();
    }
  });
}

function hideMonkeyImageOverlay() {
  if (!monkeyImageState.host) return;
  monkeyImageState.visible = false;
  monkeyImageState.host.style.display = "none";
}

function setupAutoSendImageObserver() {
  if (autoSendObserver) return;
  autoSendObserver = new MutationObserver(() => {
    if (!settings.autoSendImageConfirm) return;
    scheduleAutoSendImageScan();
  });
  autoSendObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function setupAiReplyCaptureObserver() {
  if (chatCaptureState.observer) return;
  chatCaptureState.observer = new MutationObserver((mutations) => {
    if (!settings.aiReplySuggestEnabled) return;
    for (const mutation of mutations) {
      if (!mutation.addedNodes || mutation.addedNodes.length === 0) continue;
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        const msgNodes = [];
        if (isChatMessageNode(node)) msgNodes.push(node);
        node.querySelectorAll?.("div.msg-text").forEach((item) => msgNodes.push(item));
        msgNodes.forEach((msgEl) => {
          const parsed = parseMessageNode(msgEl);
          if (!parsed || !parsed.text) return;
          const key = `${parsed.role}::${parsed.text}`;
          const exists = chatCaptureState.newMessages.some((item) => `${item.role}::${item.text}` === key);
          if (exists) return;
          chatCaptureState.newMessages.push(parsed);
          if (chatCaptureState.newMessages.length > 100) {
            chatCaptureState.newMessages.shift();
          }
        });
      });
    }
  });
  chatCaptureState.observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function scheduleAutoSendImageScan() {
  if (autoSendScanTimer) {
    clearTimeout(autoSendScanTimer);
  }
  autoSendScanTimer = setTimeout(() => {
    autoSendScanTimer = null;
    triggerAutoSendImage();
  }, 80);
}

function triggerAutoSendImage() {
  if (!settings.enabled || !settings.autoSendImageConfirm) return;
  const strategy = settings.imageAutoSendStrategy === "enter" ? "enter" : "click";
  const modal = findImageConfirmModal();
  if (!modal) return;

  const now = Date.now();
  const cooldownMs = 1200;
  if (strategy === "click") {
    if (modal.dataset.tbImageAutoSent === "1") return;
    tryAutoClickImageSend(modal);
    return;
  }

  if (modal.dataset.tbImageAutoSent === "1") return;
  if (now - autoSendImageHandledAt < cooldownMs) return;
  autoSendImageHandledAt = now;
  tryAutoEnterImageSend(modal);
}

function tryAutoClickImageSend() {
  const modal = findImageConfirmModal();
  if (!modal) return;
  if (!settings.enabled || !settings.autoSendImageConfirm || modal.dataset.tbImageAutoSent === "1") return;
  modal.dataset.tbImageAutoSent = "1";
  const candidates = Array.from(modal.querySelectorAll("button.ant-btn.ant-btn-primary, button.ant-btn-primary, button"));
  const sendBtn = candidates.find((btn) => {
    if (!(btn instanceof HTMLButtonElement)) return false;
    if (!isVisible(btn) || btn.disabled) return false;
    const text = (btn.innerText || "").replace(/\s+/g, "");
    return text === "发送";
  });
  if (!sendBtn) return;
  sendBtn.click();
}

function isImageAutoSendEnterEvent(event) {
  return event.key === "Enter" || event.code === "Enter" || event.keyCode === 13 || event.which === 13;
}

function dispatchFakeEnter(target) {
  if (!target || !(target instanceof EventTarget)) return;
  const init = {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
    composed: true
  };
  target.dispatchEvent(new KeyboardEvent("keydown", init));
  target.dispatchEvent(new KeyboardEvent("keypress", init));
  target.dispatchEvent(new KeyboardEvent("keyup", init));
}

function resolveAutoSendImageTarget(modal) {
  const inputs = Array.from(
    modal.querySelectorAll("input,textarea,[contenteditable=''],[contenteditable='true']")
  ).filter((input) => isVisible(input));
  if (inputs.length > 0) {
    return inputs[0];
  }

  const buttons = Array.from(modal.querySelectorAll("button,button[type='submit'],[role='button']"))
    .filter((button) => button instanceof HTMLElement && isVisible(button));
  if (buttons.length > 0) {
    return buttons[0];
  }

  return document.activeElement || modal;
}

function executeAutoSendImageEnter(modal) {
  if (!modal || modal.dataset.tbImageAutoSent === "1") return;
  const target = resolveAutoSendImageTarget(modal);
  dispatchFakeEnter(target);
  setTimeout(() => {
    if (!findImageConfirmModal()) {
      return;
    }
    tryAutoClickImageSend(modal);
    if (!modal.dataset) return;
    modal.dataset.tbImageAutoSent = "1";
  }, 160);
}

function clearAutoSendImageEnterState() {
  if (!autoSendImageEnterState) return;
  if (autoSendImageEnterState.timerId) {
    clearTimeout(autoSendImageEnterState.timerId);
  }
  if (autoSendImageEnterState.listener) {
    document.removeEventListener("keydown", autoSendImageEnterState.listener, true);
    window.removeEventListener("keydown", autoSendImageEnterState.listener, true);
  }
  autoSendImageEnterState = null;
}

function tryAutoEnterImageSend(modal) {
  if (!settings.enabled || !settings.autoSendImageConfirm || !(modal instanceof HTMLElement)) return;
  const state = {
    modal,
    listener: null,
    timerId: null,
    done: false
  };
  const finalize = () => {
    if (state.done) return;
    state.done = true;
    clearAutoSendImageEnterState();
    executeAutoSendImageEnter(modal);
  };
  const onKeydown = (event) => {
    if (!isImageAutoSendEnterEvent(event)) return;
    if (state.done) return;
    state.done = true;
    clearAutoSendImageEnterState();
    executeAutoSendImageEnter(modal);
  };
  state.listener = onKeydown;
  autoSendImageEnterState = state;
  document.addEventListener("keydown", onKeydown, true);
  window.addEventListener("keydown", onKeydown, true);
  state.timerId = setTimeout(finalize, 1200);
}

function findImageConfirmModal() {
  const modalSelectors = [
    ".ant-modal",
    "[role='dialog']",
    ".ant-modal-root .ant-modal"
  ];
  const modals = [...new Set(
    modalSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
  )];

  for (const modal of modals) {
    if (!(modal instanceof HTMLElement)) continue;
    if (!isVisible(modal)) continue;
    const modalText = (modal.innerText || "").replace(/\s+/g, "");
    const hasImageHint = modal.querySelector("img") || /图片|发送图片|预览/.test(modalText);
    if (!hasImageHint) continue;
    return modal;
  }
  return null;
}

function collectConversationFromPage() {
  const nodes = Array.from(document.querySelectorAll("div.msg-text"));
  const messages = nodes
    .map((node) => parseMessageNode(node))
    .filter((item) => !!item && !!item.text);

  const meCount = messages.filter((m) => m.role === "me").length;
  const userCount = messages.filter((m) => m.role === "user").length;

  return {
    messages,
    meCount,
    userCount
  };
}

function getAiConfigFromSettings() {
  const defaults = miniMax && miniMax.getDefaultConfig ? miniMax.getDefaultConfig() : null;
  if (!defaults) return null;
  return {
    apiFormat: settings.aiApiFormat === "anthropic" ? "anthropic" : "openai",
    apiHostPreset: ["minimax-cn", "minimax-global", "deepseek", "volcengine"].includes(settings.aiApiHostPreset)
      ? settings.aiApiHostPreset
      : defaults.apiHostPreset,
    apiBaseUrl: String(settings.aiApiBaseUrl || defaults.apiBaseUrl).trim(),
    apiKey: String(settings.aiApiKey || defaults.apiKey).trim(),
    model: String(settings.aiModel || defaults.model).trim(),
    suggestCount: Number(settings.aiSuggestCount || defaults.suggestCount),
    argumentSeparator: getAiArgumentSeparator(),
    systemPrompt: String(settings.aiSystemPrompt || defaults.systemPrompt).trim(),
    replyPrompt: String(settings.aiReplyPrompt || "以下是聊天上下文：\n{{context}}\n\n请输出 {{count}} 条回复建议，要求：\n1) 每条一句，口语自然；\n2) 语气礼貌；\n3) 不要编造事实；\n4) 每条前加序号。").trim(),
    replyPromptWithIntent: String(settings.aiReplyPromptWithIntent || "以下是聊天上下文：\n{{context}}\n\n{{intent_block}}请输出 {{count}} 条回复建议，要求：\n1) 优先满足额外要求；\n2) 每条一句，口语自然；\n3) 语气礼貌；\n4) 不要编造事实；\n5) 每条前加序号。").trim()
  };
}

function getAiReplyBranches() {
  return Array.isArray(settings.aiReplyBranches) ? settings.aiReplyBranches : [];
}

function getAiExtensionRules() {
  return Array.isArray(settings.aiExtensionRules) ? settings.aiExtensionRules : [];
}

function buildConversationPrompt(messages, suggestCount, templateStr, intentText) {
  const compact = compactMessages(messages, 18, 2200);
  const conversationText = compact
    .map((m) => `${m.role === "me" ? "我" : "用户"}：${m.text}`)
    .join("\n");
  const count = Math.min(5, Math.max(1, Number(suggestCount || 3)));
  const intent = String(intentText || "").trim();
  const intentBlock = intent ? `额外要求：\n${intent}\n\n` : "";

  const template = templateStr || "以下是聊天上下文：\n{{context}}\n\n{{intent_block}}请输出 {{count}} 条回复建议，要求：\n1) 每条一句，口语自然；\n2) 语气礼貌；\n3) 不要编造事实；\n4) 每条前加序号。";

  return template
    .replace(/\{\{context\}\}/g, conversationText)
    .replace(/\{\{count\}\}/g, String(count))
    .replace(/\{\{intent_block\}\}/g, intentBlock)
    .replace(/\{\{intent\}\}/g, intent)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildAiPolishPrompt(sourceText, suggestCount) {
  const count = Math.min(5, Math.max(1, Number(suggestCount || 3)));
  return (
    `请基于系统要求处理下面这段原始话术：\n${String(sourceText || "").trim()}\n\n` +
    `请输出 ${count} 条不同风格的结果，要求：\n` +
    "1) 每条一句；\n2) 保持原意，不编造事实；\n3) 可直接发送；\n4) 每条前加序号。"
  );
}

function compactMessages(messages, maxMessages, maxChars) {
  const list = Array.isArray(messages) ? messages : [];
  const result = [];
  for (const item of list) {
    if (!item || !item.text) continue;
    const role = item.role === "me" ? "me" : "user";
    const text = String(item.text).replace(/\s+/g, " ").trim();
    if (!text) continue;
    const last = result[result.length - 1];
    if (last && last.role === role && last.text === text) continue;
    result.push({ role, text: text.slice(0, 240) });
  }
  const tail = result.slice(-Math.max(1, maxMessages || 18));
  const reversed = [];
  let total = 0;
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    const row = tail[i];
    const len = row.text.length + 6;
    if (total + len > (maxChars || 2200) && reversed.length > 0) break;
    total += len;
    reversed.push(row);
  }
  return reversed.reverse();
}

async function requestWithFallback(aiConfig, userPrompt) {
  if (!aiConfig.apiKey) {
    throw new Error("请先配置 AI API Key");
  }
  const response = await chrome.runtime.sendMessage({
    type: "tb-ai-generate",
    payload: { aiConfig, userPrompt }
  });
  if (!response || response.ok !== true) {
    throw new Error(response?.error || "AI 请求失败");
  }
  return response.data;
}

function isChatMessageNode(node) {
  return node instanceof HTMLDivElement && node.classList.contains("msg-text");
}

function parseMessageNode(node) {
  if (!(node instanceof HTMLElement)) return null;
  const text = (node.innerText || "").trim();
  if (!text) return null;
  const className = node.className || "";
  const isMe = /style_isMe__|isMe/i.test(className);
  return {
    role: isMe ? "me" : "user",
    text
  };
}

function isVisible(el) {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function handleInputEvent(event) {
  if (settings.activated === false || settings.enabled === false) {
    hidePanel();
    return;
  }
  const target = getEventEditableTarget(event);
  if (!target) {
    hidePanel();
    return;
  }
  if (isCurrentSiteBlacklisted()) {
    hidePanel();
    return;
  }
  const context = extractInputContext(target);
  if (!context || !context.prefix) {
    hidePanel();
    return;
  }
  const aiReplyCommand = extractAiReplyCommand(context.query);
  if (aiReplyCommand) {
    showAiCommandPreview(context, aiReplyCommand);
    return;
  }
  const aiExtensionCommand = extractAiExtensionCommand(context.query);
  if (aiExtensionCommand) {
    showAiCommandPreview(context, aiExtensionCommand);
    return;
  }
  const queryNormalized = normalizeQuery(context.query);

  let matched = snippets
    .filter((item) => {
      // After typing only the trigger prefix (e.g. "/" / "、"), show suggestions directly.
      if (!queryNormalized) return true;
      return matchesQuery(item.shortcutNormalized, queryNormalized, settings.matchMode);
    })
    .sort((a, b) => {
      const aFull = a.shortcutNormalized === queryNormalized ? 1 : 0;
      const bFull = b.shortcutNormalized === queryNormalized ? 1 : 0;
      if (aFull !== bFull) return bFull - aFull;
      return (b.useCount || 0) - (a.useCount || 0);
    })
    .slice(0, MAX_SUGGESTIONS);

  // Fallback: if strict match mode yields no result, degrade to prefix to keep completion usable.
  if (queryNormalized && matched.length === 0 && settings.matchMode !== "prefix") {
    matched = snippets
      .filter((item) => matchesQuery(item.shortcutNormalized, queryNormalized, "prefix"))
      .sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
      .slice(0, MAX_SUGGESTIONS);
  }

  if (matched.length === 0) {
    hidePanel();
    return;
  }

  uiState.context = context;
  uiState.suggestions = matched;
  uiState.activeIndex = 0;

  if (settings.completionMode === "auto") {
    const exactMatches = matched.filter((item) => item.shortcutNormalized === queryNormalized);
    if (exactMatches.length === 1) {
      void applySnippet(exactMatches[0]);
      return;
    }
  }

  renderPanel(target);
}

async function handleKeydownEvent(event) {
  if (quickClickPickState.active && event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    stopQuickClickPick();
    return;
  }
  if (settings.activated === false) {
    return;
  }
  const currentTarget = getEventEditableTarget(event);
  if (uiState.visible && uiState.suggestions.length) {
    if (handleSuggestionPanelKeydown(event, currentTarget)) {
      return;
    }
    return;
  }
  if (handleQuickClickHotkey(event)) {
    return;
  }
}

async function handleSuggestionPanelKeydown(event, currentTarget) {
  if (!uiState.context || !isSameEditableContext(currentTarget, uiState.context.target, event)) {
    return false;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    event.stopPropagation();
    uiState.activeIndex = (uiState.activeIndex + 1) % uiState.suggestions.length;
    renderSuggestionList();
    return true;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    event.stopPropagation();
    uiState.activeIndex = (uiState.activeIndex - 1 + uiState.suggestions.length) % uiState.suggestions.length;
    renderSuggestionList();
    return true;
  }
  if (event.key === "Enter") {
    const snippet = uiState.suggestions[uiState.activeIndex];
    if (!snippet || snippet.selectable === false) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
    await applySnippet(snippet);
    return true;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    hidePanel();
    return true;
  }
  return false;
}

function isSameEditableContext(currentTarget, expectedTarget, event) {
  if (!expectedTarget) return false;
  if (currentTarget === expectedTarget) return true;
  if (currentTarget instanceof Node && expectedTarget instanceof Node) {
    if (expectedTarget.contains?.(currentTarget) || currentTarget.contains?.(expectedTarget)) {
      return true;
    }
  }

  const path = typeof event?.composedPath === "function" ? event.composedPath() : [];
  if (Array.isArray(path) && path.includes(expectedTarget)) {
    return true;
  }

  const activeEditable = getEditableTarget(document.activeElement);
  if (activeEditable === expectedTarget) {
    return true;
  }
  if (activeEditable instanceof Node && expectedTarget instanceof Node) {
    if (expectedTarget.contains?.(activeEditable) || activeEditable.contains?.(expectedTarget)) {
      return true;
    }
  }

  if (expectedTarget.isContentEditable) {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    if (anchor instanceof Node && expectedTarget.contains(anchor)) {
      return true;
    }
  }

  return false;
}

function handleQuickClickHotkey(event) {
  const rules = Array.isArray(settings.quickClickRules) ? settings.quickClickRules : [];
  const matched = rules.find((rule) => {
    if (!rule || rule.enabled === false) return false;
    if (!matchesHotkey(event, rule.hotkey)) return false;
    return matchesQuickClickUrl(rule.urlPattern);
  });
  if (!matched) return false;
  event.preventDefault();
  event.stopPropagation();
  executeQuickClickRule(matched);
  return true;
}

function matchesHotkey(event, hotkey) {
  const expected = parseHotkey(hotkey);
  if (!expected.key) return false;
  return event.ctrlKey === expected.ctrl
    && event.altKey === expected.alt
    && event.shiftKey === expected.shift
    && event.metaKey === expected.meta
    && normalizeEventKey(event.key) === expected.key;
}

function parseHotkey(raw) {
  const result = { ctrl: false, alt: false, shift: false, meta: false, key: "" };
  String(raw || "").split("+").map((part) => part.trim()).filter(Boolean).forEach((part) => {
    const lower = part.toLowerCase();
    if (lower === "ctrl" || lower === "control") result.ctrl = true;
    else if (lower === "alt" || lower === "option") result.alt = true;
    else if (lower === "shift") result.shift = true;
    else if (lower === "meta" || lower === "cmd" || lower === "command") result.meta = true;
    else result.key = normalizeEventKey(part);
  });
  return result;
}

function normalizeEventKey(key) {
  const text = String(key || "");
  return text.length === 1 ? text.toUpperCase() : text.toLowerCase();
}

function matchesQuickClickUrl(pattern) {
  const text = String(pattern || "").trim();
  if (!text) return true;
  const href = location.href.toLowerCase();
  const host = location.hostname.toLowerCase();
  return href.includes(text.toLowerCase()) || host.includes(text.toLowerCase());
}

function executeQuickClickRule(rule) {
  const target = findQuickClickTarget(rule);
  if (!target) {
    showQuickClickToast("快捷点击失败：未找到目标");
    return { ok: false, error: "target_not_found" };
  }
  dispatchQuickClick(target, rule.clickType);
  showQuickClickToast("已执行快捷点击");
  return { ok: true };
}

function findQuickClickTarget(rule) {
  if (rule?.mode === "coordinate") {
    const x = clampNumber(rule.x, 0, window.innerWidth - 1, 0);
    const y = clampNumber(rule.y, 0, window.innerHeight - 1, 0);
    return document.elementFromPoint(x, y);
  }
  const selector = String(rule?.selector || "").trim();
  if (!selector) return null;
  try {
    return document.querySelector(selector);
  } catch (_error) {
    return null;
  }
}

function dispatchQuickClick(target, clickType) {
  if (!(target instanceof Element)) return;
  target.scrollIntoView?.({ block: "center", inline: "center", behavior: "instant" });
  if (clickType === "native") {
    target.click();
    return;
  }
  const rect = target.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((type) => {
    const eventInit = { bubbles: true, cancelable: true, composed: true, clientX, clientY, button: 0 };
    const event = type.startsWith("pointer")
      ? new PointerEvent(type, { ...eventInit, pointerId: 1, pointerType: "mouse", isPrimary: true })
      : new MouseEvent(type, eventInit);
    target.dispatchEvent(event);
  });
}

function startQuickClickPick(mode) {
  stopQuickClickPick();
  hideMonkeyImageOverlay();
  quickClickPickState.active = true;
  quickClickPickState.mode = mode;
  quickClickPickState.overlay = document.createElement("div");
  quickClickPickState.overlay.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    "width:0",
    "height:0",
    "border:2px solid #22d3ee",
    "background:rgba(34,211,238,0.12)",
    "box-shadow:0 0 0 9999px rgba(2,6,23,0.18),0 0 22px rgba(34,211,238,0.55)",
    "z-index:2147483647",
    "pointer-events:none",
    "border-radius:6px"
  ].join(";");
  quickClickPickState.hint = document.createElement("div");
  quickClickPickState.hint.textContent = mode === "coordinate"
    ? "快捷点击调试：点击页面坐标，Esc 取消"
    : "快捷点击调试：点击要绑定的 button/div，Esc 取消";
  quickClickPickState.hint.style.cssText = [
    "position:fixed",
    "left:16px",
    "top:16px",
    "z-index:2147483647",
    "padding:10px 12px",
    "border-radius:8px",
    "background:rgba(15,23,42,0.94)",
    "color:#e0f2fe",
    "font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
    "box-shadow:0 8px 24px rgba(0,0,0,0.24)",
    "pointer-events:none"
  ].join(";");
  document.documentElement.append(quickClickPickState.overlay, quickClickPickState.hint);
  document.addEventListener("pointermove", onQuickClickPickMove, true);
  document.addEventListener("click", onQuickClickPickClick, true);
}

function stopQuickClickPick() {
  if (!quickClickPickState.active) return;
  quickClickPickState.active = false;
  quickClickPickState.current = null;
  quickClickPickState.overlay?.remove();
  quickClickPickState.hint?.remove();
  quickClickPickState.overlay = null;
  quickClickPickState.hint = null;
  document.removeEventListener("pointermove", onQuickClickPickMove, true);
  document.removeEventListener("click", onQuickClickPickClick, true);
}

function onQuickClickPickMove(event) {
  if (!quickClickPickState.active) return;
  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (!(target instanceof Element) || target === quickClickPickState.overlay || target === quickClickPickState.hint) return;
  quickClickPickState.current = target;
  const rect = target.getBoundingClientRect();
  if (quickClickPickState.overlay) {
    quickClickPickState.overlay.style.left = `${Math.max(0, rect.left)}px`;
    quickClickPickState.overlay.style.top = `${Math.max(0, rect.top)}px`;
    quickClickPickState.overlay.style.width = `${Math.max(0, rect.width)}px`;
    quickClickPickState.overlay.style.height = `${Math.max(0, rect.height)}px`;
  }
}

function onQuickClickPickClick(event) {
  if (!quickClickPickState.active) return;
  event.preventDefault();
  event.stopPropagation();
  const target = document.elementFromPoint(event.clientX, event.clientY);
  const element = target instanceof Element ? target : quickClickPickState.current;
  const payload = quickClickPickState.mode === "coordinate"
    ? {
      mode: "coordinate",
      x: Math.round(event.clientX),
      y: Math.round(event.clientY),
      selector: element ? buildCssSelector(element) : "",
      label: element ? getQuickClickElementLabel(element) : "",
      host: location.hostname
    }
    : {
      mode: "selector",
      selector: element ? buildCssSelector(element) : "",
      label: element ? getQuickClickElementLabel(element) : "",
      host: location.hostname
    };
  void chrome.storage.local.set({ [STORAGE_KEYS.QUICK_CLICK_PENDING_TARGET]: payload });
  showQuickClickToast("已选取快捷点击目标，请打开插件 popup 保存");
  stopQuickClickPick();
}

function buildCssSelector(element) {
  if (!(element instanceof Element)) return "";
  if (element.id) return `#${cssEscape(element.id)}`;
  const parts = [];
  let node = element;
  while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
    let part = node.tagName.toLowerCase();
    const stableAttr = ["data-testid", "data-id", "name", "aria-label", "title"].find((attr) => node.getAttribute(attr));
    if (stableAttr) {
      part += `[${stableAttr}="${cssAttrEscape(node.getAttribute(stableAttr))}"]`;
      parts.unshift(part);
      break;
    }
    const classes = Array.from(node.classList || [])
      .filter((name) => !/^\d/.test(name) && !/[{}[\]()]/.test(name))
      .slice(0, 2);
    if (classes.length) part += `.${classes.map(cssEscape).join(".")}`;
    const parent = node.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(" > ");
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function cssAttrEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getQuickClickElementLabel(element) {
  const text = (element.innerText || element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || element.tagName || "")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 18) || element.tagName.toLowerCase();
}

function showQuickClickToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText = [
    "position:fixed",
    "right:18px",
    "bottom:18px",
    "z-index:2147483647",
    "padding:10px 12px",
    "border-radius:8px",
    "background:rgba(15,23,42,0.94)",
    "color:#e0f2fe",
    "font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
    "box-shadow:0 8px 24px rgba(0,0,0,0.24)"
  ].join(";");
  document.documentElement.appendChild(toast);
  window.setTimeout(() => toast.remove(), 1600);
}

async function applySnippet(snippet) {
  if (!snippet || snippet.selectable === false) {
    return;
  }
  if (snippet.kind === "ai-command" && snippet.command) {
    if (snippet.command.mode === "reply") {
      await handleAiReplySuggest(uiState.context, snippet.command);
      return;
    }
    await handleAiExtensionSuggest(uiState.context, snippet.command);
    return;
  }
  const target = uiState.context && uiState.context.target;
  if (!target) {
    hidePanel();
    return;
  }
  if (snippet.type === "image") {
    await applyImageSnippet(snippet, target);
    return;
  }
  const content = String(snippet.content || "");
  const variables = extractVariables(content);
  const customVars = variables.filter((name) => !BUILTIN_VARIABLES.has(name));
  let customValues = {};
  if (customVars.length > 0) {
    customValues = await collectCustomVariables(customVars);
    if (customValues === null) {
      return;
    }
  }
  const finalText = fillTemplate(content, customValues);
  const insertAnchor = getInsertFxAnchorFromContext(uiState.context);
  const inserted = replaceCurrentToken(target, uiState.context.tokenLength, finalText);
  if (inserted) {
    playInsertParticles(insertAnchor, snippet.kind === "ai" ? "ai" : "snippet");
  }
  if (!snippet.kind || snippet.kind !== "ai") {
    await increaseSnippetUse(snippet.id);
  }
  hidePanel();
}

async function applyImageSnippet(snippet, target) {
  const context = uiState.context;
  if (!snippet.imageData) {
    hidePanel();
    return;
  }

  const insertAnchor = getInsertFxAnchorFromContext(context);
  replaceCurrentToken(target, context?.tokenLength || 0, "");
  focusEditableTarget(target);

  try {
    const file = dataUrlToFile(snippet.imageData, snippet.imageName, snippet.imageMime);
    let clipboardReady = false;
    try {
      await writeImageFileToClipboard(file);
      clipboardReady = true;
    } catch (clipboardError) {
      console.warn("[nihao] image snippet clipboard write failed", clipboardError);
    }

    const pasteHandled = dispatchImagePaste(target, file);
    const uploadHandled = pasteHandled ? false : insertImageFileViaUploadInput(target, file);
    if (!clipboardReady && !pasteHandled && !uploadHandled) {
      throw new Error("image snippet insert was not accepted by clipboard, paste event, or file input");
    }
    playInsertParticles(insertAnchor, "snippet");
    await increaseSnippetUse(snippet.id);
    hidePanel();

    if (snippet.autoSendAfterInsert === true && settings.autoSendImageConfirm === true) {
      scheduleImageSnippetAutoSendScan();
    }
  } catch (error) {
    console.warn("[nihao] image snippet paste failed", error);
    hidePanel();
  }
}

function focusEditableTarget(target) {
  if (target instanceof HTMLElement) {
    target.focus();
  }
}

function dataUrlToFile(dataUrl, fileName, mimeFallback = "image/png") {
  const text = String(dataUrl || "");
  const commaIndex = text.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("invalid image dataURL");
  }
  const header = text.slice(0, commaIndex);
  const mimeMatch = header.match(/^data:([^;]+);/i);
  const mime = mimeMatch ? mimeMatch[1] : String(mimeFallback || "image/png");
  const binary = atob(text.slice(commaIndex + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], String(fileName || "image.png"), { type: mime });
}

async function writeImageFileToClipboard(file) {
  if (!navigator.clipboard || typeof navigator.clipboard.write !== "function" || typeof ClipboardItem === "undefined") {
    throw new Error("clipboard image write is not supported");
  }
  await navigator.clipboard.write([new ClipboardItem({ [file.type || "image/png"]: file })]);
}

function dispatchImagePaste(target, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  let pasteEvent;
  try {
    pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clipboardData: transfer
    });
  } catch (_error) {
    pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      composed: true
    });
  }
  if (!pasteEvent.clipboardData || pasteEvent.clipboardData.files.length === 0) {
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: transfer
    });
  }
  let handled = !target.dispatchEvent(pasteEvent);
  for (const receiver of getPasteEventReceivers(target)) {
    if (receiver === target) continue;
    let nextEvent;
    try {
      nextEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: transfer
      });
    } catch (_error) {
      nextEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        composed: true
      });
    }
    if (!nextEvent.clipboardData || nextEvent.clipboardData.files.length === 0) {
      Object.defineProperty(nextEvent, "clipboardData", {
        value: transfer
      });
    }
    handled = !receiver.dispatchEvent(nextEvent) || handled;
  }
  try {
    document.execCommand("paste");
  } catch (_error) {
    // Synthetic paste is the primary path; execCommand is best effort for older pages.
  }
  return handled;
}

function getPasteEventReceivers(target) {
  const receivers = [];
  if (target instanceof Element) {
    const scoped = target.closest(".styles_talkSend__gSe00, .sendBox___91cCZ, .chatInput___4ofR-, [class*='talkSend'], [class*='sendBox'], [class*='chatInput'], [class*='inputWrap']");
    if (scoped) receivers.push(scoped);
    if (target.parentElement) receivers.push(target.parentElement);
  }
  receivers.push(document, window);
  return receivers.filter(Boolean);
}

function insertImageFileViaUploadInput(target, file) {
  const input = findImageUploadInput(target);
  if (!input) return false;
  try {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return true;
  } catch (error) {
    console.warn("[nihao] image snippet upload input insert failed", error);
    return false;
  }
}

function findImageUploadInput(target) {
  const scopes = [];
  if (target instanceof Element) {
    const composer = target.closest(".styles_talkSend__gSe00, .sendBox___91cCZ, .chatInput___4ofR-, [class*='talkSend'], [class*='sendBox'], [class*='chatInput']");
    if (composer) scopes.push(composer);
    let current = target.parentElement;
    for (let depth = 0; current && depth < 8; depth += 1) {
      scopes.push(current);
      current = current.parentElement;
    }
  }
  scopes.push(document);

  for (const scope of scopes) {
    const inputs = Array.from(scope.querySelectorAll ? scope.querySelectorAll("input[type='file']") : []);
    const imageInput = inputs.find(isImageUploadInput);
    if (imageInput) return imageInput;
  }
  return null;
}

function isImageUploadInput(input) {
  const accept = String(input.getAttribute("accept") || "").toLowerCase();
  if (!accept) return true;
  return accept.includes("image/") || accept.includes(".jpg") || accept.includes(".jpeg") || accept.includes(".png") || accept.includes("jpg") || accept.includes("jpeg") || accept.includes("png");
}

function scheduleImageSnippetAutoSendScan() {
  [120, 420, 900, 1400].forEach((delay) => {
    setTimeout(scheduleAutoSendImageScan, delay);
  });
}

function showAiCommandPreview(context, command) {
  uiState.context = context;
  uiState.suggestions = command.previewTitle
    ? [
      {
        id: `ai-command-${Date.now()}`,
        kind: "ai-command",
        title: command.previewTitle,
        shortcut: command.shortcutDisplay,
        category: command.previewCategory,
        content: "",
        selectable: true,
        command
      }
    ]
    : [
      {
        kind: "system",
        title: command.emptyHint,
        shortcut: command.shortcutDisplay,
        category: "AI指令",
        content: "",
        selectable: false
      }
    ];
  uiState.activeIndex = 0;
  renderPanel(context.target);
}

async function handleAiReplySuggest(context, command) {
  const currentSeq = ++uiState.aiRequestSeq;
  uiState.context = context;
  uiState.suggestions = [
    {
      kind: "system",
      title: `正在生成 ${command.title}...`,
      shortcut: command.shortcutDisplay,
      category: command.resultCategory,
      content: "",
      selectable: false
    }
  ];
  uiState.activeIndex = 0;
  renderPanel(context.target);

  try {
    const aiConfig = getAiConfigFromSettings();
    if (!aiConfig || settings.aiReplySuggestEnabled !== true) {
      uiState.suggestions = [
        {
          kind: "system",
          title: "AI 建议未开启，请在插件设置中开启",
          shortcut: command.shortcutDisplay,
          category: command.resultCategory,
          content: "",
          selectable: false
        }
      ];
      if (currentSeq === uiState.aiRequestSeq) renderSuggestionList();
      return;
    }
    const conversation = collectConversationFromPage();
    const replyTemplate = command.intent ? aiConfig.replyPromptWithIntent : aiConfig.replyPrompt;
    const prompt = buildConversationPrompt(
      conversation.messages,
      aiConfig.suggestCount,
      replyTemplate,
      command.intent
    );
    const data = await requestWithFallback({
      ...aiConfig,
      systemPrompt: command.prompt
    }, prompt);
    if (currentSeq !== uiState.aiRequestSeq) return;
    void trackFeatureUsage("ai-reply", {
      hasIntent: !!command.intent,
      branchId: command.branchId,
      branchKeyword: command.branchKeyword,
      branchTitle: command.branchTitle
    });
    const content = miniMax.parseResponseText(aiConfig.apiFormat, data);
    const suggestions = miniMax.parseSuggestions(content, aiConfig.suggestCount);
    if (!suggestions.length) {
      uiState.suggestions = [
        {
          kind: "system",
          title: "AI 已返回，但未解析到建议",
          shortcut: command.shortcutDisplay,
          category: command.resultCategory,
          content: "",
          selectable: false
        }
      ];
      renderSuggestionList();
      return;
    }
    uiState.suggestions = suggestions.map((text, index) => ({
      id: `ai-${Date.now()}-${index}`,
      kind: "ai",
      title: text,
      shortcut: command.shortcutDisplay,
      category: command.resultCategory,
      content: text,
      selectable: true
    }));
    uiState.activeIndex = 0;
    renderSuggestionList();
  } catch (error) {
    if (currentSeq !== uiState.aiRequestSeq) return;
    uiState.suggestions = [
      {
        kind: "system",
        title: `AI 建议生成失败：${String(error?.message || "未知错误").slice(0, 80)}`,
        shortcut: command.shortcutDisplay,
        category: command.resultCategory,
        content: "",
        selectable: false
      }
    ];
    uiState.activeIndex = 0;
    renderSuggestionList();
  }
}

async function handleAiExtensionSuggest(context, command) {
  const currentSeq = ++uiState.aiRequestSeq;
  uiState.context = context;
  uiState.suggestions = [
    {
      kind: "system",
      title: `正在执行 ${command.title}...`,
      shortcut: command.shortcutDisplay,
      category: command.resultCategory,
      content: "",
      selectable: false
    }
  ];
  uiState.activeIndex = 0;
  renderPanel(context.target);

  try {
    const aiConfig = getAiConfigFromSettings();
    if (!aiConfig || settings.aiReplySuggestEnabled !== true) {
      uiState.suggestions = [
        {
          kind: "system",
          title: "AI 建议未开启，请在插件设置中开启",
          shortcut: command.shortcutDisplay,
          category: command.resultCategory,
          content: "",
          selectable: false
        }
      ];
      if (currentSeq === uiState.aiRequestSeq) renderSuggestionList();
      return;
    }
    if (!command.sourceText) {
      uiState.suggestions = [
        {
          kind: "system",
          title: command.emptyHint,
          shortcut: command.shortcutDisplay,
          category: command.resultCategory,
          content: "",
          selectable: false
        }
      ];
      renderSuggestionList();
      return;
    }
    const prompt = buildAiPolishPrompt(command.sourceText, aiConfig.suggestCount);
    const data = await requestWithFallback({
      ...aiConfig,
      systemPrompt: command.prompt
    }, prompt);
    if (currentSeq !== uiState.aiRequestSeq) return;
    void trackFeatureUsage("ai-extension", {
      ruleId: command.ruleId,
      ruleKeyword: command.keyword,
      ruleTitle: command.title
    });
    const content = miniMax.parseResponseText(aiConfig.apiFormat, data);
    const suggestions = miniMax.parseSuggestions(content, aiConfig.suggestCount);
    if (!suggestions.length) {
      uiState.suggestions = [
        {
          kind: "system",
          title: "AI 已返回，但未解析到结果",
          shortcut: command.shortcutDisplay,
          category: command.resultCategory,
          content: "",
          selectable: false
        }
      ];
      renderSuggestionList();
      return;
    }
    uiState.suggestions = suggestions.map((text, index) => ({
      id: `ai-polish-${Date.now()}-${index}`,
      kind: "ai",
      title: text,
      shortcut: command.shortcutDisplay,
      category: command.resultCategory,
      content: text,
      selectable: true
    }));
    uiState.activeIndex = 0;
    renderSuggestionList();
  } catch (error) {
    if (currentSeq !== uiState.aiRequestSeq) return;
    uiState.suggestions = [
      {
        kind: "system",
        title: `AI 执行失败：${String(error?.message || "未知错误").slice(0, 80)}`,
        shortcut: command.shortcutDisplay,
        category: command.resultCategory,
        content: "",
        selectable: false
      }
    ];
    uiState.activeIndex = 0;
    renderSuggestionList();
  }
}

function renderPanel(target) {
  panelLib.ensurePanel(uiState);
  applyPanelStyles();
  panelLib.showPanel(uiState);
  renderSuggestionList();
  positionPanel(target);
}

function renderSuggestionList() {
  panelLib.renderSuggestionList(uiState, settings, escapeHtml, applySnippet);
}

function hidePanel() {
  panelLib.hidePanel(uiState);
}

function positionPanel(target) {
  if (uiState.context) {
    uiState.context.anchorPoint = getPanelAnchorFromContext(uiState.context);
  }
  panelLib.positionPanel(uiState, uiState.context || target, settings, clampNumber);
}

function extractInputContext(target) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const cursor = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
    const beforeCursor = target.value.slice(0, cursor);
    const matched = findLatestTrigger(beforeCursor);
    if (!matched) return null;
    const tokenLength = matched.prefix.length + matched.query.length;
    const triggerStart = Math.max(0, cursor - tokenLength);
    return {
      target,
      query: matched.query,
      prefix: matched.prefix,
      tokenLength,
      triggerStart
    };
  }

  if (target.isContentEditable) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!range.collapsed) return null;
    const preRange = range.cloneRange();
    preRange.selectNodeContents(target);
    preRange.setEnd(range.endContainer, range.endOffset);
    const beforeCursor = preRange.toString();
    const matched = findLatestTrigger(beforeCursor);
    if (!matched) return null;
    const tokenLength = matched.prefix.length + matched.query.length;
    const triggerStart = Math.max(0, beforeCursor.length - tokenLength);
    return {
      target,
      query: matched.query,
      prefix: matched.prefix,
      tokenLength,
      triggerStart
    };
  }
  return null;
}

function findLatestTrigger(text) {
  const prefixes = Array.isArray(settings.triggerPrefixes) && settings.triggerPrefixes.length > 0
    ? settings.triggerPrefixes
    : ["/", "、"];
  let best = null;
  for (const prefix of prefixes) {
    const escaped = escapeRegExp(prefix);
    const regex = new RegExp(`${escaped}([^\\s]*)$`);
    const matched = text.match(regex);
    if (!matched) continue;
    const query = matched[1] || "";
    if (!best || query.length > best.query.length) {
      best = { prefix, query };
    }
  }
  return best;
}

function extractAiReplyCommand(query) {
  const raw = String(query || "");
  const separatorState = splitAiArgument(raw);
  if (separatorState.invalid) return null;
  const rawKeyword = separatorState.rawKeyword;
  const intent = separatorState.argumentText;
  const aiTriggerWord = normalizeQuery(settings.aiTriggerWord || "ai");
  const keyword = normalizeQuery(rawKeyword);
  if (!keyword || !aiTriggerWord || !keyword.startsWith(aiTriggerWord)) return null;
  const branchKeyword = keyword.slice(aiTriggerWord.length);
  const branch = branchKeyword
    ? getAiReplyBranches().find((item) => item.keyword === branchKeyword)
    : null;
  return {
    mode: "reply",
    keyword: branchKeyword || aiTriggerWord,
    branchId: branch ? branch.id : "",
    branchKeyword: branch ? branch.keyword : "",
    branchTitle: branch ? branch.title : "",
    title: branch ? branch.title : "AI 回复建议",
    sourceText: raw,
    intent,
    prompt: branch ? branch.prompt : String(settings.aiSystemPrompt || "").trim(),
    shortcutDisplay: `${aiTriggerWord}${branchKeyword}${separatorState.hasArgument ? getAiArgumentSeparator() : ""}`,
    previewTitle: branch ? `生成 ${branch.title}` : "生成 AI 回复建议",
    previewCategory: intent ? "按 Enter 生成带要求建议" : "按 Enter 生成建议",
    resultCategory: branch ? `AI分支 · ${branch.title}` : "AI回复建议",
    emptyHint: `输入 ${aiTriggerWord}、${aiTriggerWord}${getAiArgumentSeparator()}要求 或 ${aiTriggerWord}分支${getAiArgumentSeparator()}要求，按 Enter 生成回复建议`
  };
}

function extractAiExtensionCommand(query) {
  const raw = String(query || "");
  const separatorState = splitAiArgument(raw);
  if (separatorState.invalid || !separatorState.hasArgument) return null;
  const keyword = normalizeQuery(separatorState.rawKeyword);
  const sourceText = separatorState.argumentText;
  if (!keyword) return null;
  const rule = getAiExtensionRules().find((item) => item.keyword === keyword);
  if (!rule) return null;
  return {
    mode: "extension",
    keyword,
    ruleId: rule.id,
    ruleTitle: rule.title,
    title: rule.title,
    sourceText,
    prompt: rule.prompt,
    shortcutDisplay: `${keyword}${getAiArgumentSeparator()}`,
    previewTitle: sourceText,
    previewCategory: "按 Enter 执行扩展",
    resultCategory: `AI扩展 · ${rule.title}`,
    emptyHint: `请输入要处理的话术，例如 /${keyword}${getAiArgumentSeparator()}你好同学`
  };
}

function getAiArgumentSeparator() {
  return settings.aiArgumentSeparator === "+" ? "+" : "*";
}

function splitAiArgument(raw) {
  const text = String(raw || "");
  const activeSeparator = getAiArgumentSeparator();
  const inactiveSeparator = activeSeparator === "*" ? "+" : "*";
  const activeIndex = text.indexOf(activeSeparator);
  const inactiveIndex = text.indexOf(inactiveSeparator);
  if (inactiveIndex >= 0 && (activeIndex < 0 || inactiveIndex < activeIndex)) {
    return {
      invalid: true,
      hasArgument: false,
      rawKeyword: text,
      argumentText: ""
    };
  }
  if (activeIndex < 0) {
    return {
      invalid: false,
      hasArgument: false,
      rawKeyword: text,
      argumentText: ""
    };
  }
  return {
    invalid: false,
    hasArgument: true,
    rawKeyword: text.slice(0, activeIndex),
    argumentText: text.slice(activeIndex + 1).trim()
  };
}

function replaceCurrentToken(target, tokenLength, text) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const value = target.value;
    const end = target.selectionStart ?? value.length;
    const start = Math.max(0, end - tokenLength);
    const next = value.slice(0, start) + text + value.slice(end);
    target.value = next;
    const cursor = start + text.length;
    target.setSelectionRange(cursor, cursor);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  if (target.isContentEditable) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return false;
    }
    const range = selection.getRangeAt(0);
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      const node = range.startContainer;
      const origin = node.textContent || "";
      const end = range.startOffset;
      const start = Math.max(0, end - tokenLength);
      node.textContent = origin.slice(0, start) + text + origin.slice(end);
      const newOffset = start + text.length;
      const nextRange = document.createRange();
      nextRange.setStart(node, newOffset);
      nextRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(nextRange);
      target.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    document.execCommand("insertText", false, text);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  return false;
}

function playInsertParticles(anchor, mode) {
  if (!shouldPlayInsertEffect(mode)) return;
  const host = ensureInsertFxHost();
  if (!host) return;
  const directionX = Number.isFinite(anchor?.directionX) ? anchor.directionX : 1;
  const directionY = Number.isFinite(anchor?.directionY) ? anchor.directionY : -0.12;
  const config = buildInsertEffectConfig(mode);
  if (!config) return;
  if (config.style === "nebula-trail") {
    renderNebulaTrailInsertEffect(host, anchor, directionX, directionY, config);
    return;
  }
  if (config.style === "pixel-burst") {
    renderPixelBurstInsertEffect(host, anchor, directionX, directionY, config);
    return;
  }
  if (config.style === "lightning-arc") {
    renderLightningArcInsertEffect(host, anchor, directionX, directionY, config);
    return;
  }
  if (config.style === "feather-stream") {
    renderFeatherStreamInsertEffect(host, anchor, directionX, directionY, config);
    return;
  }
  if (config.style === "magic-circle") {
    renderMagicCircleInsertEffect(host, anchor, directionX, directionY, config);
    return;
  }
  renderCyberFlameInsertEffect(host, anchor, directionX, directionY, config);
}

function shouldPlayInsertEffect(mode) {
  if (settings.insertEffectScope === "off") return false;
  if (settings.insertEffectScope === "ai-only" && mode !== "ai") return false;
  return true;
}

function buildInsertEffectConfig(mode) {
  const isAi = mode === "ai";
  const style = isAi
    ? normalizeEffectStyle(settings.aiEffectStyle || "magic-circle")
    : normalizeEffectStyle(settings.snippetEffectStyle);
  const primaryColor = normalizeColorHex(
    isAi ? settings.aiEffectPrimaryColor : settings.snippetEffectPrimaryColor,
    isAi ? "#22d3ee" : "#8b5cf6"
  );
  const accentColor = normalizeColorHex(
    isAi ? settings.aiEffectAccentColor : settings.snippetEffectAccentColor,
    isAi ? "#a78bfa" : "#60a5fa"
  );
  const intensityScale = clampNumber(
    isAi ? settings.aiEffectIntensity : settings.snippetEffectIntensity,
    50,
    200,
    100
  ) / 100;
  const sizeScale = clampNumber(
    isAi ? settings.aiEffectSize : settings.snippetEffectSize,
    50,
    200,
    100
  ) / 100;
  const spreadScale = clampNumber(
    isAi ? settings.aiEffectSpread : settings.snippetEffectSpread,
    50,
    200,
    100
  ) / 100;
  const durationScale = clampNumber(
    isAi ? settings.aiEffectDuration : settings.snippetEffectDuration,
    50,
    200,
    100
  ) / 100;
  const palette = buildEffectPalette(primaryColor, accentColor);
  const base = isAi
    ? {
      colors: [palette.primary, palette.accent, palette.mix, "#ffffff"],
      glow: toRgba(palette.primary, 0.38),
      count: 36,
      spread: 176,
      burstWidth: 72,
      baseSize: 10,
      tailLength: 34,
      haloSize: 80,
      haloDriftX: 22,
      haloDriftY: 18,
      ringColor: toRgba(palette.primary, 0.68)
    }
    : {
      colors: [palette.primary, palette.accent, palette.mix, "#ffffff"],
      glow: toRgba(palette.primary, 0.34),
      count: 30,
      spread: 140,
      burstWidth: 58,
      baseSize: 8,
      tailLength: 26,
      haloSize: 72,
      haloDriftX: 18,
      haloDriftY: 14,
      ringColor: toRgba(palette.primary, 0.64)
    };
  if (style === "nebula-trail") {
    base.colors = [lightenColor(palette.primary, 0.18), palette.accent, lightenColor(palette.mix, 0.14), "#ffffff"];
    base.glow = toRgba(lightenColor(palette.primary, 0.12), isAi ? 0.42 : 0.4);
    base.count += isAi ? 10 : 8;
    base.spread += isAi ? 38 : 28;
    base.tailLength += isAi ? 24 : 18;
  }
  if (style === "pixel-burst") {
    base.colors = [palette.primary, lightenColor(palette.accent, 0.08), palette.mix, "#ffffff"];
    base.glow = toRgba(palette.primary, isAi ? 0.34 : 0.32);
    base.count += isAi ? 6 : 4;
    base.burstWidth += isAi ? 22 : 18;
  }
  if (style === "lightning-arc") {
    base.colors = ["#ffffff", lightenColor(palette.primary, 0.12), palette.accent, palette.mix];
    base.glow = toRgba(lightenColor(palette.primary, 0.16), 0.4);
    base.count += isAi ? 8 : 6;
    base.spread += isAi ? 20 : 16;
    base.burstWidth += isAi ? 14 : 10;
    base.ringColor = toRgba(lightenColor(palette.primary, 0.1), 0.72);
  }
  if (style === "feather-stream") {
    base.colors = [lightenColor(palette.primary, 0.22), palette.mix, palette.accent, "#ffffff"];
    base.glow = toRgba(lightenColor(palette.mix, 0.08), 0.38);
    base.count += isAi ? 12 : 10;
    base.spread += isAi ? 26 : 22;
    base.tailLength += isAi ? 30 : 24;
    base.haloSize += isAi ? 10 : 8;
  }
  return {
    ...base,
    style,
    count: Math.max(12, Math.round(base.count * intensityScale)),
    spread: base.spread * spreadScale,
    burstWidth: base.burstWidth * spreadScale,
    baseSize: base.baseSize * sizeScale,
    tailLength: base.tailLength * sizeScale,
    haloSize: base.haloSize * sizeScale,
    haloDuration: 680 * durationScale,
    particleDuration: 880 * durationScale,
    tailDuration: 760 * durationScale,
    ringDuration: 720 * durationScale
  };
}

function normalizeEffectStyle(value) {
  return ["magic-circle", "cyber-flame", "nebula-trail", "pixel-burst", "lightning-arc", "feather-stream"].includes(value)
    ? value
    : "cyber-flame";
}

function normalizeColorHex(value, fallback) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : fallback;
}

function buildEffectPalette(primary, accent) {
  return {
    primary,
    accent,
    mix: mixColors(primary, accent, 0.5)
  };
}

function lightenColor(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    Math.round(r + (255 - r) * amount),
    Math.round(g + (255 - g) * amount),
    Math.round(b + (255 - b) * amount)
  );
}

function mixColors(hexA, hexB, ratio) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const t = Math.max(0, Math.min(1, ratio));
  return rgbToHex(
    Math.round(a.r + (b.r - a.r) * t),
    Math.round(a.g + (b.g - a.g) * t),
    Math.round(a.b + (b.b - a.b) * t)
  );
}

function toRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgb(hex) {
  const normalized = normalizeColorHex(hex, "#ffffff");
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16)
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function renderCyberFlameInsertEffect(host, anchor, directionX, directionY, config) {
  const haloHalf = config.haloSize / 2;
  const halo = document.createElement("div");
  halo.style.position = "fixed";
  halo.style.left = `${anchor.x - haloHalf}px`;
  halo.style.top = `${anchor.y - haloHalf}px`;
  halo.style.width = `${config.haloSize}px`;
  halo.style.height = `${config.haloSize}px`;
  halo.style.borderRadius = "999px";
  halo.style.pointerEvents = "none";
  halo.style.background = `radial-gradient(circle, ${config.glow} 0%, rgba(255,255,255,0) 70%)`;
  halo.style.zIndex = String(Z_INDEX_TOP);
  host.appendChild(halo);
  halo.animate(
    [
      { opacity: 0, transform: "scale(0.2)" },
      { opacity: 1, transform: "scale(1.15)" },
      {
        opacity: 0,
        transform: `translate(${directionX * config.haloDriftX}px, ${directionY * config.haloDriftY}px) scale(1.9)`
      }
    ],
    { duration: config.haloDuration, easing: "ease-out" }
  ).onfinish = () => halo.remove();

  for (let i = 0; i < config.count; i += 1) {
    const particle = document.createElement("span");
    const forward = 28 + Math.random() * config.spread;
    const side = (Math.random() - 0.5) * config.burstWidth;
    const flameRise = -10 - Math.random() * 28;
    const driftX = directionX * forward + (-directionY * side);
    const driftY = directionY * forward + (directionX * side * 0.18) + flameRise;
    const size = config.baseSize + Math.random() * config.baseSize;
    particle.style.position = "fixed";
    particle.style.left = `${anchor.x}px`;
    particle.style.top = `${anchor.y}px`;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.borderRadius = Math.random() > 0.25 ? "999px" : "3px";
    particle.style.pointerEvents = "none";
    particle.style.opacity = "0";
    particle.style.zIndex = String(Z_INDEX_TOP);
    const color = config.colors[i % config.colors.length];
    particle.style.background = `radial-gradient(circle, ${color} 0%, rgba(255,255,255,0.95) 24%, rgba(255,255,255,0) 74%)`;
    particle.style.boxShadow = `0 0 20px ${color}`;
    particle.style.filter = "blur(0.2px)";
    host.appendChild(particle);

    const tail = document.createElement("span");
    tail.style.position = "fixed";
    tail.style.left = `${anchor.x}px`;
    tail.style.top = `${anchor.y}px`;
    tail.style.width = `${config.tailLength + Math.random() * 18}px`;
    tail.style.height = `${Math.max(6, size * 0.85)}px`;
    tail.style.borderRadius = "999px";
    tail.style.pointerEvents = "none";
    tail.style.opacity = "0";
    tail.style.zIndex = String(Z_INDEX_TOP);
    tail.style.transformOrigin = "left center";
    tail.style.background = `linear-gradient(90deg, ${color}, rgba(255,255,255,0.0))`;
    tail.style.filter = "blur(2px)";
    host.appendChild(tail);

    const angleDeg = Math.atan2(driftY, driftX) * 180 / Math.PI;
    const animation = particle.animate(
      [
        { opacity: 0, transform: "translate(-50%, -50%) scale(0.45)" },
        { opacity: 1, transform: "translate(-50%, -50%) scale(1.2)" },
        { opacity: 0, transform: `translate(calc(-50% + ${driftX}px), calc(-50% + ${driftY}px)) scale(0.18)` }
      ],
      {
        duration: config.particleDuration + Math.random() * (config.particleDuration * 0.45),
        easing: "cubic-bezier(.18,.72,.18,1)"
      }
    );
    const tailAnimation = tail.animate(
      [
        {
          opacity: 0,
          transform: `translate(-4px, -50%) rotate(${angleDeg}deg) scaleX(0.3)`
        },
        {
          opacity: 0.82,
          transform: `translate(-4px, -50%) rotate(${angleDeg}deg) scaleX(1)`
        },
        {
          opacity: 0,
          transform: `translate(${driftX * 0.62}px, calc(-50% + ${driftY * 0.62}px)) rotate(${angleDeg}deg) scaleX(0.16)`
        }
      ],
      {
        duration: config.tailDuration + Math.random() * (config.tailDuration * 0.4),
        easing: "ease-out"
      }
    );
    animation.onfinish = () => particle.remove();
    tailAnimation.onfinish = () => tail.remove();
  }
}

function renderMagicCircleInsertEffect(host, anchor, directionX, directionY, config) {
  const ringSize = config.haloSize * 1.35;
  const ringHalf = ringSize / 2;
  const ring = document.createElement("div");
  ring.style.position = "fixed";
  ring.style.left = `${anchor.x - ringHalf}px`;
  ring.style.top = `${anchor.y - ringHalf}px`;
  ring.style.width = `${ringSize}px`;
  ring.style.height = `${ringSize}px`;
  ring.style.borderRadius = "999px";
  ring.style.pointerEvents = "none";
  ring.style.zIndex = String(Z_INDEX_TOP);
  ring.style.border = `1.5px solid ${config.ringColor}`;
  ring.style.boxShadow = `0 0 18px ${config.ringColor}, inset 0 0 18px rgba(255,255,255,0.08)`;
  ring.style.background = `radial-gradient(circle, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 62%)`;
  host.appendChild(ring);
  ring.animate(
    [
      { opacity: 0, transform: "scale(0.32) rotate(0deg)" },
      { opacity: 0.96, transform: "scale(1) rotate(50deg)" },
      {
        opacity: 0,
        transform: `translate(${directionX * 26}px, ${directionY * 14}px) scale(1.55) rotate(120deg)`
      }
    ],
    { duration: config.ringDuration, easing: "cubic-bezier(.2,.8,.2,1)" }
  ).onfinish = () => ring.remove();

  const core = document.createElement("div");
  core.style.position = "fixed";
  core.style.left = `${anchor.x - config.baseSize * 2}px`;
  core.style.top = `${anchor.y - config.baseSize * 2}px`;
  core.style.width = `${config.baseSize * 4}px`;
  core.style.height = `${config.baseSize * 4}px`;
  core.style.borderRadius = "999px";
  core.style.pointerEvents = "none";
  core.style.zIndex = String(Z_INDEX_TOP);
  core.style.background = `radial-gradient(circle, ${config.glow} 0%, rgba(255,255,255,0) 70%)`;
  host.appendChild(core);
  core.animate(
    [
      { opacity: 0, transform: "scale(0.2)" },
      { opacity: 1, transform: "scale(1.3)" },
      { opacity: 0, transform: "scale(2.4)" }
    ],
    { duration: config.haloDuration, easing: "ease-out" }
  ).onfinish = () => core.remove();

  for (let i = 0; i < config.count; i += 1) {
    const color = config.colors[i % config.colors.length];
    const flare = document.createElement("span");
    const forward = 42 + Math.random() * (config.spread * 1.08);
    const side = (Math.random() - 0.5) * (config.burstWidth * 1.2);
    const lift = -18 - Math.random() * 36;
    const driftX = directionX * forward + (-directionY * side);
    const driftY = directionY * forward + (directionX * side * 0.24) + lift;
    const size = config.baseSize * (1.2 + Math.random() * 1.3);
    flare.style.position = "fixed";
    flare.style.left = `${anchor.x}px`;
    flare.style.top = `${anchor.y}px`;
    flare.style.width = `${size}px`;
    flare.style.height = `${Math.max(8, size * 0.7)}px`;
    flare.style.borderRadius = "999px";
    flare.style.pointerEvents = "none";
    flare.style.opacity = "0";
    flare.style.zIndex = String(Z_INDEX_TOP);
    flare.style.background = `linear-gradient(90deg, rgba(255,255,255,0.98), ${color} 40%, rgba(255,255,255,0) 100%)`;
    flare.style.boxShadow = `0 0 20px ${color}`;
    flare.style.filter = "blur(1.4px)";
    host.appendChild(flare);
    const angleDeg = Math.atan2(driftY, driftX) * 180 / Math.PI;
    const anim = flare.animate(
      [
        { opacity: 0, transform: `translate(-8px, -50%) rotate(${angleDeg}deg) scaleX(0.12)` },
        { opacity: 1, transform: `translate(-8px, -50%) rotate(${angleDeg}deg) scaleX(1)` },
        {
          opacity: 0,
          transform: `translate(${driftX * 0.82}px, calc(-50% + ${driftY * 0.82}px)) rotate(${angleDeg}deg) scaleX(0.1)`
        }
      ],
      {
        duration: config.particleDuration + Math.random() * (config.particleDuration * 0.35),
        easing: "cubic-bezier(.14,.74,.2,1)"
      }
    );
    anim.onfinish = () => flare.remove();
  }
}

function renderNebulaTrailInsertEffect(host, anchor, directionX, directionY, config) {
  const cloud = document.createElement("div");
  const cloudSize = config.haloSize * 1.12;
  cloud.style.position = "fixed";
  cloud.style.left = `${anchor.x - cloudSize / 2}px`;
  cloud.style.top = `${anchor.y - cloudSize / 2}px`;
  cloud.style.width = `${cloudSize}px`;
  cloud.style.height = `${cloudSize}px`;
  cloud.style.borderRadius = "999px";
  cloud.style.pointerEvents = "none";
  cloud.style.zIndex = String(Z_INDEX_TOP);
  cloud.style.background = `radial-gradient(circle, ${config.glow} 0%, rgba(255,255,255,0) 72%)`;
  cloud.style.filter = "blur(4px)";
  host.appendChild(cloud);
  cloud.animate(
    [
      { opacity: 0, transform: "scale(0.4)" },
      { opacity: 1, transform: "scale(1.18)" },
      { opacity: 0, transform: `translate(${directionX * 22}px, ${directionY * 10}px) scale(1.8)` }
    ],
    { duration: config.haloDuration, easing: "ease-out" }
  ).onfinish = () => cloud.remove();

  for (let i = 0; i < config.count; i += 1) {
    const dust = document.createElement("span");
    const forward = 18 + Math.random() * config.spread;
    const side = (Math.random() - 0.5) * config.burstWidth;
    const driftX = directionX * forward + (-directionY * side);
    const driftY = directionY * forward + side * 0.12 - 20 - Math.random() * 26;
    const size = config.baseSize * (0.8 + Math.random() * 1.4);
    const color = config.colors[i % config.colors.length];
    dust.style.position = "fixed";
    dust.style.left = `${anchor.x}px`;
    dust.style.top = `${anchor.y}px`;
    dust.style.width = `${size}px`;
    dust.style.height = `${size}px`;
    dust.style.borderRadius = "999px";
    dust.style.pointerEvents = "none";
    dust.style.opacity = "0";
    dust.style.zIndex = String(Z_INDEX_TOP);
    dust.style.background = color;
    dust.style.boxShadow = `0 0 18px ${color}`;
    host.appendChild(dust);
    const anim = dust.animate(
      [
        { opacity: 0, transform: "translate(-50%, -50%) scale(0.2)" },
        { opacity: 0.95, transform: "translate(-50%, -50%) scale(1)" },
        { opacity: 0, transform: `translate(calc(-50% + ${driftX}px), calc(-50% + ${driftY}px)) scale(0.3)` }
      ],
      {
        duration: config.particleDuration + Math.random() * (config.particleDuration * 0.5),
        easing: "cubic-bezier(.2,.72,.2,1)"
      }
    );
    anim.onfinish = () => dust.remove();
  }
}

function renderPixelBurstInsertEffect(host, anchor, directionX, directionY, config) {
  const halo = document.createElement("div");
  halo.style.position = "fixed";
  halo.style.left = `${anchor.x - config.haloSize / 2}px`;
  halo.style.top = `${anchor.y - config.haloSize / 2}px`;
  halo.style.width = `${config.haloSize}px`;
  halo.style.height = `${config.haloSize}px`;
  halo.style.pointerEvents = "none";
  halo.style.zIndex = String(Z_INDEX_TOP);
  halo.style.borderRadius = "14px";
  halo.style.background = `radial-gradient(circle, ${config.glow} 0%, rgba(255,255,255,0) 72%)`;
  host.appendChild(halo);
  halo.animate(
    [
      { opacity: 0, transform: "scale(0.3) rotate(0deg)" },
      { opacity: 1, transform: "scale(1) rotate(8deg)" },
      { opacity: 0, transform: `translate(${directionX * 18}px, ${directionY * 12}px) scale(1.6) rotate(14deg)` }
    ],
    { duration: config.haloDuration, easing: "ease-out" }
  ).onfinish = () => halo.remove();

  for (let i = 0; i < config.count; i += 1) {
    const px = document.createElement("span");
    const forward = 24 + Math.random() * config.spread;
    const side = (Math.random() - 0.5) * config.burstWidth;
    const driftX = directionX * forward + (-directionY * side);
    const driftY = directionY * forward + side * 0.22 - 10 - Math.random() * 20;
    const size = Math.max(6, Math.round(config.baseSize * (0.7 + Math.random() * 1.2)));
    const color = config.colors[i % config.colors.length];
    px.style.position = "fixed";
    px.style.left = `${anchor.x}px`;
    px.style.top = `${anchor.y}px`;
    px.style.width = `${size}px`;
    px.style.height = `${size}px`;
    px.style.pointerEvents = "none";
    px.style.opacity = "0";
    px.style.zIndex = String(Z_INDEX_TOP);
    px.style.borderRadius = "3px";
    px.style.background = color;
    px.style.boxShadow = `0 0 12px ${color}`;
    host.appendChild(px);
    const anim = px.animate(
      [
        { opacity: 0, transform: "translate(-50%, -50%) scale(0.4) rotate(0deg)" },
        { opacity: 1, transform: "translate(-50%, -50%) scale(1) rotate(8deg)" },
        { opacity: 0, transform: `translate(calc(-50% + ${driftX}px), calc(-50% + ${driftY}px)) scale(0.5) rotate(28deg)` }
      ],
      {
        duration: config.particleDuration * 0.88 + Math.random() * (config.particleDuration * 0.38),
        easing: "cubic-bezier(.18,.74,.18,1)"
      }
    );
    anim.onfinish = () => px.remove();
  }
}

function renderLightningArcInsertEffect(host, anchor, directionX, directionY, config) {
  const arcCount = Math.max(3, Math.round(config.count / 8));
  for (let i = 0; i < arcCount; i += 1) {
    const arc = document.createElement("div");
    const width = config.tailLength + 28 + Math.random() * config.spread * 0.45;
    const angle = Math.atan2(directionY, directionX) * 180 / Math.PI + (Math.random() - 0.5) * 22;
    const color = config.colors[i % config.colors.length];
    arc.style.position = "fixed";
    arc.style.left = `${anchor.x}px`;
    arc.style.top = `${anchor.y}px`;
    arc.style.width = `${width}px`;
    arc.style.height = `${Math.max(8, config.baseSize * (1.1 + Math.random() * 0.7))}px`;
    arc.style.borderRadius = "999px";
    arc.style.pointerEvents = "none";
    arc.style.opacity = "0";
    arc.style.zIndex = String(Z_INDEX_TOP);
    arc.style.transformOrigin = "left center";
    arc.style.background = `linear-gradient(90deg, rgba(255,255,255,0.98), ${color} 28%, rgba(255,255,255,0) 100%)`;
    arc.style.filter = "blur(1px)";
    arc.style.boxShadow = `0 0 16px ${color}`;
    host.appendChild(arc);
    const driftX = directionX * (28 + Math.random() * 30);
    const driftY = directionY * (14 + Math.random() * 16) + (Math.random() - 0.5) * 10;
    const anim = arc.animate(
      [
        { opacity: 0, transform: `translate(-6px, -50%) rotate(${angle}deg) scaleX(0.1)` },
        { opacity: 1, transform: `translate(-6px, -50%) rotate(${angle}deg) scaleX(1)` },
        { opacity: 0, transform: `translate(${driftX}px, calc(-50% + ${driftY}px)) rotate(${angle + 6}deg) scaleX(0.2)` }
      ],
      {
        duration: config.tailDuration * 0.72 + Math.random() * (config.tailDuration * 0.28),
        easing: "cubic-bezier(.2,.86,.2,1)"
      }
    );
    anim.onfinish = () => arc.remove();
  }

  for (let i = 0; i < config.count; i += 1) {
    const spark = document.createElement("span");
    const forward = 18 + Math.random() * config.spread;
    const side = (Math.random() - 0.5) * config.burstWidth;
    const driftX = directionX * forward + (-directionY * side);
    const driftY = directionY * forward + side * 0.18 - 12 - Math.random() * 18;
    const color = config.colors[i % config.colors.length];
    const size = Math.max(4, config.baseSize * (0.55 + Math.random() * 0.7));
    spark.style.position = "fixed";
    spark.style.left = `${anchor.x}px`;
    spark.style.top = `${anchor.y}px`;
    spark.style.width = `${size}px`;
    spark.style.height = `${size * 1.8}px`;
    spark.style.pointerEvents = "none";
    spark.style.opacity = "0";
    spark.style.zIndex = String(Z_INDEX_TOP);
    spark.style.borderRadius = "3px";
    spark.style.background = color;
    spark.style.boxShadow = `0 0 14px ${color}`;
    host.appendChild(spark);
    const anim = spark.animate(
      [
        { opacity: 0, transform: "translate(-50%, -50%) scaleY(0.3) rotate(0deg)" },
        { opacity: 1, transform: "translate(-50%, -50%) scaleY(1.1) rotate(8deg)" },
        { opacity: 0, transform: `translate(calc(-50% + ${driftX}px), calc(-50% + ${driftY}px)) scaleY(0.4) rotate(18deg)` }
      ],
      {
        duration: config.particleDuration * 0.72 + Math.random() * (config.particleDuration * 0.22),
        easing: "ease-out"
      }
    );
    anim.onfinish = () => spark.remove();
  }
}

function renderFeatherStreamInsertEffect(host, anchor, directionX, directionY, config) {
  const halo = document.createElement("div");
  const haloSize = config.haloSize * 1.18;
  halo.style.position = "fixed";
  halo.style.left = `${anchor.x - haloSize / 2}px`;
  halo.style.top = `${anchor.y - haloSize / 2}px`;
  halo.style.width = `${haloSize}px`;
  halo.style.height = `${haloSize}px`;
  halo.style.borderRadius = "999px";
  halo.style.pointerEvents = "none";
  halo.style.zIndex = String(Z_INDEX_TOP);
  halo.style.background = `radial-gradient(circle, ${config.glow} 0%, rgba(255,255,255,0) 72%)`;
  halo.style.filter = "blur(3px)";
  host.appendChild(halo);
  halo.animate(
    [
      { opacity: 0, transform: "scale(0.35)" },
      { opacity: 1, transform: "scale(1.08)" },
      { opacity: 0, transform: `translate(${directionX * 24}px, ${directionY * 12}px) scale(1.7)` }
    ],
    { duration: config.haloDuration, easing: "ease-out" }
  ).onfinish = () => halo.remove();

  for (let i = 0; i < config.count; i += 1) {
    const feather = document.createElement("span");
    const forward = 24 + Math.random() * config.spread;
    const side = (Math.random() - 0.5) * config.burstWidth;
    const driftX = directionX * forward + (-directionY * side);
    const driftY = directionY * forward + (directionX * side * 0.14) - 16 - Math.random() * 22;
    const size = config.baseSize * (1 + Math.random() * 1.1);
    const color = config.colors[i % config.colors.length];
    feather.style.position = "fixed";
    feather.style.left = `${anchor.x}px`;
    feather.style.top = `${anchor.y}px`;
    feather.style.width = `${config.tailLength + Math.random() * 20}px`;
    feather.style.height = `${Math.max(6, size)}px`;
    feather.style.borderRadius = "999px 90% 90% 999px";
    feather.style.pointerEvents = "none";
    feather.style.opacity = "0";
    feather.style.zIndex = String(Z_INDEX_TOP);
    feather.style.transformOrigin = "left center";
    feather.style.background = `linear-gradient(90deg, ${color}, ${toRgba(color, 0.2)} 72%, rgba(255,255,255,0) 100%)`;
    feather.style.filter = "blur(1.2px)";
    feather.style.boxShadow = `0 0 16px ${color}`;
    host.appendChild(feather);
    const angleDeg = Math.atan2(driftY, driftX) * 180 / Math.PI;
    const anim = feather.animate(
      [
        { opacity: 0, transform: `translate(-6px, -50%) rotate(${angleDeg}deg) scaleX(0.25)` },
        { opacity: 0.95, transform: `translate(-6px, -50%) rotate(${angleDeg}deg) scaleX(1)` },
        { opacity: 0, transform: `translate(${driftX * 0.85}px, calc(-50% + ${driftY * 0.85}px)) rotate(${angleDeg + 8}deg) scaleX(0.2)` }
      ],
      {
        duration: config.tailDuration + Math.random() * (config.tailDuration * 0.35),
        easing: "cubic-bezier(.18,.8,.18,1)"
      }
    );
    anim.onfinish = () => feather.remove();
  }
}

function ensureInsertFxHost() {
  if (insertionFxState.host && insertionFxState.host.isConnected) {
    return insertionFxState.host;
  }
  const host = document.createElement("div");
  host.id = "tb-insert-fx-host";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.pointerEvents = "none";
  host.style.zIndex = String(Z_INDEX_TOP);
  document.documentElement.appendChild(host);
  insertionFxState.host = host;
  return host;
}

function getInsertFxAnchorFromContext(context) {
  if (!context || !context.target) {
    return getFallbackInsertFxAnchor();
  }
  if (context.target instanceof HTMLInputElement || context.target instanceof HTMLTextAreaElement) {
    const textPoint = getTextControlTriggerPoint(
      context.target,
      typeof context.triggerStart === "number"
        ? context.triggerStart + Math.max(0, context.prefix.length - 1)
        : 0
    );
    if (textPoint) return textPoint;
  }
  if (context.target && context.target.isContentEditable) {
    const editablePoint = getContentEditableTriggerPoint(
      context.target,
      typeof context.triggerStart === "number"
        ? context.triggerStart + Math.max(0, context.prefix.length - 1)
        : 0
    );
    if (editablePoint) return editablePoint;
  }
  return getElementInsertFxAnchor(context.target);
}

function getPanelAnchorFromContext(context) {
  if (!context || !context.target) {
    return getFallbackInsertFxAnchor();
  }
  if (context.target instanceof HTMLInputElement || context.target instanceof HTMLTextAreaElement) {
    const point = getTextControlTriggerPoint(
      context.target,
      typeof context.triggerStart === "number"
        ? context.triggerStart + Math.max(0, context.prefix.length - 1)
        : 0
    );
    if (point) return point;
  }
  if (context.target && context.target.isContentEditable) {
    const point = getContentEditableTriggerPoint(
      context.target,
      typeof context.triggerStart === "number"
        ? context.triggerStart + Math.max(0, context.prefix.length - 1)
        : 0
    );
    if (point) return point;
  }
  return getElementInsertFxAnchor(context.target);
}

function getTextControlTriggerPoint(target, charIndex) {
  const style = window.getComputedStyle(target);
  const rect = target.getBoundingClientRect();
  const mirror = document.createElement("div");
  mirror.style.position = "fixed";
  mirror.style.left = "-99999px";
  mirror.style.top = "0";
  mirror.style.whiteSpace = target instanceof HTMLTextAreaElement ? "pre-wrap" : "pre";
  mirror.style.wordWrap = "break-word";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.font = style.font;
  mirror.style.fontSize = style.fontSize;
  mirror.style.fontFamily = style.fontFamily;
  mirror.style.fontWeight = style.fontWeight;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.padding = style.padding;
  mirror.style.border = style.border;
  mirror.style.boxSizing = style.boxSizing;
  mirror.style.width = `${rect.width}px`;
  mirror.style.height = `${rect.height}px`;
  mirror.style.overflow = "hidden";
  const text = target.value.slice(0, Math.max(0, charIndex));
  mirror.textContent = text;
  const marker = document.createElement("span");
  marker.textContent = target.value.charAt(charIndex) || " ";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const mirrorRect = mirror.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  mirror.remove();
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) || 16;
  return {
    x: rect.left + (markerRect.left - mirrorRect.left) - target.scrollLeft + 4,
    y: rect.top + (markerRect.top - mirrorRect.top) - target.scrollTop + Math.max(8, lineHeight * 0.5),
    directionX: 1,
    directionY: 0
  };
}

function getContentEditableTriggerPoint(target, charIndex) {
  const range = createTextOffsetRange(target, charIndex);
  if (!range) return null;
  const rect = range.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) return null;
  return {
    x: rect.left + Math.max(4, rect.width / 2),
    y: rect.top + Math.max(8, rect.height / 2),
    directionX: 1,
    directionY: 0
  };
}

function createTextOffsetRange(root, charIndex) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, charIndex);
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent ? node.textContent.length : 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, Math.min(remaining, length));
      range.setEnd(node, Math.min(remaining + 1, length));
      return range;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  return null;
}

function getElementInsertFxAnchor(target) {
  if (target && target.isContentEditable) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect && (rect.width || rect.height)) {
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          directionX: 1,
          directionY: 0
        };
      }
    }
  }
  if (target instanceof HTMLElement) {
    const rect = target.getBoundingClientRect();
    return {
      x: rect.right - Math.min(42, rect.width * 0.15),
      y: rect.top + Math.min(rect.height / 2, 24),
      directionX: 1,
      directionY: 0
    };
  }
  return getFallbackInsertFxAnchor();
}

function getFallbackInsertFxAnchor() {
  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    directionX: 1,
    directionY: 0
  };
}

async function increaseSnippetUse(id) {
  await storageLib.increaseSnippetUse(id, normalizeSnippets, settings.triggerPrefixes);
}

async function trackFeatureUsage(type, payload = {}) {
  if (!storageLib || typeof storageLib.increaseFeatureUsage !== "function") return;
  await storageLib.increaseFeatureUsage((stats) => {
    const next = cloneFeatureUsageStats(stats);
    bumpUsageEntry(next.total);
    if (type === "monkey-copy") {
      bumpUsageEntry(next.monkeyCopy);
    } else if (type === "monkey-search") {
      bumpUsageEntry(next.monkeySearch);
    } else if (type === "ai-reply") {
      if (payload.branchId) {
        bumpUsageEntry(ensureUsageEntryMapItem(next.aiReplyBranches, payload.branchId));
      } else if (payload.hasIntent) {
        bumpUsageEntry(next.aiReplyWithIntent);
      } else {
        bumpUsageEntry(next.aiReplyDefault);
      }
    } else if (type === "ai-extension" && payload.ruleId) {
      bumpUsageEntry(ensureUsageEntryMapItem(next.aiExtensionRules, payload.ruleId));
    }
    return next;
  }, normalizeSettings);
}

function cloneFeatureUsageStats(raw) {
  const stats = raw && typeof raw === "object" ? raw : {};
  return {
    total: cloneUsageEntry(stats.total),
    aiReplyDefault: cloneUsageEntry(stats.aiReplyDefault),
    aiReplyWithIntent: cloneUsageEntry(stats.aiReplyWithIntent),
    aiReplyBranches: cloneUsageEntryMap(stats.aiReplyBranches),
    aiExtensionRules: cloneUsageEntryMap(stats.aiExtensionRules),
    monkeyCopy: cloneUsageEntry(stats.monkeyCopy),
    monkeySearch: cloneUsageEntry(stats.monkeySearch)
  };
}

function cloneUsageEntry(raw) {
  return {
    count: Number(raw?.count || 0),
    lastUsedAt: raw?.lastUsedAt ? String(raw.lastUsedAt) : undefined
  };
}

function cloneUsageEntryMap(raw) {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, cloneUsageEntry(value)])
  );
}

function ensureUsageEntryMapItem(map, key) {
  if (!map[key]) {
    map[key] = cloneUsageEntry();
  }
  return map[key];
}

function bumpUsageEntry(entry) {
  entry.count = Number(entry.count || 0) + 1;
  entry.lastUsedAt = new Date().toISOString();
}

function extractVariables(content) {
  const regex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
  const vars = new Set();
  let match;
  while ((match = regex.exec(content))) {
    vars.add(match[1]);
  }
  return [...vars];
}

function fillTemplate(content, customValues) {
  return content.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
    if (key === "date") {
      const now = new Date();
      return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    }
    if (key === "time") {
      const now = new Date();
      return `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
    }
    if (key === "signature") {
      return settings.defaultSignature || "";
    }
    return customValues[key] ?? "";
  });
}

function pad2(v) {
  return String(v).padStart(2, "0");
}

function collectCustomVariables(names) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.background = "rgba(0,0,0,.45)";
    overlay.style.zIndex = String(Z_INDEX_TOP);
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    const modal = document.createElement("div");
    modal.style.width = "420px";
    modal.style.maxWidth = "95vw";
    modal.style.background = "#fff";
    modal.style.borderRadius = "10px";
    modal.style.padding = "16px";
    modal.style.boxShadow = "0 10px 28px rgba(0,0,0,.2)";
    modal.style.font = "14px/1.4 -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif";
    modal.innerHTML = `<h3 style="margin:0 0 12px 0;font-size:16px;">请填写变量</h3>`;

    const inputs = {};
    names.forEach((name) => {
      const row = document.createElement("div");
      row.style.marginBottom = "10px";
      row.innerHTML = `<div style="margin-bottom:4px;color:#333;">${escapeHtml(name)}</div>`;
      const input = document.createElement("input");
      input.type = "text";
      input.style.width = "100%";
      input.style.boxSizing = "border-box";
      input.style.padding = "8px";
      input.style.border = "1px solid #ccc";
      input.style.borderRadius = "6px";
      row.appendChild(input);
      modal.appendChild(row);
      inputs[name] = input;
    });

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";
    actions.style.gap = "8px";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    cancel.style.padding = "6px 10px";
    cancel.style.border = "1px solid #ddd";
    cancel.style.background = "#fff";
    cancel.style.borderRadius = "6px";

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = "确认";
    confirm.style.padding = "6px 10px";
    confirm.style.border = "1px solid #1677ff";
    confirm.style.background = "#1677ff";
    confirm.style.color = "#fff";
    confirm.style.borderRadius = "6px";

    actions.appendChild(cancel);
    actions.appendChild(confirm);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    cancel.addEventListener("click", () => close(null));
    confirm.addEventListener("click", () => {
      const values = {};
      names.forEach((name) => {
        values[name] = (inputs[name].value || "").trim();
      });
      close(values);
    });
  });
}

function getEditableTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  const node = target.closest("input,textarea,[contenteditable=''],[contenteditable='true']");
  const editableNode = node || target.closest("input,textarea,[contenteditable]");
  if (!editableNode) return null;
  if (editableNode instanceof HTMLInputElement) {
    if (editableNode.disabled || editableNode.readOnly) return null;
    if ((editableNode.type || "").toLowerCase() === "password") return null;
    const sensitiveTokens = ["password", "pwd", "secret", "token", "otp", "验证码"];
    const joined = `${editableNode.name || ""} ${editableNode.id || ""} ${editableNode.autocomplete || ""} ${editableNode.placeholder || ""}`.toLowerCase();
    if (sensitiveTokens.some((s) => joined.includes(s.toLowerCase()))) {
      return null;
    }
    return editableNode;
  }
  if (editableNode instanceof HTMLTextAreaElement) {
    if (editableNode.disabled || editableNode.readOnly) return null;
    return editableNode;
  }
  if (editableNode instanceof HTMLElement && editableNode.isContentEditable) {
    return editableNode;
  }
  return null;
}

function getEventEditableTarget(event) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : null;
  if (Array.isArray(path) && path.length > 0) {
    for (const node of path) {
      if (node instanceof Element) {
        const editable = getEditableTarget(node);
        if (editable) return editable;
      }
    }
  }
  return getEditableTarget(event.target);
}

function isCurrentSiteBlacklisted() {
  const host = location.hostname || "";
  return settings.blacklistSites.some((site) => {
    const domain = String(site || "").trim().toLowerCase();
    if (!domain) return false;
    return host === domain || host.endsWith(`.${domain}`);
  });
}

function normalizeSnippets(list, triggerPrefixes = ["/", "、"]) {
  return settingsLib.normalizeSnippets(list, triggerPrefixes);
}

function normalizeSettings(raw) {
  return settingsLib.normalizeSettings(raw);
}

function applyPanelStyles() {
  panelLib.applyPanelStyles(uiState, settings, clampNumber);
}

function matchesQuery(shortcutNormalized, queryNormalized, mode) {
  if (!queryNormalized) return false;
  if (mode === "exact") return shortcutNormalized === queryNormalized;
  if (mode === "contains") return shortcutNormalized.includes(queryNormalized);
  return shortcutNormalized.startsWith(queryNormalized);
}

function parseTriggerPrefixes(raw) {
  return settingsLib.parseTriggerPrefixes(raw);
}

function normalizeQuery(raw) {
  return settingsLib.normalizeQuery(raw);
}

function normalizeStoredShortcut(raw, triggerPrefixes) {
  return settingsLib.normalizeStoredShortcut(raw, triggerPrefixes);
}

function clampNumber(value, min, max, fallback) {
  return settingsLib.clampNumber(value, min, max, fallback);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => fn(...args), wait);
  };
}
