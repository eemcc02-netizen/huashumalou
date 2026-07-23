import "./shunfenger-background.js";

const STORAGE_KEYS = {
  SNIPPETS: "tb-snippets",
  SETTINGS: "tb-settings",
  PENDING_SNIPPET: "tb-pending-snippet"
};

const LEGACY_AI_REPLY_PROMPT = "以下是聊天上下文：\n{{context}}\n\n请输出 {{count}} 条回复建议，要求：\n1) 每条一句，口语自然；\n2) 语气礼貌；\n3) 不要编造事实；\n4) 每条前加序号。";
const DEFAULT_CHANGE_ESSAY_TEMPLATE = "【异动处理】\n学员：{{名字}}\n课程：{{课程}}\n金额：{{金额}}\n\n您好，已收到您关于课程异动的申请，当前为您登记的信息如下：\n1. 学员姓名：{{名字}}\n2. 涉及课程：{{课程}}\n3. 涉及金额：{{金额}}\n\n我们会尽快为您核对并推进处理，如有进一步结果会第一时间同步给您。";

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
  featureUsageStats: createDefaultFeatureUsageStats()
};

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
    count: normalizeNumber(raw?.count, 0, Number.MAX_SAFE_INTEGER, 0),
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

const CONTEXT_MENU_ID = "tb-quick-save";

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureDefaults(details?.reason === "install");
  createContextMenu();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults(false);
  createContextMenu();
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) {
    return;
  }
  const text = (info.selectionText || "").trim();
  if (!text) {
    return;
  }
  await chrome.storage.local.set({
    [STORAGE_KEYS.PENDING_SNIPPET]: {
      content: text,
      createdAt: new Date().toISOString()
    }
  });
  await chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;
  if (message.type !== "tb-ai-generate") return;

  void (async () => {
    try {
      const payload = message.payload || {};
      const result = await requestAiSuggestion(payload.aiConfig || {}, String(payload.userPrompt || ""));
      sendResponse({ ok: true, data: result });
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error || "unknown error") });
    }
  })();

  return true;
});

async function ensureDefaults(lockActivationForInstall) {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.SNIPPETS,
    STORAGE_KEYS.SETTINGS
  ]);
  const patch = {};
  if (!Array.isArray(data[STORAGE_KEYS.SNIPPETS])) {
    patch[STORAGE_KEYS.SNIPPETS] = [];
  }
  if (!data[STORAGE_KEYS.SETTINGS]) {
    patch[STORAGE_KEYS.SETTINGS] = {
      ...DEFAULT_SETTINGS,
      activated: lockActivationForInstall ? false : true
    };
  } else {
    patch[STORAGE_KEYS.SETTINGS] = mergeSettings(data[STORAGE_KEYS.SETTINGS]);
  }
  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }
}

function mergeSettings(raw) {
  return {
    enabled: raw.enabled !== false,
    activated: raw.activated === true,
  monkeyEyeEnabled: raw.monkeyEyeEnabled === true,
  autoSendImageConfirm: raw.autoSendImageConfirm === true,
  imageAutoSendStrategy: raw.imageAutoSendStrategy === "enter" ? "enter" : "click",
  aiReplySuggestEnabled: raw.aiReplySuggestEnabled === true,
    aiApiFormat: raw.aiApiFormat === "anthropic" ? "anthropic" : "openai",
    aiApiHostPreset: normalizeHostPreset(raw.aiApiHostPreset),
    aiApiBaseUrl: typeof raw.aiApiBaseUrl === "string" && raw.aiApiBaseUrl.trim()
      ? raw.aiApiBaseUrl.trim()
      : DEFAULT_SETTINGS.aiApiBaseUrl,
    aiApiKey: typeof raw.aiApiKey === "string" ? raw.aiApiKey : "",
    aiModel: typeof raw.aiModel === "string" && raw.aiModel.trim()
      ? raw.aiModel.trim()
      : DEFAULT_SETTINGS.aiModel,
    aiTriggerWord: normalizeQuery(raw.aiTriggerWord) || DEFAULT_SETTINGS.aiTriggerWord,
    aiSuggestCount: normalizeNumber(raw.aiSuggestCount, 1, 5, DEFAULT_SETTINGS.aiSuggestCount),
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
    triggerPrefixes: Array.isArray(raw.triggerPrefixes) && raw.triggerPrefixes.length > 0
      ? raw.triggerPrefixes.map((v) => String(v)).filter(Boolean)
      : DEFAULT_SETTINGS.triggerPrefixes,
    completionMode: raw.completionMode === "auto" ? "auto" : "manual",
    matchMode: ["prefix", "contains", "exact"].includes(raw.matchMode) ? raw.matchMode : "prefix",
    insertEffectScope: ["off", "ai-only", "both"].includes(raw.insertEffectScope) ? raw.insertEffectScope : "both",
    snippetEffectStyle: normalizeEffectStyle(raw.snippetEffectStyle || raw.insertEffectStyle),
    snippetEffectIntensity: normalizeNumber(raw.snippetEffectIntensity ?? raw.insertEffectIntensity, 50, 200, 100),
    snippetEffectSize: normalizeNumber(raw.snippetEffectSize ?? raw.insertEffectSize, 50, 200, 100),
    snippetEffectSpread: normalizeNumber(raw.snippetEffectSpread ?? raw.insertEffectSpread, 50, 200, 100),
    snippetEffectDuration: normalizeNumber(raw.snippetEffectDuration ?? raw.insertEffectDuration, 50, 200, 100),
    aiEffectStyle: normalizeEffectStyle(raw.aiEffectStyle || raw.insertEffectStyle || "magic-circle"),
    aiEffectIntensity: normalizeNumber(raw.aiEffectIntensity ?? raw.insertEffectIntensity, 50, 200, 100),
    aiEffectSize: normalizeNumber(raw.aiEffectSize ?? raw.insertEffectSize, 50, 200, 100),
    aiEffectSpread: normalizeNumber(raw.aiEffectSpread ?? raw.insertEffectSpread, 50, 200, 100),
    aiEffectDuration: normalizeNumber(raw.aiEffectDuration ?? raw.insertEffectDuration, 50, 200, 100),
    suggestionWidth: normalizeNumber(raw.suggestionWidth, 220, 560, 360),
    suggestionHeight: normalizeNumber(raw.suggestionHeight, 120, 560, 280),
    suggestionFontSize: normalizeNumber(raw.suggestionFontSize, 12, 22, 13),
    suggestionRemoveHue: raw.suggestionRemoveHue === true,
    suggestionOpacity: normalizeNumber(raw.suggestionOpacity, 40, 100, 96),
    suggestionSnippetDisplayMode: ["title", "content", "both"].includes(raw.suggestionSnippetDisplayMode)
      ? raw.suggestionSnippetDisplayMode
      : "content",
    suggestionSnippetPreviewLength: normalizeNumber(raw.suggestionSnippetPreviewLength, 0, 30, 10),
    suggestionOffsetX: normalizeNumber(raw.suggestionOffsetX, -160, 160, 0),
    suggestionOffsetY: normalizeNumber(raw.suggestionOffsetY, -40, 120, 10),
    suggestionExpandDirection: ["auto", "prefer-up", "always-up", "always-down"].includes(raw.suggestionExpandDirection)
      ? raw.suggestionExpandDirection
      : "prefer-up",
    snippetEffectPrimaryColor: normalizeColorHex(raw.snippetEffectPrimaryColor, "#8b5cf6"),
    snippetEffectAccentColor: normalizeColorHex(raw.snippetEffectAccentColor, "#60a5fa"),
    aiEffectPrimaryColor: normalizeColorHex(raw.aiEffectPrimaryColor, "#22d3ee"),
    aiEffectAccentColor: normalizeColorHex(raw.aiEffectAccentColor, "#a78bfa"),
    defaultSignature: typeof raw.defaultSignature === "string" ? raw.defaultSignature : "",
    blacklistSites: Array.isArray(raw.blacklistSites)
      ? raw.blacklistSites.map((v) => String(v).trim()).filter(Boolean)
      : [],
    featureUsageStats: normalizeFeatureUsageStats(raw.featureUsageStats)
  };
}

const HOST_PRESET_MAP = {
  "minimax-cn": {
    host: "https://api.minimaxi.com",
    openaiBase: "https://api.minimaxi.com/v1",
    anthropicBase: "https://api.minimaxi.com/anthropic",
    supportedFormats: ["openai", "anthropic"]
  },
  "minimax-global": {
    host: "https://api.minimax.io",
    openaiBase: "https://api.minimax.io/v1",
    anthropicBase: "https://api.minimax.io/anthropic",
    supportedFormats: ["openai", "anthropic"]
  },
  deepseek: {
    host: "https://api.deepseek.com",
    openaiBase: "https://api.deepseek.com",
    anthropicBase: "https://api.deepseek.com/anthropic",
    supportedFormats: ["openai", "anthropic"]
  },
  volcengine: {
    host: "https://ark.cn-beijing.volces.com",
    openaiBase: "https://ark.cn-beijing.volces.com/api/v3",
    anthropicBase: "",
    supportedFormats: ["openai"]
  }
};

function normalizeHostPreset(value) {
  return HOST_PRESET_MAP[value] ? value : "minimax-cn";
}

function resolveApiFormat(config) {
  const preset = HOST_PRESET_MAP[normalizeHostPreset(config?.apiHostPreset)];
  const preferred = config?.apiFormat === "anthropic" ? "anthropic" : "openai";
  return preset.supportedFormats.includes(preferred) ? preferred : preset.supportedFormats[0];
}

function shouldUseMiniMaxExtraBody(config) {
  const preset = normalizeHostPreset(config?.apiHostPreset);
  return preset === "minimax-cn" || preset === "minimax-global";
}

function normalizeNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function normalizeQuery(raw) {
  return String(raw || "").replace(/\s+/g, "").toLowerCase();
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

function createContextMenu() {
  chrome.contextMenus.remove(CONTEXT_MENU_ID, () => {
    // Ignore "not found" and recreate idempotently after extension reloads.
    void chrome.runtime.lastError;
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "保存为话术片段",
      contexts: ["selection"]
    }, () => {
      void chrome.runtime.lastError;
    });
  });
}

function normalizeBaseUrl(baseUrl, apiFormat, hostPreset) {
  const preset = HOST_PRESET_MAP[normalizeHostPreset(hostPreset)];
  const raw = String(baseUrl || "").trim();
  const format = resolveApiFormat({ apiFormat, apiHostPreset: hostPreset });
  let normalized = raw || (format === "openai" ? preset.openaiBase : preset.anthropicBase);
  normalized = normalized.replace(/\/+$/, "");
  if (format === "openai") {
    if (/\/v1\/text\/chatcompletion_v2$/i.test(normalized)) return normalized;
    if (/\/chat\/completions$/i.test(normalized)) return normalized;
    if (/\/api\/v3$/i.test(normalized)) return `${normalized}/chat/completions`;
    if (/\/v1$/i.test(normalized)) return `${normalized}/chat/completions`;
    if (/api\.deepseek\.com$/i.test(normalized)) return `${normalized}/chat/completions`;
    return `${normalized}/chat/completions`;
  }
  if (/\/v1\/messages$/i.test(normalized)) return normalized;
  if (/\/anthropic$/i.test(normalized)) return `${normalized}/v1/messages`;
  if (/\/anthropic\/v1$/i.test(normalized)) return `${normalized}/messages`;
  return `${normalized}/anthropic/v1/messages`;
}

function getCandidateEndpoints(config) {
  const presetKey = normalizeHostPreset(config.apiHostPreset);
  const preset = HOST_PRESET_MAP[presetKey];
  const format = resolveApiFormat(config);
  const normalized = normalizeBaseUrl(config.apiBaseUrl, format, config.apiHostPreset);
  const candidates = [normalized];
  if (format === "anthropic") {
    candidates.push(`${preset.host}/anthropic/v1/messages`);
    candidates.push(`${preset.host}/v1/messages`);
  } else {
    if (presetKey === "minimax-cn" || presetKey === "minimax-global") {
      candidates.push(`${preset.host}/v1/text/chatcompletion_v2`);
      candidates.push(`${preset.host}/v1/chat/completions`);
    } else if (presetKey === "volcengine") {
      candidates.push(`${preset.host}/api/v3/chat/completions`);
    } else {
      candidates.push(`${preset.host}/chat/completions`);
      candidates.push(`${preset.host}/v1/chat/completions`);
    }
  }
  return [...new Set(candidates.map((v) => String(v || "").replace(/\/+$/, "")))];
}

function buildRequestInit(config, userPrompt, endpoint) {
  const format = resolveApiFormat(config);
  const apiKey = String(config.apiKey || "").trim();
  const model = String(config.model || "MiniMax-M2.7").trim();
  const systemPrompt = String(config.systemPrompt || "").trim();
  if (!apiKey) throw new Error("请先配置 AI API Key");
  if (!model) throw new Error("缺少模型名");

  if (format === "openai") {
    const payload = {
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    };
    if (shouldUseMiniMaxExtraBody(config)) {
      payload.extra_body = { reasoning_split: true };
    }
    return {
      endpoint,
      requestInit: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      }
    };
  }

  return {
    endpoint,
    requestInit: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: userPrompt }]
          }
        ]
      })
    }
  };
}

async function requestAiSuggestion(aiConfig, userPrompt) {
  const endpoints = getCandidateEndpoints(aiConfig);
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const req = buildRequestInit(aiConfig, userPrompt, endpoint);
      const response = await fetch(req.endpoint, req.requestInit);
      if (!response.ok) {
        const text = await response.text();
        const message = `(${response.status}) ${text.slice(0, 300)}`;
        if (response.status === 401 || response.status === 403) {
          throw new Error(`鉴权失败 ${message}`);
        }
        throw new Error(message);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(String(lastError?.message || "接口调用失败"));
}
