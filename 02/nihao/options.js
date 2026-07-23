const STORAGE_KEYS = {
  SNIPPETS: "tb-snippets",
  SETTINGS: "tb-settings",
  PENDING_SNIPPET: "tb-pending-snippet",
  QUICK_CLICK_PENDING_TARGET: "tb-quick-click-pending-target"
};

const MAX_IMPORT_ROWS = 1000;
const SNIPPET_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_SHUNFENGER_LEVELS = [
  { id: "high", label: "高意向", color: "#f472b6" },
  { id: "medium", label: "中意向", color: "#a855f7" },
  { id: "low", label: "低意向", color: "#60a5fa" }
];
const VERSION_HISTORY = [
  {
    version: "2.0.7",
    notes: "受害马喽启用标签页池复用与页面早期采集，减少批量任务等待时间。"
  },
  {
    version: "2.0.6",
    notes: "受害马喽并发页面改为数字输入，支持设置 1 至 10 个并发任务。"
  },
  {
    version: "2.0.5",
    notes: "受害马喽新增“复制全部”，昵称、ID 与真实头像使用统一剪贴板格式。"
  },
  {
    version: "2.0.4",
    notes: "新增受害马喽：按用户 ID 批量采集昵称、ID 和真实头像，并写入腾讯文档表格。"
  },
  {
    version: "2.0.3",
    notes: "图片话术支持 10MB 以内图片；顺风耳意向等级支持自定义名称与颜色。"
  },
  {
    version: "2.0.0",
    notes: "新增顺风耳 SCRM 监听模块：popup 提供启动入口，启动后打开原顺风耳侧边栏。"
  },
  {
    version: "1.9.6",
    notes: "新增图片自动确认策略：支持‘自动发送’与‘回车发送’两种模式；popup 与设置页可直接切换并持久化。"
  },
  {
    version: "1.9.5",
    notes: "新增快捷点击调试选项，支持通过快捷键点击选取的元素或坐标"
  },
  {
    version: "1.8.0",
    notes: "优化联想框布局与定位，新增 4 种填入特效，并增强插件面板状态保存"
  },
  {
    version: "1.1.0",
    notes: "新增首次激活码、猴目开关、中央猴图、猴名备忘录与 Web3 紫黑界面"
  },
  {
    version: "1.0.0",
    notes: "初始版本，提供快捷补全、AI 建议、基础设置与话术管理"
  }
];

const LEGACY_AI_REPLY_PROMPT = "以下是聊天上下文：\n{{context}}\n\n请输出 {{count}} 条回复建议，要求：\n1) 每条一句，口语自然；\n2) 语气礼貌；\n3) 不要编造事实；\n4) 每条前加序号。";
const DEFAULT_CHANGE_ESSAY_TEMPLATE = "【异动处理】\n学员：{{名字}}\n课程：{{课程}}\n金额：{{金额}}\n\n您好，已收到您关于课程异动的申请，当前为您登记的信息如下：\n1. 学员姓名：{{名字}}\n2. 涉及课程：{{课程}}\n3. 涉及金额：{{金额}}\n\n我们会尽快为您核对并推进处理，如有进一步结果会第一时间同步给您。";

function createDefaultFeatureUsageStats() {
  return {
    total: { count: 0, lastUsedAt: undefined },
    aiReplyDefault: { count: 0, lastUsedAt: undefined },
    aiReplyWithIntent: { count: 0, lastUsedAt: undefined },
    aiReplyBranches: {},
    aiExtensionRules: {},
    monkeyCopy: { count: 0, lastUsedAt: undefined },
    monkeySearch: { count: 0, lastUsedAt: undefined }
  };
}

function normalizeUsageEntry(raw) {
  return {
    count: Number(raw?.count || 0),
    lastUsedAt: raw?.lastUsedAt ? String(raw.lastUsedAt) : undefined
  };
}

function normalizeUsageEntryMap(raw) {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [String(key), normalizeUsageEntry(value)])
      .filter(([key]) => key)
  );
}

function normalizeFeatureUsageStats(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    total: normalizeUsageEntry(source.total),
    aiReplyDefault: normalizeUsageEntry(source.aiReplyDefault),
    aiReplyWithIntent: normalizeUsageEntry(source.aiReplyWithIntent),
    aiReplyBranches: normalizeUsageEntryMap(source.aiReplyBranches),
    aiExtensionRules: normalizeUsageEntryMap(source.aiExtensionRules),
    monkeyCopy: normalizeUsageEntry(source.monkeyCopy),
    monkeySearch: normalizeUsageEntry(source.monkeySearch)
  };
}

const DEFAULT_SETTINGS = {
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
  aiReplyPrompt: "以下是聊天上下文：\n{{context}}\n\n请输出 {{count}} 条回复建议，要求：\n1) 每条一句，口语自然；\n2) 语气礼貌；\n3) 不要编造事实；\n4) 每条前加序号。",
  aiReplyPromptWithIntent: "以下是聊天上下文：\n{{context}}\n\n{{intent_block}}请输出 {{count}} 条回复建议，要求：\n1) 优先满足额外要求；\n2) 每条一句，口语自然；\n3) 语气礼貌；\n4) 不要编造事实；\n5) 每条前加序号。",
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
  quickClickRules: [],
  featureUsageStats: createDefaultFeatureUsageStats()
};

let state = {
  snippets: [],
  settings: { ...DEFAULT_SETTINGS },
  filtered: [],
  pendingImportedRows: [],
  editingId: null, // 用于记录当前正在编辑的行ID
  skipAutoSaveId: null,
  filters: {
    keyword: "",
    category: "",
    prefix: "",
    sort: "lastUsedAt",
    uncategorizedOnly: false
  }
};
let imageDraft = null;
let shunfengerConfig = null;
let shunfengerSnapshot = null;

const el = {};

document.addEventListener("DOMContentLoaded", () => {
  collectElements();
  ensureFeedbackToastHost();
  bindEvents();
  void bootstrap();
});

async function bootstrap() {
  await loadStorage();
  await consumePendingSnippet();
  setSnippetTypeUI(getSnippetType() === "image");
  applyFiltersAndRender();
  fillSettingsForm();
  renderVersionInfo();
  await refreshShunfengerSettings();
  bindStorageWatchers();
}

function collectElements() {
  el.form = document.getElementById("snippet-form");
  el.snippetId = document.getElementById("snippet-id");
  el.snippetType = document.getElementById("snippet-type");
  el.title = document.getElementById("title");
  el.shortcut = document.getElementById("shortcut");
  el.category = document.getElementById("category");
  el.contentSection = document.getElementById("snippet-content-section");
  el.content = document.getElementById("content");
  el.imageSection = document.getElementById("snippet-image-section");
  el.imageUpload = document.getElementById("snippet-image-upload");
  el.imagePreviewWrap = document.getElementById("snippet-image-preview-wrap");
  el.imagePreview = document.getElementById("snippet-image-preview");
  el.imagePreviewName = document.getElementById("snippet-image-name");
  el.imagePreviewMime = document.getElementById("snippet-image-mime");
  el.imagePreviewSize = document.getElementById("snippet-image-size");
  el.imageAutoSendAfterInsert = document.getElementById("snippet-image-auto-send-after-insert");
  el.formTip = document.getElementById("form-tip");
  el.btnReset = document.getElementById("btn-reset");
  el.tbody = document.getElementById("snippet-tbody");
  el.listTip = document.getElementById("list-tip");
  el.selectAll = document.getElementById("selectAll");
  el.btnBatchDelete = document.getElementById("btn-batch-delete");

  el.searchKeyword = document.getElementById("search-keyword");
  el.filterCategory = document.getElementById("filter-category");
  el.filterPrefix = document.getElementById("filter-prefix");
  el.filterSort = document.getElementById("filter-sort");
  el.filterUncategorized = document.getElementById("filter-uncategorized");

  el.pasteArea = document.getElementById("excel-paste");
  el.importTip = document.getElementById("import-tip");
  el.btnImportApply = document.getElementById("btn-import-apply");
  el.importConflictMode = document.getElementById("import-conflict-mode");

  el.btnExport = document.getElementById("btn-export");
  el.inputImportJson = document.getElementById("input-import-json");

  el.settingsForm = document.getElementById("settings-form");
  el.aiSettingsForm = document.getElementById("ai-settings-form");
  el.changeHelperForm = document.getElementById("change-helper-form");
  el.shunfengerForm = document.getElementById("shunfenger-settings-form");
  el.sfRunningStatus = document.getElementById("sf-running-status");
  el.sfStatusTip = document.getElementById("sf-status-tip");
  el.sfPollInterval = document.getElementById("sf-poll-interval");
  el.sfPageSize = document.getElementById("sf-page-size");
  el.sfShowAllUnread = document.getElementById("sf-show-all-unread");
  el.sfAccountRows = document.getElementById("sf-account-rows");
  el.sfLevelRows = document.getElementById("sf-level-rows");
  el.sfKeywordRows = document.getElementById("sf-keyword-rows");
  el.sfBtnAddLevel = document.getElementById("sf-btn-add-level");
  el.sfBtnAddKeyword = document.getElementById("sf-btn-add-keyword");
  el.sfBtnImportAccounts = document.getElementById("sf-btn-import-accounts");
  el.sfBtnOpenPanel = document.getElementById("sf-btn-open-panel");
  el.sfSettingsTip = document.getElementById("sf-settings-tip");
  el.triggerPrefixes = document.getElementById("trigger-prefixes");
  el.defaultSignature = document.getElementById("default-signature");
  el.monkeyEyeEnabled = document.getElementById("monkey-eye-enabled");
  el.autoSendImageConfirm = document.getElementById("auto-send-image-confirm");
  el.imageAutoSendStrategy = document.getElementById("image-auto-send-strategy");
  el.imageAutoSendStrategyLabel = document.getElementById("image-auto-send-strategy-label");
  el.imageAutoSendStrategyToggle = document.getElementById("image-auto-send-strategy-toggle");
  el.imageAutoSendStrategyMenu = document.getElementById("image-auto-send-strategy-menu");
  el.activationStatus = document.getElementById("activation-status");
  el.activationCode = document.getElementById("activation-code");
  el.btnActivate = document.getElementById("btn-activate");
  el.completionMode = document.getElementById("completion-mode");
  el.matchMode = document.getElementById("match-mode");
  el.insertEffectScope = document.getElementById("insert-effect-scope");
  el.snippetEffectStyle = document.getElementById("snippet-effect-style");
  el.snippetEffectIntensity = document.getElementById("snippet-effect-intensity");
  el.snippetEffectSize = document.getElementById("snippet-effect-size");
  el.snippetEffectSpread = document.getElementById("snippet-effect-spread");
  el.snippetEffectDuration = document.getElementById("snippet-effect-duration");
  el.aiEffectStyle = document.getElementById("ai-effect-style");
  el.aiEffectIntensity = document.getElementById("ai-effect-intensity");
  el.aiEffectSize = document.getElementById("ai-effect-size");
  el.aiEffectSpread = document.getElementById("ai-effect-spread");
  el.aiEffectDuration = document.getElementById("ai-effect-duration");
  el.suggestionWidth = document.getElementById("suggestion-width");
  el.suggestionHeight = document.getElementById("suggestion-height");
  el.suggestionFontSize = document.getElementById("suggestion-font-size");
  el.suggestionRemoveHue = document.getElementById("suggestion-remove-hue");
  el.suggestionOpacity = document.getElementById("suggestion-opacity");
  el.suggestionSnippetDisplayMode = document.getElementById("suggestion-snippet-display-mode");
  el.suggestionSnippetPreviewLength = document.getElementById("suggestion-snippet-preview-length");
  el.suggestionOffsetX = document.getElementById("suggestion-offset-x");
  el.suggestionOffsetY = document.getElementById("suggestion-offset-y");
  el.suggestionExpandDirection = document.getElementById("suggestion-expand-direction");
  el.snippetEffectPrimaryColor = document.getElementById("snippet-effect-primary-color");
  el.snippetEffectAccentColor = document.getElementById("snippet-effect-accent-color");
  el.aiEffectPrimaryColor = document.getElementById("ai-effect-primary-color");
  el.aiEffectAccentColor = document.getElementById("ai-effect-accent-color");
  el.aiApiFormat = document.getElementById("ai-api-format");
  el.aiApiHostPreset = document.getElementById("ai-api-host-preset");
  el.aiApiBaseUrl = document.getElementById("ai-api-base-url");
  el.aiApiKey = document.getElementById("ai-api-key");
  el.aiModel = document.getElementById("ai-model");
  el.aiTriggerWord = document.getElementById("ai-trigger-word");
  el.aiSuggestCount = document.getElementById("ai-suggest-count");
  el.aiArgumentSeparator = document.getElementById("ai-argument-separator");
  el.aiSystemPrompt = document.getElementById("ai-system-prompt");
  el.aiReplyPrompt = document.getElementById("ai-reply-prompt");
  el.aiReplyPromptWithIntent = document.getElementById("ai-reply-prompt-with-intent");
  el.changeEssayTemplate = document.getElementById("change-essay-template");
  el.btnResetAi = document.getElementById("btn-reset-ai");
  el.aiReplyBranchForm = document.getElementById("ai-reply-branch-form");
  el.aiReplyBranchId = document.getElementById("ai-reply-branch-id");
  el.aiReplyBranchTitle = document.getElementById("ai-reply-branch-title");
  el.aiReplyBranchKeyword = document.getElementById("ai-reply-branch-keyword");
  el.aiReplyBranchPrompt = document.getElementById("ai-reply-branch-prompt");
  el.aiReplyBranchTip = document.getElementById("ai-reply-branch-tip");
  el.btnResetAiReplyBranch = document.getElementById("btn-reset-ai-reply-branch");
  el.aiReplyBranchTbody = document.getElementById("ai-reply-branch-tbody");
  el.aiExtensionRuleForm = document.getElementById("ai-extension-rule-form");
  el.aiExtensionRuleId = document.getElementById("ai-extension-rule-id");
  el.aiExtensionRuleTitle = document.getElementById("ai-extension-rule-title");
  el.aiExtensionRuleKeyword = document.getElementById("ai-extension-rule-keyword");
  el.aiExtensionRulePrompt = document.getElementById("ai-extension-rule-prompt");
  el.aiExtensionRuleTip = document.getElementById("ai-extension-rule-tip");
  el.btnResetAiExtensionRule = document.getElementById("btn-reset-ai-extension-rule");
  el.aiExtensionRuleTbody = document.getElementById("ai-extension-rule-tbody");
  el.blacklistSites = document.getElementById("blacklist-sites");
  el.quickClickId = document.getElementById("quick-click-id");
  el.quickClickName = document.getElementById("quick-click-name");
  el.quickClickHotkey = document.getElementById("quick-click-hotkey");
  el.quickClickMode = document.getElementById("quick-click-mode");
  el.quickClickUrlPattern = document.getElementById("quick-click-url-pattern");
  el.quickClickSelector = document.getElementById("quick-click-selector");
  el.quickClickX = document.getElementById("quick-click-x");
  el.quickClickY = document.getElementById("quick-click-y");
  el.quickClickClickType = document.getElementById("quick-click-click-type");
  el.quickClickEnabled = document.getElementById("quick-click-enabled");
  el.quickClickTip = document.getElementById("quick-click-tip");
  el.quickClickTbody = document.getElementById("quick-click-tbody");
  el.btnQuickClickSave = document.getElementById("btn-quick-click-save");
  el.btnQuickClickReset = document.getElementById("btn-quick-click-reset");
  el.btnQuickClickPickElement = document.getElementById("btn-quick-click-pick-element");
  el.btnQuickClickPickCoordinate = document.getElementById("btn-quick-click-pick-coordinate");
  el.btnQuickClickTest = document.getElementById("btn-quick-click-test");
  el.settingsTip = document.getElementById("settings-tip");
  el.aiSettingsTip = document.getElementById("ai-settings-tip");
  el.changeHelperTip = document.getElementById("change-helper-tip");
  el.headerVersion = document.getElementById("header-version");
  el.versionHistorySettings = document.getElementById("version-history-settings");
  el.pageSubtitle = document.getElementById("page-subtitle");
  el.usageTotalCount = document.getElementById("usage-total-count");
  el.usageSnippetTotal = document.getElementById("usage-snippet-total");
  el.usageAiTotal = document.getElementById("usage-ai-total");
  el.usageMonkeyTotal = document.getElementById("usage-monkey-total");
  el.usageAiTbody = document.getElementById("usage-ai-tbody");
  el.usageMonkeyTbody = document.getElementById("usage-monkey-tbody");
  el.usageSnippetTbody = document.getElementById("usage-snippet-tbody");
}

function bindEvents() {
  el.form.addEventListener("submit", onSaveSnippet);
  el.btnReset.addEventListener("click", resetSnippetForm);
  if (el.snippetType) {
    el.snippetType.addEventListener("change", onSnippetTypeChange);
  }
  if (el.imageUpload) {
    el.imageUpload.addEventListener("change", onSnippetImageFileChange);
  }
  el.tbody.addEventListener("click", onListActionClick);
  el.tbody.addEventListener("focusout", onInlineEditorFocusOut, true);
  el.tbody.addEventListener("keydown", onInlineEditorKeydown, true);
  el.tbody.addEventListener("mousedown", onInlineEditorMouseDown, true);
  el.selectAll.addEventListener("change", onSelectAllChange);
  el.btnBatchDelete.addEventListener("click", onBatchDelete);

  const onFilterInput = debounce(() => {
    state.filters.keyword = (el.searchKeyword.value || "").trim().toLowerCase();
    state.filters.category = el.filterCategory.value || "";
    state.filters.prefix = normalizeQuery(el.filterPrefix.value || "");
    state.filters.sort = el.filterSort.value;
    state.filters.uncategorizedOnly = !!el.filterUncategorized.checked;
    applyFiltersAndRender();
  }, 120);

  el.searchKeyword.addEventListener("input", onFilterInput);
  el.filterCategory.addEventListener("change", onFilterInput);
  el.filterPrefix.addEventListener("input", onFilterInput);
  el.filterSort.addEventListener("change", onFilterInput);
  el.filterUncategorized.addEventListener("change", onFilterInput);

  el.pasteArea.addEventListener("paste", onPasteExcelData);
  el.btnImportApply.addEventListener("click", onApplyImportedRows);

  el.btnExport.addEventListener("click", onExportJson);
  el.inputImportJson.addEventListener("change", onImportJson);

  el.settingsForm.addEventListener("submit", onSaveSettings);
  if (el.imageAutoSendStrategyToggle) {
    el.imageAutoSendStrategyToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleImageAutoSendStrategyMenu();
    });
  }
  if (el.imageAutoSendStrategyMenu) {
    el.imageAutoSendStrategyMenu.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const option = event.target?.closest?.("[data-strategy]");
      if (!option || !el.imageAutoSendStrategy) return;
      el.imageAutoSendStrategy.value = option.dataset.strategy === "enter" ? "enter" : "click";
      closeImageAutoSendStrategyMenu();
      updateImageAutoSendStrategyUI();
    });
  }
  document.addEventListener("click", closeImageAutoSendStrategyMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeImageAutoSendStrategyMenu();
  });
  if (el.aiSettingsForm) {
    el.aiSettingsForm.addEventListener("submit", onSaveSettings);
  }
  if (el.changeHelperForm) {
    el.changeHelperForm.addEventListener("submit", onSaveSettings);
  }
  if (el.shunfengerForm) {
    el.shunfengerForm.addEventListener("submit", onSaveShunfengerSettings);
  }
  if (el.sfBtnAddKeyword) {
    el.sfBtnAddKeyword.addEventListener("click", () => {
      shunfengerConfig.keywords.push(createShunfengerKeyword());
      renderShunfengerSettings();
    });
  }
  if (el.sfBtnAddLevel) {
    el.sfBtnAddLevel.addEventListener("click", () => {
      shunfengerConfig.levels.push(createShunfengerLevel());
      renderShunfengerSettings();
    });
  }
  if (el.sfBtnImportAccounts) {
    el.sfBtnImportAccounts.addEventListener("click", importShunfengerAccounts);
  }
  if (el.sfBtnOpenPanel) {
    el.sfBtnOpenPanel.addEventListener("click", openShunfengerPanel);
  }
  if (el.sfAccountRows) {
    el.sfAccountRows.addEventListener("click", onShunfengerRowsClick);
  }
  if (el.sfLevelRows) {
    el.sfLevelRows.addEventListener("click", onShunfengerRowsClick);
    el.sfLevelRows.addEventListener("input", onShunfengerLevelInput);
  }
  if (el.sfKeywordRows) {
    el.sfKeywordRows.addEventListener("click", onShunfengerRowsClick);
  }
  if (el.btnResetAi) {
    el.btnResetAi.addEventListener("click", onResetAiSettings);
  }
  if (el.aiReplyBranchForm) {
    el.aiReplyBranchForm.addEventListener("submit", onSaveAiReplyBranch);
  }
  if (el.btnResetAiReplyBranch) {
    el.btnResetAiReplyBranch.addEventListener("click", resetAiReplyBranchForm);
  }
  if (el.aiReplyBranchTbody) {
    el.aiReplyBranchTbody.addEventListener("click", onAiReplyBranchListClick);
  }
  if (el.aiExtensionRuleForm) {
    el.aiExtensionRuleForm.addEventListener("submit", onSaveAiExtensionRule);
  }
  if (el.btnResetAiExtensionRule) {
    el.btnResetAiExtensionRule.addEventListener("click", resetAiExtensionRuleForm);
  }
  if (el.aiExtensionRuleTbody) {
    el.aiExtensionRuleTbody.addEventListener("click", onAiExtensionRuleListClick);
  }
  if (el.btnActivate) {
    el.btnActivate.addEventListener("click", onActivatePlugin);
  }
  if (el.btnQuickClickSave) {
    el.btnQuickClickSave.addEventListener("click", onSaveQuickClickRule);
  }
  if (el.btnQuickClickReset) {
    el.btnQuickClickReset.addEventListener("click", resetQuickClickForm);
  }
  if (el.btnQuickClickPickElement) {
    el.btnQuickClickPickElement.addEventListener("click", () => startQuickClickPick("selector"));
  }
  if (el.btnQuickClickPickCoordinate) {
    el.btnQuickClickPickCoordinate.addEventListener("click", () => startQuickClickPick("coordinate"));
  }
  if (el.btnQuickClickTest) {
    el.btnQuickClickTest.addEventListener("click", testQuickClickFromForm);
  }
  if (el.quickClickTbody) {
    el.quickClickTbody.addEventListener("click", onQuickClickListClick);
  }
  el.aiApiFormat.addEventListener("change", applyAiBaseUrlPreset);
  el.aiApiHostPreset.addEventListener("change", applyAiBaseUrlPreset);

  // Tab navigation
  const navLinks = document.querySelectorAll(".nav-menu a");
  const tabPanes = document.querySelectorAll(".tab-pane");
  const pageTitle = document.getElementById("page-title");

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      
      // Update active nav link
      navLinks.forEach((nav) => nav.classList.remove("active"));
      link.classList.add("active");
      
      // Update page title
      pageTitle.textContent = link.getAttribute("data-title") || link.textContent;
      if (el.pageSubtitle) {
        el.pageSubtitle.textContent = link.getAttribute("data-desc") || "";
      }
      
      // Show target pane
      const targetId = link.getAttribute("data-target");
      tabPanes.forEach((pane) => {
        if (pane.id === targetId) {
          pane.classList.add("active");
        } else {
          pane.classList.remove("active");
        }
      });
    });
  });
}

async function loadStorage() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.SNIPPETS,
    STORAGE_KEYS.SETTINGS
  ]);
  state.snippets = normalizeSnippets(data[STORAGE_KEYS.SNIPPETS] || []);
  state.settings = normalizeSettings(data[STORAGE_KEYS.SETTINGS] || {});
}

function bindStorageWatchers() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes[STORAGE_KEYS.SNIPPETS]) {
      state.snippets = normalizeSnippets(changes[STORAGE_KEYS.SNIPPETS].newValue || []);
      applyFiltersAndRender();
      renderUsageStats();
    }
    if (changes[STORAGE_KEYS.SETTINGS]) {
      state.settings = normalizeSettings(changes[STORAGE_KEYS.SETTINGS].newValue || {});
      fillSettingsForm();
      renderUsageStats();
    }
    if (el.quickClickTip && changes[STORAGE_KEYS.QUICK_CLICK_PENDING_TARGET]?.newValue) {
      applyQuickClickPickedTarget(changes[STORAGE_KEYS.QUICK_CLICK_PENDING_TARGET].newValue);
      chrome.storage.local.remove(STORAGE_KEYS.QUICK_CLICK_PENDING_TARGET);
    }
  });
}

async function consumePendingSnippet() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.PENDING_SNIPPET);
  const pending = data[STORAGE_KEYS.PENDING_SNIPPET];
  if (!pending || !pending.content) {
    return;
  }
  el.content.value = String(pending.content).trim();
  setTip(el.formTip, "已带入右键收藏的文本，请补充标题和快捷词后保存。", false);
  
  // Switch to form tab
  const formTab = document.querySelector('.nav-menu a[data-target="section-form"]');
  if (formTab) formTab.click();
  
  await chrome.storage.local.remove(STORAGE_KEYS.PENDING_SNIPPET);
}

async function onSaveSnippet(event) {
  event.preventDefault();
  const model = readSnippetForm();
  if (!model.shortcutNormalized) {
    setTip(el.formTip, "快捷词不能为空", true);
    return;
  }
  if (model.type === "image" && !model.imageData) {
    setTip(el.formTip, "图片话术请先上传图片", true);
    return;
  }
  if (model.type === "text" && !model.content) {
    setTip(el.formTip, "文本话术内容不能为空", true);
    return;
  }
  const editingId = el.snippetId.value || "";
  const conflict = state.snippets.find(
    (item) =>
      item.shortcutNormalized === model.shortcutNormalized &&
      item.id !== editingId
  );
  if (conflict) {
    setTip(el.formTip, `快捷词冲突：已被「${conflict.title}」占用`, true);
    return;
  }

  if (editingId) {
    state.snippets = state.snippets.map((item) => {
      if (item.id !== editingId) return item;
      return {
        ...item,
        ...model
      };
    });
    showActionFeedback(el.formTip, "话术已更新", "话术保存成功。");
  } else {
    state.snippets.unshift({
      id: crypto.randomUUID(),
      ...model,
      useCount: 0,
      createdAt: new Date().toISOString(),
      lastUsedAt: undefined
    });
    showActionFeedback(el.formTip, "话术已新增", "新话术已写入本地，可立即触发使用。");
  }

  await persistSnippets();
  resetSnippetForm();
  applyFiltersAndRender();
}

function getSnippetType() {
  const value = el.snippetType ? String(el.snippetType.value || "").trim() : "text";
  return value === "image" ? "image" : "text";
}

function getImageDraftById(editingId) {
  if (imageDraft) return imageDraft;
  if (!editingId) return null;
  const item = state.snippets.find((row) => row.id === editingId);
  if (!item || item.type !== "image" || !item.imageData) {
    return null;
  }
  return {
    imageName: String(item.imageName || ""),
    imageMime: String(item.imageMime || "image/png"),
    imageSize: Number(item.imageSize || 0),
    imageData: String(item.imageData || "")
  };
}

function setImageDraft(next) {
  if (!next) {
    imageDraft = null;
    if (el.imagePreviewWrap) {
      el.imagePreviewWrap.hidden = true;
    }
    if (el.imagePreview) {
      el.imagePreview.removeAttribute("src");
      el.imagePreview.src = "";
    }
    if (el.imagePreviewName) {
      el.imagePreviewName.textContent = "";
    }
    if (el.imagePreviewMime) {
      el.imagePreviewMime.textContent = "";
    }
    if (el.imagePreviewSize) {
      el.imagePreviewSize.textContent = "";
    }
    if (el.imageAutoSendAfterInsert) {
      el.imageAutoSendAfterInsert.checked = false;
    }
    return;
  }
  imageDraft = {
    imageName: String(next.imageName || ""),
    imageMime: String(next.imageMime || "image/png"),
    imageSize: Number(next.imageSize || 0),
    imageData: String(next.imageData || "")
  };
  if (el.imageUpload) {
    el.imageUpload.value = "";
  }
  if (el.imagePreviewWrap) {
    el.imagePreviewWrap.hidden = false;
  }
  if (el.imagePreview) {
    el.imagePreview.src = imageDraft.imageData;
  }
  if (el.imagePreviewName) {
    el.imagePreviewName.textContent = imageDraft.imageName || "未命名图片";
  }
  if (el.imagePreviewMime) {
    el.imagePreviewMime.textContent = imageDraft.imageMime || "image/*";
  }
  if (el.imagePreviewSize) {
    el.imagePreviewSize.textContent = formatImageSize(imageDraft.imageSize);
  }
}

function formatImageSize(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 KB";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function dataUrlToFile(dataUrl, fileName, mimeFallback = "image/png") {
  const text = String(dataUrl || "");
  const commaIndex = text.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("图片数据格式不正确");
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

function setSnippetTypeUI(isImage) {
  if (el.contentSection) {
    el.contentSection.hidden = isImage;
  }
  if (el.content) {
    el.content.required = !isImage;
  }
  if (el.imageSection) {
    el.imageSection.style.display = isImage ? "block" : "none";
  }
  if (el.imageUpload) {
    el.imageUpload.required = false;
  }
}

function onSnippetTypeChange() {
  const isImage = getSnippetType() === "image";
  setSnippetTypeUI(isImage);
  if (!isImage) {
    setImageDraft(null);
  }
}

function onSnippetImageFileChange(event) {
  const file = event.target?.files?.[0];
  if (!file) {
    return;
  }
  if (!file.type || !file.type.startsWith("image/")) {
    setTip(el.formTip, "请选择图片文件（JPG/PNG/WEBP 等）", true);
    if (el.imageUpload) {
      el.imageUpload.value = "";
    }
    setImageDraft(null);
    return;
  }
  if (file.size > SNIPPET_IMAGE_MAX_BYTES) {
    setTip(el.formTip, "图片超过 10MB，请先压缩后上传", true);
    if (el.imageUpload) {
      el.imageUpload.value = "";
    }
    setImageDraft(null);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const imageData = String(reader.result || "");
    if (!imageData) {
      setTip(el.formTip, "图片读取失败，请重试", true);
      setImageDraft(null);
      return;
    }
    setImageDraft({
      imageName: file.name || "image",
      imageMime: file.type || "image/png",
      imageSize: file.size || 0,
      imageData
    });
    setTip(el.formTip, "图片上传成功", false);
  };
  reader.onerror = () => {
    setTip(el.formTip, "图片读取失败，请重试", true);
    setImageDraft(null);
  };
  reader.readAsDataURL(file);
}

function readSnippetForm() {
  const title = (el.title.value || "").trim() || "未命名";
  const shortcut = (el.shortcut.value || "").trim();
  const shortcutNormalized = normalizeStoredShortcut(shortcut, state.settings.triggerPrefixes);
  const category = (el.category.value || "").trim();
  const type = getSnippetType();
  const draft = type === "image" ? getImageDraftById(el.snippetId.value || "") : null;

  if (type === "image") {
    return {
      title,
      shortcut,
      shortcutNormalized,
      category,
      type: "image",
      content: "",
      imageName: String(draft?.imageName || ""),
      imageMime: String(draft?.imageMime || "image/png"),
      imageSize: Number(draft?.imageSize || 0),
      imageData: String(draft?.imageData || ""),
      autoSendAfterInsert: el.imageAutoSendAfterInsert?.checked === true
    };
  }

  const content = (el.content.value || "").trim();
  return {
    title,
    shortcut,
    shortcutNormalized,
    category,
    type: "text",
    content,
    imageName: "",
    imageMime: "",
    imageSize: 0,
    imageData: "",
    autoSendAfterInsert: false
  };
}

function resetSnippetForm() {
  el.snippetId.value = "";
  el.form.reset();
  if (el.snippetType) {
    el.snippetType.value = "text";
  }
  setSnippetTypeUI(false);
  setImageDraft(null);
  setTip(el.formTip, "", false);
}

function fillSnippetForm(item) {
  if (!item) return;
  el.snippetId.value = item.id || "";
  el.title.value = item.title || "";
  el.shortcut.value = item.shortcut || "";
  el.category.value = item.category || "";
  const type = item.type === "image" ? "image" : "text";
  if (el.snippetType) {
    el.snippetType.value = type;
  }
  setSnippetTypeUI(type === "image");
  if (type === "image") {
    el.content.value = "";
    setImageDraft({
      imageName: item.imageName || "",
      imageMime: item.imageMime || "image/png",
      imageSize: Number(item.imageSize || 0),
      imageData: item.imageData || ""
    });
    if (el.imageAutoSendAfterInsert) {
      el.imageAutoSendAfterInsert.checked = item.autoSendAfterInsert === true;
    }
  } else {
    setImageDraft(null);
    el.content.value = item.content || "";
  }
  const formTab = document.querySelector('.nav-menu a[data-target="section-form"]');
  if (formTab) formTab.click();
  el.title.focus();
}

async function onListActionClick(event) {
  // Check for editable cell click
  const editableCell = event.target.closest(".editable-cell");
  if (editableCell) {
    const id = editableCell.getAttribute("data-id");
    const item = state.snippets.find((row) => row.id === id);
    if (!id || !item) return;
    if (item.type === "image") {
      fillSnippetForm(item);
      return;
    }
    if (state.editingId && state.editingId !== id) {
      const saved = await commitInlineEdit(state.editingId);
      if (!saved) return;
    }
    if (state.editingId !== id) {
      enterInlineEdit(id);
    }
    return;
  }

  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  const action = btn.getAttribute("data-action");
  if (!id || !action) return;
  
  if (action === "cancel-inline") {
    state.editingId = null;
    renderList();
    return;
  }

  if (action === "copy") {
    const item = state.snippets.find((row) => row.id === id);
    if (!item) return;
    if (item.type === "image") {
      try {
        await copyImageSnippetToClipboard(item);
        item.useCount = (item.useCount || 0) + 1;
        item.lastUsedAt = new Date().toISOString();
        void persistSnippets();
        applyFiltersAndRender();
        showActionFeedback(el.listTip, "图片已复制", "图片话术已写入剪贴板。");
      } catch (err) {
        setTip(el.listTip, `图片复制失败：${err.message || err}`, true);
      }
      return;
    }
    
    item.useCount = (item.useCount || 0) + 1;
    item.lastUsedAt = new Date().toISOString();
    void persistSnippets();
    applyFiltersAndRender();
    
    try {
      await navigator.clipboard.writeText(item.content);
      const btnToUpdate = el.tbody.querySelector(`button[data-action="copy"][data-id="${id}"]`);
      if (btnToUpdate) {
        const originalText = btnToUpdate.textContent;
        btnToUpdate.textContent = "已复制!";
        btnToUpdate.style.color = "#52c41a";
        btnToUpdate.style.borderColor = "#b7eb8f";
        btnToUpdate.style.background = "#f6ffed";
        
        setTimeout(() => {
          btnToUpdate.textContent = originalText;
          btnToUpdate.style.color = "";
          btnToUpdate.style.borderColor = "";
          btnToUpdate.style.background = "";
        }, 1500);
      }
    } catch (err) {
      alert("复制失败，请重试");
    }
    return;
  }
  if (action === "edit") {
    const item = state.snippets.find((row) => row.id === id);
    if (!item) return;
    fillSnippetForm(item);
    return;
  }
  if (action === "delete") {
    const ok = window.confirm("确定删除该话术吗？");
    if (!ok) return;
    state.snippets = state.snippets.filter((row) => row.id !== id);
    void persistSnippets();
    applyFiltersAndRender();
  }
}

async function copyImageSnippetToClipboard(item) {
  if (!navigator.clipboard || typeof navigator.clipboard.write !== "function" || typeof ClipboardItem === "undefined") {
    throw new Error("当前浏览器不支持复制图片到剪贴板");
  }
  const file = dataUrlToFile(item.imageData, item.imageName, item.imageMime);
  await navigator.clipboard.write([new ClipboardItem({ [file.type]: file })]);
}

function enterInlineEdit(id) {
  state.editingId = id;
  renderList();
  setTimeout(() => {
    const titleInput = document.getElementById(`edit-title-${id}`);
    if (titleInput) titleInput.focus();
  }, 0);
}

function onInlineEditorMouseDown(event) {
  const cancelBtn = event.target.closest("button[data-action='cancel-inline']");
  if (!cancelBtn) return;
  const id = cancelBtn.getAttribute("data-id");
  if (!id) return;
  state.skipAutoSaveId = id;
}

async function onInlineEditorFocusOut(event) {
  if (!state.editingId) return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.classList.contains("inline-input") && !target.classList.contains("inline-textarea")) {
    return;
  }

  const id = state.editingId;
  if (!id) return;

  if (state.skipAutoSaveId === id) {
    state.skipAutoSaveId = null;
    return;
  }

  const row = target.closest("tr");
  const next = event.relatedTarget;
  if (row && next instanceof Node && row.contains(next)) {
    return;
  }

  await commitInlineEdit(id);
}

async function onInlineEditorKeydown(event) {
  if (!state.editingId) return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.classList.contains("inline-input") && !target.classList.contains("inline-textarea")) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    state.editingId = null;
    renderList();
    return;
  }

  if (event.key !== "Enter") return;
  if (target.classList.contains("inline-textarea") && event.shiftKey) {
    return;
  }
  event.preventDefault();
  await commitInlineEdit(state.editingId);
}

async function commitInlineEdit(id) {
  const titleInput = document.getElementById(`edit-title-${id}`);
  const shortcutInput = document.getElementById(`edit-shortcut-${id}`);
  const categoryInput = document.getElementById(`edit-category-${id}`);
  const contentInput = document.getElementById(`edit-content-${id}`);

  if (!titleInput || !shortcutInput || !contentInput) return false;

  const title = (titleInput.value || "").trim() || "未命名";
  const shortcut = (shortcutInput.value || "").trim();
  const shortcutNormalized = normalizeStoredShortcut(shortcut, state.settings.triggerPrefixes);
  const category = (categoryInput.value || "").trim();
  const content = (contentInput.value || "").trim();

  if (!shortcutNormalized) {
    alert("快捷词不能为空。");
    return false;
  }

  const conflict = state.snippets.find(
    (item) => item.shortcutNormalized === shortcutNormalized && item.id !== id
  );
  if (conflict) {
    alert(`快捷词冲突：已被「${conflict.title}」占用。`);
    return false;
  }

  const current = state.snippets.find((item) => item.id === id);
  if (!current) return false;
  const unchanged =
    current.title === title &&
    current.shortcut === shortcut &&
    current.category === category &&
    current.content === content;

  state.editingId = null;
  if (unchanged) {
    renderList();
    return true;
  }

  state.snippets = state.snippets.map((item) => {
    if (item.id !== id) return item;
    return {
      ...item,
      title,
      shortcut,
      shortcutNormalized,
      category,
      content
    };
  });
  await persistSnippets();
  applyFiltersAndRender();
  return true;
}

function applyFiltersAndRender() {
  let list = [...state.snippets];
  const { keyword, category, prefix, uncategorizedOnly, sort } = state.filters;

  if (keyword) {
    list = list.filter((item) =>
      [item.title, item.shortcut, item.category, item.content, item.imageName, item.type === "image" ? "图片 image" : "文本 text"]
        .join("\n")
        .toLowerCase()
        .includes(keyword)
    );
  }
  if (category) {
    list = list.filter((item) => item.category === category);
  }
  if (prefix) {
    list = list.filter((item) => item.shortcutNormalized.startsWith(prefix));
  }
  if (uncategorizedOnly) {
    list = list.filter((item) => !item.category);
  }

  list.sort((a, b) => {
    if (sort === "useCount") {
      return (b.useCount || 0) - (a.useCount || 0);
    }
    if (sort === "createdAt") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return new Date(b.lastUsedAt || 0).getTime() - new Date(a.lastUsedAt || 0).getTime();
  });

  state.filtered = list;
  renderList();
  renderCategoryFilterOptions();
}

function buildSnippetListPreview(item) {
  if (item.type === "image") {
    return escapeHtml(`[图片] ${item.imageName || "未命名图片"}`);
  }
  let preview = escapeHtml(item.content || "").replace(/\n/g, " ");
  if (preview.length > 30) {
    preview = `${preview.substring(0, 30)}...`;
  }
  return preview;
}

function renderList() {
  const rows = state.filtered.map((item) => {
    const isEditing = state.editingId === item.id;
    
    // 如果是编辑态，直接渲染输入框
    if (isEditing) {
      return `
        <tr class="editing-row">
          <td><input type="checkbox" class="row-checkbox" value="${item.id}" disabled></td>
          <td><input type="text" class="inline-input" id="edit-title-${item.id}" value="${escapeAttr(item.title)}" placeholder="标题" /></td>
          <td><input type="text" class="inline-input" id="edit-shortcut-${item.id}" value="${escapeAttr(item.shortcut)}" placeholder="快捷词" /></td>
          <td><input type="text" class="inline-input" id="edit-category-${item.id}" value="${escapeAttr(item.category)}" placeholder="分类" /></td>
          <td><span class="snippet-type-tag snippet-type-text">文本</span></td>
          <td><textarea class="inline-textarea" id="edit-content-${item.id}" rows="2" placeholder="话术内容">${escapeHtml(item.content)}</textarea></td>
          <td>${item.useCount || 0}</td>
          <td>${formatTime(item.lastUsedAt)}</td>
          <td class="ops">
            <span class="inline-tip">自动保存</span>
            <button type="button" class="ghost" data-action="cancel-inline" data-id="${item.id}">取消</button>
          </td>
        </tr>
      `;
    }
    
    const isImage = item.type === "image";
    const typeLabel = isImage
      ? '<span class="snippet-type-tag snippet-type-image">图片</span>'
      : '<span class="snippet-type-tag snippet-type-text">文本</span>';
    const preview = buildSnippetListPreview(item);
    const previewTitle = isImage ? `[图片] ${item.imageName || ""}` : item.content || "";
    const thumbnail = isImage && item.imageData
      ? `<img class="snippet-thumb" src="${escapeAttr(item.imageData)}" alt="图片缩略图" />`
      : "";
    
    return `
      <tr>
        <td><input type="checkbox" class="row-checkbox" value="${item.id}"></td>
        <td class="editable-cell" data-action="edit-inline" data-id="${item.id}">
          <div class="cell-truncate" title="${escapeAttr(item.title)}">${escapeHtml(item.title)}</div>
        </td>
        <td class="editable-cell" data-action="edit-inline" data-id="${item.id}">
          <code class="shortcut-tag">${escapeHtml(item.shortcut)}</code>
        </td>
        <td class="editable-cell" data-action="edit-inline" data-id="${item.id}">
          ${item.category ? `<span class="category-tag">${escapeHtml(item.category)}</span>` : '<span class="muted">未分类</span>'}
        </td>
        <td class="editable-cell" data-action="edit-inline" data-id="${item.id}">
          ${typeLabel}
        </td>
        <td class="editable-cell" data-action="edit-inline" data-id="${item.id}">
          <div class="snippet-preview-line" title="${escapeAttr(previewTitle)}">${thumbnail}<span class="cell-truncate content-preview">${preview}</span></div>
        </td>
        <td>${item.useCount || 0}</td>
        <td>${formatTime(item.lastUsedAt)}</td>
        <td class="ops">
          <button type="button" class="ghost" data-action="copy" data-id="${item.id}">复制</button>
          <button type="button" class="ghost" data-action="edit" data-id="${item.id}">编辑</button>
          <button type="button" class="ghost" data-action="delete" data-id="${item.id}">删除</button>
        </td>
      </tr>
    `;
  });
  el.tbody.innerHTML = rows.join("");
  setTip(el.listTip, `共 ${state.filtered.length} 条（总计 ${state.snippets.length} 条）`, false);
  
  // 重置全选状态
  el.selectAll.checked = false;
  updateBatchDeleteButton();
  
  // 绑定单选框事件
  const checkboxes = el.tbody.querySelectorAll(".row-checkbox");
  checkboxes.forEach(cb => {
    cb.addEventListener("change", () => {
      const allChecked = Array.from(checkboxes).every(c => c.checked);
      const someChecked = Array.from(checkboxes).some(c => c.checked);
      el.selectAll.checked = allChecked;
      el.selectAll.indeterminate = someChecked && !allChecked;
      updateBatchDeleteButton();
    });
  });
}

function onSelectAllChange(e) {
  const isChecked = e.target.checked;
  const checkboxes = el.tbody.querySelectorAll(".row-checkbox");
  checkboxes.forEach(cb => cb.checked = isChecked);
  updateBatchDeleteButton();
}

function updateBatchDeleteButton() {
  const checkedCount = el.tbody.querySelectorAll(".row-checkbox:checked").length;
  if (checkedCount > 0) {
    el.btnBatchDelete.style.display = "inline-flex";
    el.btnBatchDelete.textContent = `批量删除 (${checkedCount})`;
  } else {
    el.btnBatchDelete.style.display = "none";
  }
}

async function onBatchDelete() {
  const checkedBoxes = el.tbody.querySelectorAll(".row-checkbox:checked");
  if (checkedBoxes.length === 0) return;
  
  const ok = window.confirm(`确定要删除选中的 ${checkedBoxes.length} 条话术吗？`);
  if (!ok) return;
  
  const idsToDelete = Array.from(checkedBoxes).map(cb => cb.value);
  state.snippets = state.snippets.filter((row) => !idsToDelete.includes(row.id));
  
  await persistSnippets();
  applyFiltersAndRender();
}

function renderCategoryFilterOptions() {
  const categories = [...new Set(state.snippets.map((item) => item.category).filter(Boolean))].sort();
  const prev = el.filterCategory.value;
  el.filterCategory.innerHTML = `<option value="">全部分类</option>` + categories.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("");
  if (categories.includes(prev)) {
    el.filterCategory.value = prev;
  }
}

function onPasteExcelData(event) {
  const text = event.clipboardData ? event.clipboardData.getData("Text") : "";
  if (!text) {
    return;
  }
  event.preventDefault();
  const parsed = parseTsvRows(text);
  state.pendingImportedRows = parsed.rows;
  el.pasteArea.value = text;
  if (parsed.errors.length > 0) {
    setTip(el.importTip, `解析完成：${parsed.rows.length} 条可导入，${parsed.errors.length} 条异常。`, true);
  } else {
    setTip(el.importTip, `解析完成：${parsed.rows.length} 条可导入。`, false);
  }
}

async function onApplyImportedRows() {
  if (!state.pendingImportedRows.length) {
    setTip(el.importTip, "没有可导入的数据，请先粘贴 Excel 内容。", true);
    return;
  }
  const mode = el.importConflictMode.value;
  const currentByShortcut = new Map(state.snippets.map((item) => [item.shortcutNormalized, item]));
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const next = [...state.snippets];

  for (const row of state.pendingImportedRows.slice(0, MAX_IMPORT_ROWS)) {
    const exist = currentByShortcut.get(row.shortcutNormalized);
    if (!exist) {
      const item = {
        id: crypto.randomUUID(),
        title: row.title,
        type: "text",
        shortcut: row.shortcut,
        shortcutNormalized: row.shortcutNormalized,
        category: row.category,
        content: row.content,
        imageName: "",
        imageMime: "",
        imageSize: 0,
        imageData: "",
        autoSendAfterInsert: false,
        useCount: 0,
        createdAt: new Date().toISOString(),
        lastUsedAt: undefined
      };
      next.push(item);
      currentByShortcut.set(item.shortcutNormalized, item);
      added += 1;
      continue;
    }
    if (mode === "overwrite") {
      const idx = next.findIndex((item) => item.id === exist.id);
      if (idx >= 0) {
        next[idx] = {
          ...exist,
          title: row.title,
          type: "text",
          shortcut: row.shortcut,
          category: row.category,
          content: row.content,
          imageName: "",
          imageMime: "",
          imageSize: 0,
          imageData: "",
          autoSendAfterInsert: false
        };
        currentByShortcut.set(exist.shortcutNormalized, next[idx]);
        updated += 1;
      }
    } else {
      skipped += 1;
    }
  }

  state.snippets = normalizeSnippets(next);
  await persistSnippets();
  applyFiltersAndRender();
  setTip(el.importTip, `导入完成：新增 ${added}，覆盖 ${updated}，跳过 ${skipped}。`, false);
}

function parseTsvRows(text) {
  const rows = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const result = {
    rows: [],
    errors: []
  };
  if (rows.length > MAX_IMPORT_ROWS) {
    rows.length = MAX_IMPORT_ROWS;
  }
  rows.forEach((line, index) => {
    const columns = line.split("\t");
    const rawShortcut = (columns[1] || "").trim();
    const normalized = normalizeStoredShortcut(rawShortcut, state.settings.triggerPrefixes);
    if (!normalized) {
      result.errors.push(`第 ${index + 1} 行快捷词为空`);
      return;
    }
    result.rows.push({
      title: (columns[0] || "未命名").trim(),
      type: "text",
      shortcut: rawShortcut,
      shortcutNormalized: normalized,
      category: (columns[2] || "").trim(),
      content: (columns[3] || "").trim()
    });
  });
  return result;
}

async function onExportJson() {
  const payload = {
    snippets: state.snippets,
    settings: state.settings
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nihao-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function onImportJson(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const hasSnippets = !Array.isArray(json) && Object.prototype.hasOwnProperty.call(json, "snippets");
    const snippetsRaw = Array.isArray(json) ? json : json.snippets;
    const settingsRaw = Array.isArray(json) ? null : json.settings;
    if (!Array.isArray(snippetsRaw) && !settingsRaw) {
      throw new Error("JSON 中缺少 snippets 数组或 settings 配置");
    }
    if (settingsRaw) {
      state.settings = normalizeSettings({
        ...state.settings,
        ...settingsRaw
      });
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: state.settings });
      fillSettingsForm();
    }
    if (Array.isArray(json) || hasSnippets) {
      state.snippets = normalizeSnippets(snippetsRaw);
      await persistSnippets();
      applyFiltersAndRender();
    }
    setTip(el.listTip, settingsRaw && !hasSnippets && !Array.isArray(json) ? "API 配置导入成功。" : "JSON 导入成功。", false);
  } catch (error) {
    setTip(el.listTip, `JSON 导入失败：${error.message || error}`, true);
  } finally {
    event.target.value = "";
  }
}

function toggleImageAutoSendStrategyMenu() {
  if (!el.imageAutoSendStrategyMenu || !el.imageAutoSendStrategyToggle) return;
  const willOpen = el.imageAutoSendStrategyMenu.hidden;
  el.imageAutoSendStrategyMenu.hidden = !willOpen;
  el.imageAutoSendStrategyToggle.setAttribute("aria-expanded", String(willOpen));
}

function closeImageAutoSendStrategyMenu() {
  if (!el.imageAutoSendStrategyMenu || !el.imageAutoSendStrategyToggle) return;
  el.imageAutoSendStrategyMenu.hidden = true;
  el.imageAutoSendStrategyToggle.setAttribute("aria-expanded", "false");
}

function updateImageAutoSendStrategyUI() {
  const strategy = el.imageAutoSendStrategy?.value === "enter" ? "enter" : "click";
  if (el.imageAutoSendStrategyLabel) {
    el.imageAutoSendStrategyLabel.textContent = strategy === "enter" ? "回车发送" : "自动发送";
  }
  if (el.imageAutoSendStrategyToggle) {
    el.imageAutoSendStrategyToggle.title = `当前：${strategy === "enter" ? "回车发送" : "自动发送"}`;
  }
  if (el.imageAutoSendStrategyMenu) {
    el.imageAutoSendStrategyMenu.querySelectorAll("[data-strategy]").forEach((option) => {
      option.classList.toggle("is-active", option.dataset.strategy === strategy);
    });
  }
}

async function onSaveSettings(event) {
  event.preventDefault();
  const triggerPrefixes = parseTriggerPrefixes(el.triggerPrefixes.value || "");
  const blacklistSites = (el.blacklistSites.value || "")
    .split(/\r?\n/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  state.settings = {
    enabled: state.settings.enabled !== false,
    activated: state.settings.activated !== false,
    monkeyEyeEnabled: el.monkeyEyeEnabled.checked,
    autoSendImageConfirm: el.autoSendImageConfirm
      ? el.autoSendImageConfirm.checked
      : state.settings.autoSendImageConfirm === true,
    imageAutoSendStrategy: ["click", "enter"].includes(el.imageAutoSendStrategy?.value)
      ? el.imageAutoSendStrategy.value
      : "click",
    aiReplySuggestEnabled: state.settings.aiReplySuggestEnabled === true,
    triggerPrefixes: triggerPrefixes.length > 0 ? triggerPrefixes : ["/", "、"],
    completionMode: el.completionMode.value === "auto" ? "auto" : "manual",
    matchMode: ["prefix", "contains", "exact"].includes(el.matchMode.value) ? el.matchMode.value : "prefix",
    insertEffectScope: ["off", "ai-only", "both"].includes(el.insertEffectScope?.value) ? el.insertEffectScope.value : "both",
    snippetEffectStyle: normalizeEffectStyle(el.snippetEffectStyle?.value),
    snippetEffectIntensity: clampNumber(el.snippetEffectIntensity?.value, 50, 200, 100),
    snippetEffectSize: clampNumber(el.snippetEffectSize?.value, 50, 200, 100),
    snippetEffectSpread: clampNumber(el.snippetEffectSpread?.value, 50, 200, 100),
    snippetEffectDuration: clampNumber(el.snippetEffectDuration?.value, 50, 200, 100),
    aiEffectStyle: normalizeEffectStyle(el.aiEffectStyle?.value || "magic-circle"),
    aiEffectIntensity: clampNumber(el.aiEffectIntensity?.value, 50, 200, 100),
    aiEffectSize: clampNumber(el.aiEffectSize?.value, 50, 200, 100),
    aiEffectSpread: clampNumber(el.aiEffectSpread?.value, 50, 200, 100),
    aiEffectDuration: clampNumber(el.aiEffectDuration?.value, 50, 200, 100),
    suggestionWidth: clampNumber(el.suggestionWidth.value, 220, 560, 360),
    suggestionHeight: clampNumber(el.suggestionHeight.value, 120, 560, 280),
    suggestionFontSize: clampNumber(el.suggestionFontSize.value, 12, 22, 13),
    suggestionRemoveHue: el.suggestionRemoveHue?.checked === true,
    suggestionOpacity: clampNumber(el.suggestionOpacity?.value, 40, 100, 96),
    suggestionSnippetDisplayMode: ["title", "content", "both"].includes(el.suggestionSnippetDisplayMode?.value)
      ? el.suggestionSnippetDisplayMode.value
      : "content",
    suggestionSnippetPreviewLength: clampNumber(el.suggestionSnippetPreviewLength?.value, 0, 30, 10),
    suggestionOffsetX: clampNumber(el.suggestionOffsetX?.value, -160, 160, 0),
    suggestionOffsetY: clampNumber(el.suggestionOffsetY?.value, -40, 120, 10),
    suggestionExpandDirection: ["auto", "prefer-up", "always-up", "always-down"].includes(el.suggestionExpandDirection?.value)
      ? el.suggestionExpandDirection.value
      : "prefer-up",
    snippetEffectPrimaryColor: normalizeColorHex(el.snippetEffectPrimaryColor?.value, "#8b5cf6"),
    snippetEffectAccentColor: normalizeColorHex(el.snippetEffectAccentColor?.value, "#60a5fa"),
    aiEffectPrimaryColor: normalizeColorHex(el.aiEffectPrimaryColor?.value, "#22d3ee"),
    aiEffectAccentColor: normalizeColorHex(el.aiEffectAccentColor?.value, "#a78bfa"),
    aiApiFormat: el.aiApiFormat.value === "anthropic" ? "anthropic" : "openai",
    aiApiHostPreset: ["minimax-cn", "minimax-global", "deepseek", "volcengine"].includes(el.aiApiHostPreset.value)
      ? el.aiApiHostPreset.value
      : "minimax-cn",
    aiApiBaseUrl: (el.aiApiBaseUrl.value || "").trim() || DEFAULT_SETTINGS.aiApiBaseUrl,
    aiApiKey: (el.aiApiKey.value || "").trim(),
    aiModel: (el.aiModel.value || "").trim() || DEFAULT_SETTINGS.aiModel,
    aiTriggerWord: normalizeQuery((el.aiTriggerWord.value || "").trim()) || DEFAULT_SETTINGS.aiTriggerWord,
    aiSuggestCount: clampNumber(el.aiSuggestCount.value, 1, 5, DEFAULT_SETTINGS.aiSuggestCount),
    aiArgumentSeparator: normalizeAiArgumentSeparator(el.aiArgumentSeparator?.value),
    aiSystemPrompt: (el.aiSystemPrompt.value || "").trim() || DEFAULT_SETTINGS.aiSystemPrompt,
    aiReplyPrompt: (el.aiReplyPrompt?.value || "").trim() || DEFAULT_SETTINGS.aiReplyPrompt,
    aiReplyPromptWithIntent: (el.aiReplyPromptWithIntent?.value || "").trim() || DEFAULT_SETTINGS.aiReplyPromptWithIntent,
    changeEssayTemplate: (el.changeEssayTemplate?.value || "").trim() || DEFAULT_SETTINGS.changeEssayTemplate,
    aiReplyBranches: normalizeAiReplyBranches(state.settings.aiReplyBranches),
    aiExtensionRules: normalizeAiExtensionRules(state.settings.aiExtensionRules),
    defaultSignature: (el.defaultSignature.value || "").trim(),
    blacklistSites,
    quickClickRules: normalizeQuickClickRules(state.settings.quickClickRules),
    featureUsageStats: normalizeFeatureUsageStats(state.settings.featureUsageStats)
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: state.settings });
  state.snippets = normalizeSnippets(state.snippets);
  await persistSnippets();
  const isAiSubmit = event.currentTarget === el.aiSettingsForm;
  const isChangeHelperSubmit = event.currentTarget === el.changeHelperForm;
  if (isAiSubmit) {
    if (el.aiSettingsTip) {
      showActionFeedback(el.aiSettingsTip, "AI 基础配置已保存。", "模型、接口与全局提示词已生效。");
    }
    setTip(el.settingsTip, "", false);
    if (el.changeHelperTip) setTip(el.changeHelperTip, "", false);
  } else if (isChangeHelperSubmit) {
    if (el.changeHelperTip) {
      showActionFeedback(el.changeHelperTip, "异动处理配置已保存。", "悬浮窗生成模板与变量说明已生效。");
    }
    setTip(el.settingsTip, "", false);
    if (el.aiSettingsTip) setTip(el.aiSettingsTip, "", false);
  } else {
    showActionFeedback(el.settingsTip, "基础设置已保存。", "触发前缀、面板尺寸等配置已更新。");
    if (el.aiSettingsTip) setTip(el.aiSettingsTip, "", false);
    if (el.changeHelperTip) setTip(el.changeHelperTip, "", false);
  }
}

async function onResetAiSettings() {
  state.settings = normalizeSettings({
    ...state.settings,
    aiApiFormat: DEFAULT_SETTINGS.aiApiFormat,
    aiApiHostPreset: DEFAULT_SETTINGS.aiApiHostPreset,
    aiApiBaseUrl: DEFAULT_SETTINGS.aiApiBaseUrl,
    aiApiKey: DEFAULT_SETTINGS.aiApiKey,
    aiModel: DEFAULT_SETTINGS.aiModel,
    aiTriggerWord: DEFAULT_SETTINGS.aiTriggerWord,
    aiSuggestCount: DEFAULT_SETTINGS.aiSuggestCount,
    aiArgumentSeparator: DEFAULT_SETTINGS.aiArgumentSeparator,
    aiSystemPrompt: DEFAULT_SETTINGS.aiSystemPrompt,
    aiReplyPrompt: DEFAULT_SETTINGS.aiReplyPrompt,
    aiReplyPromptWithIntent: DEFAULT_SETTINGS.aiReplyPromptWithIntent,
    changeEssayTemplate: DEFAULT_SETTINGS.changeEssayTemplate
  });
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: state.settings });
  fillSettingsForm();
  showActionFeedback(el.aiSettingsTip, "AI 配置已恢复默认。", "基础模型、提示词与分隔符已重置。");
}

function fillSettingsForm() {
  el.triggerPrefixes.value = (state.settings.triggerPrefixes || ["/", "、"]).join(",");
  el.defaultSignature.value = state.settings.defaultSignature || "";
  if (el.monkeyEyeEnabled) {
    el.monkeyEyeEnabled.checked = state.settings.monkeyEyeEnabled === true;
  }
  if (el.autoSendImageConfirm) {
    el.autoSendImageConfirm.checked = state.settings.autoSendImageConfirm === true;
  }
  if (el.imageAutoSendStrategy) {
    el.imageAutoSendStrategy.value = ["click", "enter"].includes(state.settings.imageAutoSendStrategy)
      ? state.settings.imageAutoSendStrategy
      : "click";
  }
  updateImageAutoSendStrategyUI();
  el.completionMode.value = state.settings.completionMode || "manual";
  el.matchMode.value = state.settings.matchMode || "prefix";
  if (el.insertEffectScope) {
    el.insertEffectScope.value = state.settings.insertEffectScope || "both";
  }
  if (el.snippetEffectStyle) {
    el.snippetEffectStyle.value = state.settings.snippetEffectStyle || "cyber-flame";
  }
  if (el.snippetEffectIntensity) {
    el.snippetEffectIntensity.value = String(state.settings.snippetEffectIntensity || 100);
  }
  if (el.snippetEffectSize) {
    el.snippetEffectSize.value = String(state.settings.snippetEffectSize || 100);
  }
  if (el.snippetEffectSpread) {
    el.snippetEffectSpread.value = String(state.settings.snippetEffectSpread || 100);
  }
  if (el.snippetEffectDuration) {
    el.snippetEffectDuration.value = String(state.settings.snippetEffectDuration || 100);
  }
  if (el.aiEffectStyle) {
    el.aiEffectStyle.value = state.settings.aiEffectStyle || "magic-circle";
  }
  if (el.aiEffectIntensity) {
    el.aiEffectIntensity.value = String(state.settings.aiEffectIntensity || 100);
  }
  if (el.aiEffectSize) {
    el.aiEffectSize.value = String(state.settings.aiEffectSize || 100);
  }
  if (el.aiEffectSpread) {
    el.aiEffectSpread.value = String(state.settings.aiEffectSpread || 100);
  }
  if (el.aiEffectDuration) {
    el.aiEffectDuration.value = String(state.settings.aiEffectDuration || 100);
  }
  if (el.snippetEffectPrimaryColor) {
    el.snippetEffectPrimaryColor.value = state.settings.snippetEffectPrimaryColor || "#8b5cf6";
  }
  if (el.snippetEffectAccentColor) {
    el.snippetEffectAccentColor.value = state.settings.snippetEffectAccentColor || "#60a5fa";
  }
  if (el.aiEffectPrimaryColor) {
    el.aiEffectPrimaryColor.value = state.settings.aiEffectPrimaryColor || "#22d3ee";
  }
  if (el.aiEffectAccentColor) {
    el.aiEffectAccentColor.value = state.settings.aiEffectAccentColor || "#a78bfa";
  }
  el.suggestionWidth.value = String(state.settings.suggestionWidth || 360);
  el.suggestionHeight.value = String(state.settings.suggestionHeight || 280);
  el.suggestionFontSize.value = String(state.settings.suggestionFontSize || 13);
  if (el.suggestionRemoveHue) {
    el.suggestionRemoveHue.checked = state.settings.suggestionRemoveHue === true;
  }
  if (el.suggestionOpacity) {
    el.suggestionOpacity.value = String(state.settings.suggestionOpacity ?? 96);
  }
  if (el.suggestionSnippetDisplayMode) {
    el.suggestionSnippetDisplayMode.value = state.settings.suggestionSnippetDisplayMode || "content";
  }
  if (el.suggestionSnippetPreviewLength) {
    el.suggestionSnippetPreviewLength.value = String(state.settings.suggestionSnippetPreviewLength ?? 10);
  }
  if (el.suggestionOffsetX) {
    el.suggestionOffsetX.value = String(state.settings.suggestionOffsetX || 0);
  }
  if (el.suggestionOffsetY) {
    el.suggestionOffsetY.value = String(state.settings.suggestionOffsetY || 10);
  }
  if (el.suggestionExpandDirection) {
    el.suggestionExpandDirection.value = state.settings.suggestionExpandDirection || "prefer-up";
  }
  el.aiApiFormat.value = state.settings.aiApiFormat || DEFAULT_SETTINGS.aiApiFormat;
  el.aiApiHostPreset.value = state.settings.aiApiHostPreset || DEFAULT_SETTINGS.aiApiHostPreset;
  el.aiApiBaseUrl.value = state.settings.aiApiBaseUrl || DEFAULT_SETTINGS.aiApiBaseUrl;
  el.aiApiKey.value = state.settings.aiApiKey || "";
  el.aiModel.value = state.settings.aiModel || DEFAULT_SETTINGS.aiModel;
  el.aiTriggerWord.value = state.settings.aiTriggerWord || DEFAULT_SETTINGS.aiTriggerWord;
  el.aiSuggestCount.value = String(state.settings.aiSuggestCount || DEFAULT_SETTINGS.aiSuggestCount);
  if (el.aiArgumentSeparator) {
    el.aiArgumentSeparator.value = normalizeAiArgumentSeparator(state.settings.aiArgumentSeparator);
  }
  el.aiSystemPrompt.value = state.settings.aiSystemPrompt || DEFAULT_SETTINGS.aiSystemPrompt;
  if (el.aiReplyPrompt) {
    el.aiReplyPrompt.value = state.settings.aiReplyPrompt || DEFAULT_SETTINGS.aiReplyPrompt;
  }
  if (el.aiReplyPromptWithIntent) {
    el.aiReplyPromptWithIntent.value = state.settings.aiReplyPromptWithIntent || DEFAULT_SETTINGS.aiReplyPromptWithIntent;
  }
  if (el.changeEssayTemplate) {
    el.changeEssayTemplate.value = state.settings.changeEssayTemplate || DEFAULT_SETTINGS.changeEssayTemplate;
  }
  el.blacklistSites.value = (state.settings.blacklistSites || []).join("\n");
  renderActivationStatus();
  renderQuickClickList();
  renderAiReplyBranchList();
  renderAiExtensionRuleList();
  renderUsageStats();
}

async function onSaveQuickClickRule() {
  const rule = readQuickClickForm();
  if (!rule.hotkey) {
    setTip(el.quickClickTip, "请填写快捷键，例如 Alt+Q。", true);
    return;
  }
  if (rule.mode === "selector" && !rule.selector) {
    setTip(el.quickClickTip, "元素模式需要填写或选取 selector。", true);
    return;
  }
  const list = normalizeQuickClickRules(state.settings.quickClickRules);
  const index = list.findIndex((item) => item.id === rule.id);
  const next = index >= 0
    ? list.map((item) => item.id === rule.id ? rule : item)
    : [...list, rule];
  state.settings = normalizeSettings({ ...state.settings, quickClickRules: next });
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: state.settings });
  renderQuickClickList();
  resetQuickClickForm(false);
  setTip(el.quickClickTip, "快捷点击规则已保存。", false);
}

function readQuickClickForm() {
  return normalizeQuickClickRules([{
    id: el.quickClickId?.value || crypto.randomUUID(),
    enabled: el.quickClickEnabled?.checked !== false,
    name: el.quickClickName?.value || "",
    hotkey: el.quickClickHotkey?.value || "",
    mode: el.quickClickMode?.value || "selector",
    selector: el.quickClickSelector?.value || "",
    x: el.quickClickX?.value || 0,
    y: el.quickClickY?.value || 0,
    urlPattern: el.quickClickUrlPattern?.value || "",
    clickType: el.quickClickClickType?.value || "mouse"
  }])[0] || {
    id: el.quickClickId?.value || crypto.randomUUID(),
    enabled: el.quickClickEnabled?.checked !== false,
    name: (el.quickClickName?.value || "").trim() || "未命名快捷点击",
    hotkey: normalizeHotkey(el.quickClickHotkey?.value || ""),
    mode: el.quickClickMode?.value === "coordinate" ? "coordinate" : "selector",
    selector: (el.quickClickSelector?.value || "").trim(),
    x: clampNumber(el.quickClickX?.value, 0, 10000, 0),
    y: clampNumber(el.quickClickY?.value, 0, 10000, 0),
    urlPattern: (el.quickClickUrlPattern?.value || "").trim(),
    clickType: el.quickClickClickType?.value === "native" ? "native" : "mouse"
  };
}

function resetQuickClickForm(clearTip = true) {
  if (el.quickClickId) el.quickClickId.value = "";
  if (el.quickClickName) el.quickClickName.value = "";
  if (el.quickClickHotkey) el.quickClickHotkey.value = "";
  if (el.quickClickMode) el.quickClickMode.value = "selector";
  if (el.quickClickUrlPattern) el.quickClickUrlPattern.value = "";
  if (el.quickClickSelector) el.quickClickSelector.value = "";
  if (el.quickClickX) el.quickClickX.value = "";
  if (el.quickClickY) el.quickClickY.value = "";
  if (el.quickClickClickType) el.quickClickClickType.value = "mouse";
  if (el.quickClickEnabled) el.quickClickEnabled.checked = true;
  if (clearTip) setTip(el.quickClickTip, "", false);
}

function renderQuickClickList() {
  if (!el.quickClickTbody) return;
  const list = normalizeQuickClickRules(state.settings.quickClickRules);
  if (!list.length) {
    el.quickClickTbody.innerHTML = `<tr><td colspan="5" class="empty">暂无快捷点击规则</td></tr>`;
    return;
  }
  el.quickClickTbody.innerHTML = list.map((item) => {
    const target = item.mode === "coordinate"
      ? `坐标 (${item.x}, ${item.y})`
      : item.selector;
    return `
      <tr>
        <td>${item.enabled ? "" : "停用 · "}${escapeHtml(item.name)}</td>
        <td><code class="shortcut-tag">${escapeHtml(item.hotkey)}</code></td>
        <td><span class="quick-click-target" title="${escapeAttr(target)}">${escapeHtml(target)}</span></td>
        <td>${escapeHtml(item.urlPattern || "全部页面")}</td>
        <td>
          <button type="button" class="btn-text" data-action="edit-quick-click" data-id="${escapeAttr(item.id)}">编辑</button>
          <button type="button" class="btn-text danger" data-action="delete-quick-click" data-id="${escapeAttr(item.id)}">删除</button>
        </td>
      </tr>
    `;
  }).join("");
}

async function onQuickClickListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  const list = normalizeQuickClickRules(state.settings.quickClickRules);
  const item = list.find((row) => row.id === id);
  if (!item) return;
  if (action === "edit-quick-click") {
    fillQuickClickForm(item);
    setTip(el.quickClickTip, "已载入规则，可修改后保存。", false);
    return;
  }
  if (action === "delete-quick-click") {
    state.settings = normalizeSettings({
      ...state.settings,
      quickClickRules: list.filter((row) => row.id !== id)
    });
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: state.settings });
    renderQuickClickList();
    setTip(el.quickClickTip, "快捷点击规则已删除。", false);
  }
}

function fillQuickClickForm(item) {
  if (el.quickClickId) el.quickClickId.value = item.id;
  if (el.quickClickName) el.quickClickName.value = item.name;
  if (el.quickClickHotkey) el.quickClickHotkey.value = item.hotkey;
  if (el.quickClickMode) el.quickClickMode.value = item.mode;
  if (el.quickClickUrlPattern) el.quickClickUrlPattern.value = item.urlPattern || "";
  if (el.quickClickSelector) el.quickClickSelector.value = item.selector || "";
  if (el.quickClickX) el.quickClickX.value = item.x ? String(item.x) : "";
  if (el.quickClickY) el.quickClickY.value = item.y ? String(item.y) : "";
  if (el.quickClickClickType) el.quickClickClickType.value = item.clickType || "mouse";
  if (el.quickClickEnabled) el.quickClickEnabled.checked = item.enabled !== false;
}

async function startQuickClickPick(mode) {
  try {
    await sendMessageToRecentPage({ type: "tb-start-quick-click-pick", mode });
    setTip(el.quickClickTip, mode === "coordinate" ? "请回到目标网页点击一个坐标。" : "请回到目标网页点击要绑定的元素。", false);
  } catch (error) {
    setTip(el.quickClickTip, "无法进入选取模式，请确认目标网页已加载插件内容脚本后重试。", true);
  }
}

async function testQuickClickFromForm() {
  const rule = readQuickClickForm();
  try {
    const response = await sendMessageToRecentPage({ type: "tb-test-quick-click", rule });
    setTip(el.quickClickTip, response?.ok ? "已发送测试点击。" : `测试失败：${response?.error || "未找到目标"}`, !response?.ok);
  } catch (error) {
    setTip(el.quickClickTip, "测试失败，请确认目标网页已加载插件内容脚本。", true);
  }
}

async function sendMessageToRecentPage(message) {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const candidates = tabs
    .filter((tab) => tab.id && isWebTab(tab))
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  let lastError = null;
  for (const tab of candidates) {
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("no_content_tab");
}

function isWebTab(tab) {
  const url = String(tab.url || "");
  if (!url) return true;
  return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url);
}

function applyQuickClickPickedTarget(target) {
  if (!target || typeof target !== "object") return;
  if (target.mode === "coordinate") {
    if (el.quickClickMode) el.quickClickMode.value = "coordinate";
    if (el.quickClickX) el.quickClickX.value = String(target.x || 0);
    if (el.quickClickY) el.quickClickY.value = String(target.y || 0);
  } else {
    if (el.quickClickMode) el.quickClickMode.value = "selector";
    if (el.quickClickSelector) el.quickClickSelector.value = target.selector || "";
  }
  if (el.quickClickName && !el.quickClickName.value) {
    el.quickClickName.value = target.label ? `点击${target.label}` : "快捷点击";
  }
  if (el.quickClickUrlPattern && !el.quickClickUrlPattern.value) {
    el.quickClickUrlPattern.value = target.host || "";
  }
  setTip(el.quickClickTip, "已回填选取目标，请补充快捷键后保存。", false);
}

async function onSaveAiReplyBranch(event) {
  event.preventDefault();
  const id = el.aiReplyBranchId.value || "";
  const title = (el.aiReplyBranchTitle.value || "").trim() || "未命名分支";
  const keyword = normalizeQuery(el.aiReplyBranchKeyword.value || "");
  const prompt = (el.aiReplyBranchPrompt.value || "").trim();
  if (!keyword || !prompt) {
    setTip(el.aiReplyBranchTip, "分支词和提示词不能为空。", true);
    return;
  }
  const conflict = (state.settings.aiReplyBranches || []).find((item) => item.keyword === keyword && item.id !== id);
  if (conflict) {
    setTip(el.aiReplyBranchTip, `分支词冲突：${keyword}`, true);
    return;
  }
  const nextItem = { id: id || crypto.randomUUID(), title, keyword, prompt };
  const list = [...(state.settings.aiReplyBranches || [])];
  const nextList = id
    ? list.map((item) => item.id === id ? nextItem : item)
    : [nextItem, ...list];
  state.settings = normalizeSettings({ ...state.settings, aiReplyBranches: nextList });
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: state.settings });
  renderAiReplyBranchList();
  resetAiReplyBranchForm();
  showActionFeedback(el.aiReplyBranchTip, "AI 回复分支已保存。", `分支「${title}」已可通过 /ai${keyword} 调用。`);
}

function resetAiReplyBranchForm() {
  if (!el.aiReplyBranchForm) return;
  el.aiReplyBranchForm.reset();
  el.aiReplyBranchId.value = "";
  setTip(el.aiReplyBranchTip, "", false);
}

function renderAiReplyBranchList() {
  if (!el.aiReplyBranchTbody) return;
  const list = state.settings.aiReplyBranches || [];
  if (!list.length) {
    el.aiReplyBranchTbody.innerHTML = '<tr><td colspan="5" class="tip">暂无分支。输入 `ai` 默认走主提示词；可新增如 `追单`，触发 `/ai追单`。</td></tr>';
    return;
  }
  const usageMap = state.settings.featureUsageStats?.aiReplyBranches || {};
  el.aiReplyBranchTbody.innerHTML = list.map((item) => (
    `<tr>
      <td>${escapeHtml(item.title)}</td>
      <td><span class="shortcut-tag">/ai${escapeHtml(item.keyword)}</span></td>
      <td class="content-preview">${escapeHtml(item.prompt)}</td>
      <td>${usageMap[item.id]?.count || 0}</td>
      <td class="ops">
        <button type="button" class="btn-default" data-action="edit-ai-reply-branch" data-id="${escapeAttr(item.id)}">编辑</button>
        <button type="button" class="btn-default" data-action="delete-ai-reply-branch" data-id="${escapeAttr(item.id)}">删除</button>
      </td>
    </tr>`
  )).join("");
}

async function onAiReplyBranchListClick(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  const action = btn.getAttribute("data-action");
  if (!id || !action) return;
  const item = (state.settings.aiReplyBranches || []).find((row) => row.id === id);
  if (!item) return;
  if (action === "edit-ai-reply-branch") {
    el.aiReplyBranchId.value = item.id;
    el.aiReplyBranchTitle.value = item.title;
    el.aiReplyBranchKeyword.value = item.keyword;
    el.aiReplyBranchPrompt.value = item.prompt;
    setTip(el.aiReplyBranchTip, "已载入分支，修改后保存即可。", false);
    return;
  }
  if (action === "delete-ai-reply-branch") {
    if (!window.confirm(`确定删除 AI 回复分支「${item.title}」吗？`)) return;
    state.settings = normalizeSettings({
      ...state.settings,
      aiReplyBranches: (state.settings.aiReplyBranches || []).filter((row) => row.id !== id)
    });
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: state.settings });
    renderAiReplyBranchList();
    resetAiReplyBranchForm();
  }
}

async function onSaveAiExtensionRule(event) {
  event.preventDefault();
  const id = el.aiExtensionRuleId.value || "";
  const title = (el.aiExtensionRuleTitle.value || "").trim() || "未命名扩展";
  const keyword = normalizeQuery(el.aiExtensionRuleKeyword.value || "");
  const prompt = (el.aiExtensionRulePrompt.value || "").trim();
  if (!keyword || !prompt) {
    setTip(el.aiExtensionRuleTip, "关键词和提示词不能为空。", true);
    return;
  }
  const conflict = (state.settings.aiExtensionRules || []).find((item) => item.keyword === keyword && item.id !== id);
  if (conflict) {
    setTip(el.aiExtensionRuleTip, `关键词冲突：${keyword}`, true);
    return;
  }
  const nextItem = { id: id || crypto.randomUUID(), title, keyword, prompt };
  const list = [...(state.settings.aiExtensionRules || [])];
  const nextList = id
    ? list.map((item) => item.id === id ? nextItem : item)
    : [nextItem, ...list];
  state.settings = normalizeSettings({ ...state.settings, aiExtensionRules: nextList });
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: state.settings });
  renderAiExtensionRuleList();
  resetAiExtensionRuleForm();
  showActionFeedback(el.aiExtensionRuleTip, "AI 扩展规则已保存。", `规则「${title}」已可通过 /${keyword}*文本 调用。`);
}

function resetAiExtensionRuleForm() {
  if (!el.aiExtensionRuleForm) return;
  el.aiExtensionRuleForm.reset();
  el.aiExtensionRuleId.value = "";
  setTip(el.aiExtensionRuleTip, "", false);
}

function renderAiExtensionRuleList() {
  if (!el.aiExtensionRuleTbody) return;
  const list = state.settings.aiExtensionRules || [];
  if (!list.length) {
    el.aiExtensionRuleTbody.innerHTML = '<tr><td colspan="5" class="tip">暂无扩展规则。可新增如 `扩写`、`改造`，触发 `/扩写*原文`。</td></tr>';
    return;
  }
  const usageMap = state.settings.featureUsageStats?.aiExtensionRules || {};
  el.aiExtensionRuleTbody.innerHTML = list.map((item) => (
    `<tr>
      <td>${escapeHtml(item.title)}</td>
      <td><span class="shortcut-tag">/${escapeHtml(item.keyword)}${escapeHtml(state.settings.aiArgumentSeparator || "*")}</span></td>
      <td class="content-preview">${escapeHtml(item.prompt)}</td>
      <td>${usageMap[item.id]?.count || 0}</td>
      <td class="ops">
        <button type="button" class="btn-default" data-action="edit-ai-extension-rule" data-id="${escapeAttr(item.id)}">编辑</button>
        <button type="button" class="btn-default" data-action="delete-ai-extension-rule" data-id="${escapeAttr(item.id)}">删除</button>
      </td>
    </tr>`
  )).join("");
}

function renderUsageStats() {
  const stats = state.settings.featureUsageStats || createDefaultFeatureUsageStats();
  const snippetTotal = state.snippets.reduce((sum, item) => sum + Number(item.useCount || 0), 0);
  const aiRows = buildAiUsageRows(stats);
  const monkeyRows = buildMonkeyUsageRows(stats);
  const aiTotal = aiRows.reduce((sum, item) => sum + item.count, 0);
  const monkeyTotal = monkeyRows.reduce((sum, item) => sum + item.count, 0);
  const total = snippetTotal + aiTotal + monkeyTotal;

  if (el.usageTotalCount) el.usageTotalCount.textContent = String(total);
  if (el.usageSnippetTotal) el.usageSnippetTotal.textContent = String(snippetTotal);
  if (el.usageAiTotal) el.usageAiTotal.textContent = String(aiTotal);
  if (el.usageMonkeyTotal) el.usageMonkeyTotal.textContent = String(monkeyTotal);

  if (el.usageAiTbody) {
    el.usageAiTbody.innerHTML = aiRows.length
      ? aiRows.map((item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.trigger)}</td>
          <td>${item.count}</td>
          <td>${formatTime(item.lastUsedAt)}</td>
        </tr>
      `).join("")
      : '<tr><td colspan="4" class="tip">暂无 AI 功能使用记录。</td></tr>';
  }

  if (el.usageMonkeyTbody) {
    el.usageMonkeyTbody.innerHTML = monkeyRows.length
      ? monkeyRows.map((item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${item.count}</td>
          <td>${formatTime(item.lastUsedAt)}</td>
        </tr>
      `).join("")
      : '<tr><td colspan="3" class="tip">暂无猴目功能使用记录。</td></tr>';
  }

  if (el.usageSnippetTbody) {
    const topSnippets = [...state.snippets]
      .filter((item) => Number(item.useCount || 0) > 0)
      .sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
      .slice(0, 10);
    el.usageSnippetTbody.innerHTML = topSnippets.length
      ? topSnippets.map((item) => `
        <tr>
          <td>${escapeHtml(item.title)}</td>
          <td><span class="shortcut-tag">${escapeHtml(item.shortcut)}</span></td>
          <td>${item.useCount || 0}</td>
          <td>${formatTime(item.lastUsedAt)}</td>
        </tr>
      `).join("")
      : '<tr><td colspan="4" class="tip">暂无话术使用记录。</td></tr>';
  }
}

function buildAiUsageRows(stats) {
  const rows = [];
  const triggerWord = state.settings.aiTriggerWord || "ai";
  const separator = normalizeAiArgumentSeparator(state.settings.aiArgumentSeparator);
  const defaultEntry = normalizeUsageEntry(stats.aiReplyDefault);
  if (defaultEntry.count > 0) {
    rows.push({ name: "AI 默认建议", trigger: `/${triggerWord}`, ...defaultEntry });
  }
  const withIntentEntry = normalizeUsageEntry(stats.aiReplyWithIntent);
  if (withIntentEntry.count > 0) {
    rows.push({ name: "AI 带要求建议", trigger: `/${triggerWord}${separator}要求`, ...withIntentEntry });
  }
  const branchUsageMap = stats.aiReplyBranches || {};
  (state.settings.aiReplyBranches || []).forEach((item) => {
    const entry = normalizeUsageEntry(branchUsageMap[item.id]);
    if (entry.count > 0) {
      rows.push({
        name: `AI 分支 · ${item.title}`,
        trigger: `/${triggerWord}${item.keyword}`,
        ...entry
      });
    }
  });
  const extensionUsageMap = stats.aiExtensionRules || {};
  (state.settings.aiExtensionRules || []).forEach((item) => {
    const entry = normalizeUsageEntry(extensionUsageMap[item.id]);
    if (entry.count > 0) {
      rows.push({
        name: `AI 扩展 · ${item.title}`,
        trigger: `/${item.keyword}${separator}内容`,
        ...entry
      });
    }
  });
  return rows.sort((a, b) => (
    b.count - a.count
    || new Date(b.lastUsedAt || 0).getTime() - new Date(a.lastUsedAt || 0).getTime()
  ));
}

function buildMonkeyUsageRows(stats) {
  const rows = [];
  const copyEntry = normalizeUsageEntry(stats.monkeyCopy);
  if (copyEntry.count > 0) {
    rows.push({ name: "猴目复制备注", ...copyEntry });
  }
  const searchEntry = normalizeUsageEntry(stats.monkeySearch);
  if (searchEntry.count > 0) {
    rows.push({ name: "猴目搜索备注", ...searchEntry });
  }
  return rows.sort((a, b) => (
    b.count - a.count
    || new Date(b.lastUsedAt || 0).getTime() - new Date(a.lastUsedAt || 0).getTime()
  ));
}

async function onAiExtensionRuleListClick(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  const action = btn.getAttribute("data-action");
  if (!id || !action) return;
  const item = (state.settings.aiExtensionRules || []).find((row) => row.id === id);
  if (!item) return;
  if (action === "edit-ai-extension-rule") {
    el.aiExtensionRuleId.value = item.id;
    el.aiExtensionRuleTitle.value = item.title;
    el.aiExtensionRuleKeyword.value = item.keyword;
    el.aiExtensionRulePrompt.value = item.prompt;
    setTip(el.aiExtensionRuleTip, "已载入扩展规则，修改后保存即可。", false);
    return;
  }
  if (action === "delete-ai-extension-rule") {
    if (!window.confirm(`确定删除 AI 扩展规则「${item.title}」吗？`)) return;
    state.settings = normalizeSettings({
      ...state.settings,
      aiExtensionRules: (state.settings.aiExtensionRules || []).filter((row) => row.id !== id)
    });
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: state.settings });
    renderAiExtensionRuleList();
    resetAiExtensionRuleForm();
  }
}

async function onActivatePlugin() {
  const code = (el.activationCode?.value || "").trim();
  if (code !== "oaayeduangduangduang888") {
    setTip(el.settingsTip, "激活码错误，请重新输入。", true);
    return;
  }
  state.settings = normalizeSettings({
    ...state.settings,
    activated: true
  });
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: state.settings });
  renderActivationStatus();
  if (el.activationCode) {
    el.activationCode.value = "";
  }
  showActionFeedback(el.settingsTip, "插件已激活。", "猴目、快捷补全与 AI 功能现已全部解锁。");
}

function renderActivationStatus() {
  if (!el.activationStatus) return;
  const activated = state.settings.activated === true;
  el.activationStatus.textContent = activated ? "已激活" : "未激活";
  el.activationStatus.style.color = activated ? "#34d399" : "#f472b6";
}

function renderVersionInfo() {
  const manifest = chrome.runtime.getManifest();
  if (el.headerVersion) {
    el.headerVersion.textContent = `版本：${manifest.version}${manifest.version_name ? ` · ${manifest.version_name}` : ""}`;
  }
  if (el.versionHistorySettings) {
    el.versionHistorySettings.innerHTML = VERSION_HISTORY.map((item) => (
      `<div><strong>${item.version}</strong> · ${escapeHtml(item.notes)}</div>`
    )).join("");
  }
}

async function refreshShunfengerSettings() {
  if (!el.shunfengerForm) return;
  const response = await sendShunfengerRequest({ type: "GET_PANEL_SNAPSHOT" });
  if (response?.ok && response.snapshot) {
    shunfengerSnapshot = response.snapshot;
    shunfengerConfig = normalizeShunfengerConfig(response.snapshot.config || {});
    if (!shunfengerConfig.accounts.length && Array.isArray(response.snapshot.state?.accounts)) {
      shunfengerConfig.accounts = response.snapshot.state.accounts.map(normalizeShunfengerAccount).filter((item) => item.wxid);
    }
    renderShunfengerSettings();
    return;
  }
  shunfengerConfig = normalizeShunfengerConfig({});
  renderShunfengerSettings();
  setTip(el.sfSettingsTip, response?.error || "顺风耳配置读取失败。", true);
}

function renderShunfengerSettings() {
  if (!shunfengerConfig) shunfengerConfig = normalizeShunfengerConfig({});
  const snapshotState = shunfengerSnapshot?.state || {};
  if (el.sfRunningStatus) {
    const running = snapshotState.running === true || shunfengerConfig.running === true;
    el.sfRunningStatus.textContent = running ? "监听中" : "未启动";
    el.sfRunningStatus.style.color = running ? "#34d399" : "#f472b6";
  }
  if (el.sfStatusTip) {
    const leadCount = snapshotState.leadCount || shunfengerSnapshot?.leads?.length || 0;
    const accountCount = snapshotState.activeAccountCount || shunfengerConfig.accounts.filter((item) => item.enabled !== false).length;
    el.sfStatusTip.textContent = `当前账号 ${accountCount} 个，线索 ${leadCount} 条。`;
  }
  if (el.sfPollInterval) el.sfPollInterval.value = shunfengerConfig.pollIntervalSeconds;
  if (el.sfPageSize) el.sfPageSize.value = shunfengerConfig.pageSize;
  if (el.sfShowAllUnread) el.sfShowAllUnread.checked = shunfengerConfig.showAllUnread === true;
  renderShunfengerAccountRows();
  renderShunfengerLevelRows();
  renderShunfengerKeywordRows();
}

function renderShunfengerAccountRows() {
  if (!el.sfAccountRows) return;
  if (!shunfengerConfig.accounts.length) {
    el.sfAccountRows.innerHTML = '<div class="tip">暂无监听账号，可在 SCRM 页面点击“导入当前分组账号”。</div>';
    return;
  }
  el.sfAccountRows.innerHTML = shunfengerConfig.accounts.map((account, index) => `
    <div class="sf-row sf-account-row" data-sf-account-index="${index}">
      <label class="checkbox">
        <input type="checkbox" data-field="enabled" ${account.enabled !== false ? "checked" : ""} />
        启用
      </label>
      <label>
        显示名称
        <input type="text" data-field="label" value="${escapeAttr(account.label || "")}" placeholder="老师名称" />
      </label>
      <label>
        wxid
        <input type="text" data-field="wxid" value="${escapeAttr(account.wxid || "")}" placeholder="teacher wxid" />
      </label>
      <button class="sf-row-remove" type="button" data-action="remove-account">删</button>
    </div>
  `).join("");
}

function renderShunfengerLevelRows() {
  if (!el.sfLevelRows) return;
  if (!shunfengerConfig.levels.length) {
    el.sfLevelRows.innerHTML = '<div class="tip">暂无意向等级。</div>';
    return;
  }
  el.sfLevelRows.innerHTML = shunfengerConfig.levels.map((level, index) => `
    <div class="sf-row sf-level-row" data-sf-level-index="${index}">
      <label>
        等级名称
        <input type="text" data-field="label" value="${escapeAttr(level.label || "")}" placeholder="例如：超高意向" />
      </label>
      <label>
        等级标识
        <input type="text" data-field="id" value="${escapeAttr(level.id || "")}" placeholder="例如：very-high" />
      </label>
      <label>
        颜色
        <input type="color" data-field="color" value="${escapeAttr(normalizeHexColor(level.color, "#a855f7"))}" />
      </label>
      <div class="sf-level-preview" style="background: ${escapeAttr(normalizeHexColor(level.color, "#a855f7"))};">${escapeHtml(level.label || "意向等级")}</div>
      <button class="sf-row-remove" type="button" data-action="remove-level">删</button>
    </div>
  `).join("");
}

function renderShunfengerKeywordRows() {
  if (!el.sfKeywordRows) return;
  if (!shunfengerConfig.keywords.length) {
    el.sfKeywordRows.innerHTML = '<div class="tip">暂无关键词规则。</div>';
    return;
  }
  const levelOptions = shunfengerConfig.levels.map((level) => ({ id: level.id, label: level.label || level.id }));
  el.sfKeywordRows.innerHTML = shunfengerConfig.keywords.map((keyword, index) => `
    <div class="sf-row sf-keyword-row" data-sf-keyword-index="${index}">
      <label class="checkbox">
        <input type="checkbox" data-field="enabled" ${keyword.enabled !== false ? "checked" : ""} />
        启用
      </label>
      <label>
        关键词
        <input type="text" data-field="keyword" value="${escapeAttr(keyword.keyword || "")}" placeholder="例如：报名" />
      </label>
      <label>
        分类
        <input type="text" data-field="category" value="${escapeAttr(keyword.category || "")}" placeholder="例如：报名咨询" />
      </label>
      <label>
        意向等级
        <select data-field="level">
          ${levelOptions.map((level) => `<option value="${escapeAttr(level.id)}" ${keyword.level === level.id ? "selected" : ""}>${escapeHtml(level.label)}</option>`).join("")}
        </select>
      </label>
      <button class="sf-row-remove" type="button" data-action="remove-keyword">删</button>
    </div>
  `).join("");
}

async function onSaveShunfengerSettings(event) {
  event.preventDefault();
  readShunfengerForm();
  const response = await sendShunfengerRequest({ type: "SAVE_CONFIG", config: shunfengerConfig });
  if (response?.ok && response.snapshot) {
    shunfengerSnapshot = response.snapshot;
    shunfengerConfig = normalizeShunfengerConfig(response.snapshot.config || shunfengerConfig);
    renderShunfengerSettings();
    showActionFeedback(el.sfSettingsTip, "顺风耳设置已保存", "监听账号与关键词规则已更新。");
    return;
  }
  setTip(el.sfSettingsTip, response?.error || "顺风耳设置保存失败。", true);
}

function readShunfengerForm() {
  if (!shunfengerConfig) shunfengerConfig = normalizeShunfengerConfig({});
  shunfengerConfig.pollIntervalSeconds = Math.max(0.5, Number(el.sfPollInterval?.value || 0.5) || 0.5);
  shunfengerConfig.pageSize = Math.max(1, Math.min(100, Math.round(Number(el.sfPageSize?.value || 50) || 50)));
  shunfengerConfig.showAllUnread = el.sfShowAllUnread?.checked === true;
  shunfengerConfig.levels = readShunfengerLevelsFromForm();
  const fallbackLevel = shunfengerConfig.levels[0]?.id || "medium";
  const levelIds = new Set(shunfengerConfig.levels.map((level) => level.id));
  shunfengerConfig.accounts = Array.from(el.sfAccountRows?.querySelectorAll("[data-sf-account-index]") || []).map((row) => ({
    id: shunfengerConfig.accounts[Number(row.dataset.sfAccountIndex)]?.id || `teacher-${Date.now()}`,
    enabled: row.querySelector("[data-field='enabled']")?.checked !== false,
    label: row.querySelector("[data-field='label']")?.value.trim() || "",
    wxid: row.querySelector("[data-field='wxid']")?.value.trim() || ""
  })).filter((account) => account.wxid);
  shunfengerConfig.keywords = Array.from(el.sfKeywordRows?.querySelectorAll("[data-sf-keyword-index]") || []).map((row) => ({
    id: shunfengerConfig.keywords[Number(row.dataset.sfKeywordIndex)]?.id || `kw-${Date.now()}`,
    enabled: row.querySelector("[data-field='enabled']")?.checked !== false,
    keyword: row.querySelector("[data-field='keyword']")?.value.trim() || "",
    category: row.querySelector("[data-field='category']")?.value.trim() || "",
    level: levelIds.has(row.querySelector("[data-field='level']")?.value)
      ? row.querySelector("[data-field='level']").value
      : fallbackLevel
  })).filter((keyword) => keyword.keyword);
}

function readShunfengerLevelsFromForm() {
  const usedIds = new Set();
  const rows = Array.from(el.sfLevelRows?.querySelectorAll("[data-sf-level-index]") || []);
  const levels = rows.map((row, index) => {
    const source = shunfengerConfig.levels[Number(row.dataset.sfLevelIndex)] || {};
    const label = row.querySelector("[data-field='label']")?.value.trim() || source.label || `意向等级 ${index + 1}`;
    const rawId = row.querySelector("[data-field='id']")?.value.trim() || source.id || label;
    let id = slugifyShunfengerLevelId(rawId) || `level-${index + 1}`;
    while (usedIds.has(id)) id = `${id}-${index + 1}`;
    usedIds.add(id);
    return {
      id,
      label,
      color: normalizeHexColor(row.querySelector("[data-field='color']")?.value || source.color, DEFAULT_SHUNFENGER_LEVELS[index % DEFAULT_SHUNFENGER_LEVELS.length]?.color || "#a855f7")
    };
  }).filter((level) => level.id && level.label);
  return levels.length ? levels : DEFAULT_SHUNFENGER_LEVELS.map((level) => ({ ...level }));
}

async function importShunfengerAccounts() {
  setTip(el.sfSettingsTip, "正在从当前 SCRM 页面导入分组账号...", false);
  const response = await sendShunfengerRequest({ type: "IMPORT_CURRENT_GROUP_ACCOUNTS" });
  if (response?.ok && response.snapshot) {
    shunfengerSnapshot = response.snapshot;
    shunfengerConfig = normalizeShunfengerConfig(response.snapshot.config || {});
    if (Array.isArray(response.snapshot.state?.accounts)) {
      shunfengerConfig.accounts = response.snapshot.state.accounts.map(normalizeShunfengerAccount).filter((item) => item.wxid);
    }
    renderShunfengerSettings();
    showActionFeedback(el.sfSettingsTip, "账号已导入", `当前可监听账号 ${response.snapshot.state?.activeAccountCount || shunfengerConfig.accounts.length} 个。`);
    return;
  }
  setTip(el.sfSettingsTip, response?.error || "导入失败，请先切到 SCRM 分组页面。", true);
}

async function openShunfengerPanel() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ windowId: tab?.windowId });
    }
  } catch (error) {
    setTip(el.sfSettingsTip, error?.message || "无法打开线索面板。", true);
  }
}

function onShunfengerRowsClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || !shunfengerConfig) return;
  const accountRow = button.closest("[data-sf-account-index]");
  const levelRow = button.closest("[data-sf-level-index]");
  const keywordRow = button.closest("[data-sf-keyword-index]");
  if (button.dataset.action === "remove-account" && accountRow) {
    shunfengerConfig.accounts.splice(Number(accountRow.dataset.sfAccountIndex), 1);
    renderShunfengerAccountRows();
  }
  if (button.dataset.action === "remove-level" && levelRow) {
    readShunfengerForm();
    const removed = shunfengerConfig.levels.splice(Number(levelRow.dataset.sfLevelIndex), 1)[0];
    if (!shunfengerConfig.levels.length) {
      shunfengerConfig.levels = DEFAULT_SHUNFENGER_LEVELS.map((level) => ({ ...level }));
    }
    const fallbackLevel = shunfengerConfig.levels[0]?.id || "medium";
    if (removed?.id) {
      shunfengerConfig.keywords = shunfengerConfig.keywords.map((keyword) => keyword.level === removed.id ? { ...keyword, level: fallbackLevel } : keyword);
    }
    renderShunfengerSettings();
  }
  if (button.dataset.action === "remove-keyword" && keywordRow) {
    shunfengerConfig.keywords.splice(Number(keywordRow.dataset.sfKeywordIndex), 1);
    renderShunfengerKeywordRows();
  }
}

function onShunfengerLevelInput(event) {
  const row = event.target.closest("[data-sf-level-index]");
  if (!row) return;
  const preview = row.querySelector(".sf-level-preview");
  if (!preview) return;
  const label = row.querySelector("[data-field='label']")?.value.trim() || "意向等级";
  const color = normalizeHexColor(row.querySelector("[data-field='color']")?.value, "#a855f7");
  preview.textContent = label;
  preview.style.background = color;
}

function normalizeShunfengerConfig(raw) {
  const defaults = {
    running: false,
    pollIntervalSeconds: 0.5,
    pageSize: 50,
    showAllUnread: false,
    accounts: [],
    levels: DEFAULT_SHUNFENGER_LEVELS.map((level) => ({ ...level })),
    keywords: [
      { id: "kw-signup", keyword: "报名", category: "报名咨询", level: "high", enabled: true },
      { id: "kw-consult", keyword: "咨询", category: "报名咨询", level: "medium", enabled: true },
      { id: "kw-price", keyword: "多少钱", category: "价格咨询", level: "high", enabled: true },
      { id: "kw-course", keyword: "课程", category: "课程咨询", level: "medium", enabled: true }
    ]
  };
  const levels = Array.isArray(raw.levels) && raw.levels.length
    ? normalizeShunfengerLevels(raw.levels)
    : defaults.levels;
  const levelIds = new Set(levels.map((level) => level.id));
  const fallbackLevel = levels[0]?.id || "medium";
  return {
    ...defaults,
    ...raw,
    pollIntervalSeconds: Math.max(0.5, Number(raw.pollIntervalSeconds ?? defaults.pollIntervalSeconds) || defaults.pollIntervalSeconds),
    pageSize: Math.max(1, Math.min(100, Math.round(Number(raw.pageSize ?? defaults.pageSize) || defaults.pageSize))),
    showAllUnread: raw.showAllUnread === true,
    levels,
    accounts: Array.isArray(raw.accounts) ? raw.accounts.map(normalizeShunfengerAccount).filter((item) => item.wxid || item.label) : [],
    keywords: Array.isArray(raw.keywords) && raw.keywords.length
      ? raw.keywords.map((item) => normalizeShunfengerKeyword(item, levelIds, fallbackLevel)).filter((item) => item.keyword)
      : defaults.keywords
  };
}

function normalizeShunfengerLevels(items) {
  const usedIds = new Set();
  const levels = items.map((item, index) => {
    const fallback = DEFAULT_SHUNFENGER_LEVELS[index % DEFAULT_SHUNFENGER_LEVELS.length] || DEFAULT_SHUNFENGER_LEVELS[0];
    const label = String(item?.label || item?.name || fallback.label || `意向等级 ${index + 1}`).trim();
    let id = slugifyShunfengerLevelId(item?.id || item?.value || label) || fallback.id || `level-${index + 1}`;
    while (usedIds.has(id)) id = `${id}-${index + 1}`;
    usedIds.add(id);
    return {
      id,
      label,
      color: normalizeHexColor(item?.color, fallback.color)
    };
  }).filter((level) => level.id && level.label);
  return levels.length ? levels : DEFAULT_SHUNFENGER_LEVELS.map((level) => ({ ...level }));
}

function normalizeShunfengerAccount(item) {
  return {
    id: String(item?.id || `teacher-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    wxid: String(item?.wxid || "").trim(),
    label: String(item?.label || "").trim(),
    enabled: item?.enabled !== false
  };
}

function normalizeShunfengerKeyword(item, levelIds = new Set(DEFAULT_SHUNFENGER_LEVELS.map((level) => level.id)), fallbackLevel = "medium") {
  const candidateLevel = String(item?.level || "").trim();
  const level = levelIds.has(candidateLevel) ? candidateLevel : fallbackLevel;
  return {
    id: String(item?.id || `kw-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    keyword: String(item?.keyword || "").trim(),
    category: String(item?.category || "").trim(),
    level,
    enabled: item?.enabled !== false
  };
}

function createShunfengerKeyword() {
  return { id: `kw-${Date.now()}`, keyword: "", category: "报名咨询", level: shunfengerConfig?.levels?.[0]?.id || "medium", enabled: true };
}

function createShunfengerLevel() {
  const nextIndex = (shunfengerConfig?.levels?.length || 0) + 1;
  return { id: `level-${Date.now()}`, label: `意向等级 ${nextIndex}`, color: "#a855f7" };
}

function slugifyShunfengerLevelId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function normalizeHexColor(value, fallback = "#a855f7") {
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

async function sendShunfengerRequest(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

function applyAiBaseUrlPreset() {
  const preset = el.aiApiHostPreset.value;
  let nextFormat = el.aiApiFormat.value === "anthropic" ? "anthropic" : "openai";
  let baseUrl = "";

  if (preset === "minimax-cn") {
    baseUrl = nextFormat === "anthropic"
      ? "https://api.minimaxi.com/anthropic"
      : "https://api.minimaxi.com/v1";
  } else if (preset === "minimax-global") {
    baseUrl = nextFormat === "anthropic"
      ? "https://api.minimax.io/anthropic"
      : "https://api.minimax.io/v1";
  } else if (preset === "deepseek") {
    baseUrl = nextFormat === "anthropic"
      ? "https://api.deepseek.com/anthropic"
      : "https://api.deepseek.com";
  } else if (preset === "volcengine") {
    nextFormat = "openai";
    baseUrl = "https://ark.cn-beijing.volces.com/api/v3";
  } else {
    nextFormat = "openai";
    baseUrl = "https://api.minimaxi.com/v1";
  }

  el.aiApiFormat.value = nextFormat;
  el.aiApiBaseUrl.value = baseUrl;
}

async function persistSnippets() {
  await chrome.storage.local.set({ [STORAGE_KEYS.SNIPPETS]: state.snippets });
}

function normalizeSnippets(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const shortcut = String(item.shortcut || "");
      const type = item.type === "image" ? "image" : "text";
      return {
        id: String(item.id || crypto.randomUUID()),
        title: String(item.title || "未命名"),
        type,
        shortcut,
        shortcutNormalized: normalizeStoredShortcut(
          item.shortcutNormalized || shortcut,
          state.settings.triggerPrefixes
        ),
        category: String(item.category || ""),
        content: type === "image" ? "" : String(item.content || ""),
        imageName: type === "image" ? String(item.imageName || "") : "",
        imageMime: type === "image" ? String(item.imageMime || "image/png") : "",
        imageSize: type === "image" ? Number(item.imageSize || 0) : 0,
        imageData: type === "image" ? String(item.imageData || "") : "",
        autoSendAfterInsert: type === "image" && item.autoSendAfterInsert === true,
        useCount: Number(item.useCount || 0),
        createdAt: String(item.createdAt || new Date().toISOString()),
        lastUsedAt: item.lastUsedAt ? String(item.lastUsedAt) : undefined
      };
    })
    .filter((item) => item.shortcutNormalized);
}

  function normalizeSettings(raw) {
    return {
      enabled: raw.enabled !== false,
      activated: raw.activated === true,
      monkeyEyeEnabled: raw.monkeyEyeEnabled === true,
      autoSendImageConfirm: raw.autoSendImageConfirm === true,
      imageAutoSendStrategy: raw.imageAutoSendStrategy === "enter" ? "enter" : "click",
      aiReplySuggestEnabled: raw.aiReplySuggestEnabled === true,
    triggerPrefixes: parseTriggerPrefixes(raw.triggerPrefixes),
    completionMode: raw.completionMode === "auto" ? "auto" : "manual",
    matchMode: ["prefix", "contains", "exact"].includes(raw.matchMode) ? raw.matchMode : "prefix",
    suggestionWidth: clampNumber(raw.suggestionWidth, 220, 560, 360),
    suggestionHeight: clampNumber(raw.suggestionHeight, 120, 560, 280),
    suggestionFontSize: clampNumber(raw.suggestionFontSize, 12, 22, 13),
    suggestionRemoveHue: raw.suggestionRemoveHue === true,
    suggestionOpacity: clampNumber(raw.suggestionOpacity, 40, 100, 96),
    suggestionSnippetDisplayMode: ["title", "content", "both"].includes(raw.suggestionSnippetDisplayMode)
      ? raw.suggestionSnippetDisplayMode
      : "content",
    suggestionSnippetPreviewLength: clampNumber(raw.suggestionSnippetPreviewLength, 0, 30, 10),
    suggestionOffsetX: clampNumber(raw.suggestionOffsetX, -160, 160, 0),
    suggestionOffsetY: clampNumber(raw.suggestionOffsetY, -40, 120, 10),
    suggestionExpandDirection: ["auto", "prefer-up", "always-up", "always-down"].includes(raw.suggestionExpandDirection)
      ? raw.suggestionExpandDirection
      : "prefer-up",
    snippetEffectPrimaryColor: normalizeColorHex(raw.snippetEffectPrimaryColor, "#8b5cf6"),
    snippetEffectAccentColor: normalizeColorHex(raw.snippetEffectAccentColor, "#60a5fa"),
    aiEffectPrimaryColor: normalizeColorHex(raw.aiEffectPrimaryColor, "#22d3ee"),
    aiEffectAccentColor: normalizeColorHex(raw.aiEffectAccentColor, "#a78bfa"),
    aiApiFormat: raw.aiApiFormat === "anthropic" ? "anthropic" : "openai",
    aiApiHostPreset: ["minimax-cn", "minimax-global", "deepseek", "volcengine"].includes(raw.aiApiHostPreset)
      ? raw.aiApiHostPreset
      : "minimax-cn",
    aiApiBaseUrl: typeof raw.aiApiBaseUrl === "string" && raw.aiApiBaseUrl.trim()
      ? raw.aiApiBaseUrl.trim()
      : DEFAULT_SETTINGS.aiApiBaseUrl,
    aiApiKey: typeof raw.aiApiKey === "string" ? raw.aiApiKey : "",
    aiModel: typeof raw.aiModel === "string" && raw.aiModel.trim()
      ? raw.aiModel.trim()
      : DEFAULT_SETTINGS.aiModel,
    aiTriggerWord: normalizeQuery(raw.aiTriggerWord) || DEFAULT_SETTINGS.aiTriggerWord,
    aiSuggestCount: clampNumber(raw.aiSuggestCount, 1, 5, DEFAULT_SETTINGS.aiSuggestCount),
    aiArgumentSeparator: normalizeAiArgumentSeparator(raw.aiArgumentSeparator),
    aiSystemPrompt: typeof raw.aiSystemPrompt === "string" && raw.aiSystemPrompt.trim()
      ? raw.aiSystemPrompt.trim()
      : DEFAULT_SETTINGS.aiSystemPrompt,
    aiReplyPrompt: typeof raw.aiReplyPrompt === "string" && raw.aiReplyPrompt.trim()
      ? (raw.aiReplyPrompt.trim() === LEGACY_AI_REPLY_PROMPT
        ? DEFAULT_SETTINGS.aiReplyPrompt
        : raw.aiReplyPrompt.trim())
      : DEFAULT_SETTINGS.aiReplyPrompt,
    aiReplyPromptWithIntent: typeof raw.aiReplyPromptWithIntent === "string" && raw.aiReplyPromptWithIntent.trim()
      ? raw.aiReplyPromptWithIntent.trim()
      : DEFAULT_SETTINGS.aiReplyPromptWithIntent,
    changeEssayTemplate: typeof raw.changeEssayTemplate === "string" && raw.changeEssayTemplate.trim()
      ? raw.changeEssayTemplate.trim()
      : DEFAULT_SETTINGS.changeEssayTemplate,
    aiReplyBranches: normalizeAiReplyBranches(raw.aiReplyBranches),
    aiExtensionRules: normalizeAiExtensionRules(raw.aiExtensionRules || raw.aiPolishRules),
    insertEffectScope: ["off", "ai-only", "both"].includes(raw.insertEffectScope) ? raw.insertEffectScope : "both",
    snippetEffectStyle: normalizeEffectStyle(raw.snippetEffectStyle || raw.insertEffectStyle),
    snippetEffectIntensity: clampNumber(raw.snippetEffectIntensity ?? raw.insertEffectIntensity, 50, 200, 100),
    snippetEffectSize: clampNumber(raw.snippetEffectSize ?? raw.insertEffectSize, 50, 200, 100),
    snippetEffectSpread: clampNumber(raw.snippetEffectSpread ?? raw.insertEffectSpread, 50, 200, 100),
    snippetEffectDuration: clampNumber(raw.snippetEffectDuration ?? raw.insertEffectDuration, 50, 200, 100),
    aiEffectStyle: normalizeEffectStyle(raw.aiEffectStyle || raw.insertEffectStyle || "magic-circle"),
    aiEffectIntensity: clampNumber(raw.aiEffectIntensity ?? raw.insertEffectIntensity, 50, 200, 100),
    aiEffectSize: clampNumber(raw.aiEffectSize ?? raw.insertEffectSize, 50, 200, 100),
    aiEffectSpread: clampNumber(raw.aiEffectSpread ?? raw.insertEffectSpread, 50, 200, 100),
    aiEffectDuration: clampNumber(raw.aiEffectDuration ?? raw.insertEffectDuration, 50, 200, 100),
    defaultSignature: typeof raw.defaultSignature === "string" ? raw.defaultSignature : "",
    blacklistSites: Array.isArray(raw.blacklistSites)
      ? raw.blacklistSites.map((v) => String(v).trim().toLowerCase()).filter(Boolean)
      : [],
    quickClickRules: normalizeQuickClickRules(raw.quickClickRules),
    featureUsageStats: normalizeFeatureUsageStats(raw.featureUsageStats)
  };
}

function normalizeQuickClickRules(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((item) => {
      const mode = item?.mode === "coordinate" ? "coordinate" : "selector";
      const hotkey = normalizeHotkey(item?.hotkey);
      return {
        id: String(item?.id || crypto.randomUUID()),
        enabled: item?.enabled !== false,
        name: typeof item?.name === "string" && item.name.trim() ? item.name.trim() : "未命名快捷点击",
        hotkey,
        mode,
        selector: typeof item?.selector === "string" ? item.selector.trim() : "",
        x: clampNumber(item?.x, 0, 10000, 0),
        y: clampNumber(item?.y, 0, 10000, 0),
        urlPattern: typeof item?.urlPattern === "string" ? item.urlPattern.trim() : "",
        clickType: item?.clickType === "native" ? "native" : "mouse"
      };
    })
    .filter((item) => item.hotkey && (item.mode === "coordinate" || item.selector));
}

function normalizeHotkey(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const parts = text.split("+").map((part) => part.trim()).filter(Boolean);
  const mods = [];
  let key = "";
  parts.forEach((part) => {
    const lower = part.toLowerCase();
    if (["ctrl", "control"].includes(lower)) {
      if (!mods.includes("Ctrl")) mods.push("Ctrl");
    } else if (lower === "alt" || lower === "option") {
      if (!mods.includes("Alt")) mods.push("Alt");
    } else if (lower === "shift") {
      if (!mods.includes("Shift")) mods.push("Shift");
    } else if (lower === "meta" || lower === "cmd" || lower === "command") {
      if (!mods.includes("Meta")) mods.push("Meta");
    } else {
      key = part.length === 1 ? part.toUpperCase() : part;
    }
  });
  return key ? [...mods, key].join("+") : "";
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function parseTriggerPrefixes(raw) {
  const source = Array.isArray(raw) ? raw.join(",") : String(raw || "");
  const parsed = source
    .split(/[,\uFF0C\r\n]+/g)
    .map((v) => v.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [...DEFAULT_SETTINGS.triggerPrefixes];
}

function normalizeQuery(raw) {
  return String(raw || "").replace(/\s+/g, "").toLowerCase();
}

function normalizeStoredShortcut(raw, triggerPrefixes) {
  let value = normalizeQuery(raw);
  const prefixNormList = (triggerPrefixes || [])
    .map((p) => normalizeQuery(p))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let changed = true;
  while (changed && value) {
    changed = false;
    for (const prefix of prefixNormList) {
      if (value.startsWith(prefix)) {
        value = value.slice(prefix.length);
        changed = true;
        break;
      }
    }
  }
  return value;
}

function normalizeAiReplyBranches(raw) {
  const list = Array.isArray(raw) ? raw : DEFAULT_SETTINGS.aiReplyBranches;
  return list
    .map((item) => ({
      id: String(item?.id || crypto.randomUUID()),
      title: typeof item?.title === "string" && item.title.trim() ? item.title.trim() : "未命名分支",
      keyword: normalizeQuery(item && item.keyword),
      prompt: typeof item?.prompt === "string" ? item.prompt.trim() : ""
    }))
    .filter((item) => item.keyword && item.prompt);
}

function normalizeAiExtensionRules(raw) {
  const list = Array.isArray(raw) ? raw : DEFAULT_SETTINGS.aiExtensionRules;
  return list
    .map((item) => ({
      id: String(item?.id || crypto.randomUUID()),
      title: typeof item?.title === "string" && item.title.trim() ? item.title.trim() : "未命名扩展",
      keyword: normalizeQuery(item && item.keyword),
      prompt: typeof item?.prompt === "string" ? item.prompt.trim() : ""
    }))
    .filter((item) => item.keyword && item.prompt);
}

function normalizeEffectStyle(value) {
  return ["magic-circle", "cyber-flame", "nebula-trail", "pixel-burst", "lightning-arc", "feather-stream"].includes(value)
    ? value
    : "cyber-flame";
}

function normalizeAiArgumentSeparator(value) {
  return value === "+" ? "+" : "*";
}

function normalizeColorHex(value, fallback) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : fallback;
}

function ensureFeedbackToastHost() {
  if (document.getElementById("feedback-toast-host")) return;
  const host = document.createElement("div");
  host.id = "feedback-toast-host";
  host.className = "feedback-toast-host";
  document.body.appendChild(host);
}

function showActionFeedback(target, title, message, isError = false) {
  setTip(target, message, isError, isError ? "error" : "success");
  showToast(title, message, isError);
}

function showToast(title, message, isError = false) {
  ensureFeedbackToastHost();
  const host = document.getElementById("feedback-toast-host");
  if (!host) return;
  const toast = document.createElement("div");
  toast.className = `feedback-toast ${isError ? "error" : "success"}`;
  toast.innerHTML = `
    <div class="feedback-toast-title">${escapeHtml(title || (isError ? "操作失败" : "操作成功"))}</div>
    <div class="feedback-toast-desc">${escapeHtml(message || "")}</div>
  `;
  host.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });
  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 220);
  }, 1800);
}

function setTip(target, message, isError, variant = "info") {
  if (!target) return;
  target.textContent = message || "";
  target.classList.remove("tip-success", "tip-error", "tip-info");
  if (!message) return;
  if (isError) {
    target.classList.add("tip-error");
    return;
  }
  if (variant === "success") {
    target.classList.add("tip-success");
    return;
  }
  target.classList.add("tip-info");
}

function formatTime(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return String(value).replace(/"/g, "&quot;");
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

