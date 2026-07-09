(() => {
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
    quickClickRules: [],
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
      count: clampNumber(raw?.count, 0, Number.MAX_SAFE_INTEGER, 0),
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
    return parsed.length > 0 ? parsed : ["/", "、"];
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

  function normalizeSettings(raw) {
    return {
      enabled: raw.enabled !== false,
      activated: raw.activated === true,
      monkeyEyeEnabled: raw.monkeyEyeEnabled === true,
      autoSendImageConfirm: raw.autoSendImageConfirm === true,
      imageAutoSendStrategy: raw.imageAutoSendStrategy === "enter" ? "enter" : "click",
      aiReplySuggestEnabled: raw.aiReplySuggestEnabled === true,
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
      triggerPrefixes: parseTriggerPrefixes(raw.triggerPrefixes),
      completionMode: raw.completionMode === "auto" ? "auto" : "manual",
      matchMode: ["prefix", "contains", "exact"].includes(raw.matchMode) ? raw.matchMode : "prefix",
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
      defaultSignature: typeof raw.defaultSignature === "string" ? raw.defaultSignature : "",
      blacklistSites: Array.isArray(raw.blacklistSites)
        ? raw.blacklistSites.map((v) => String(v).trim()).filter(Boolean)
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
    const parts = text
      .split("+")
      .map((part) => part.trim())
      .filter(Boolean);
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

  function normalizeSnippets(list, triggerPrefixes) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const shortcut = String(item.shortcut || "");
        const normalized = normalizeStoredShortcut(item.shortcutNormalized || shortcut, triggerPrefixes);
        return {
          id: String(item.id || crypto.randomUUID()),
          title: String(item.title || "未命名"),
          shortcut,
          shortcutNormalized: normalized,
          category: String(item.category || ""),
          content: String(item.content || ""),
          useCount: Number(item.useCount || 0),
          createdAt: String(item.createdAt || new Date().toISOString()),
          lastUsedAt: item.lastUsedAt ? String(item.lastUsedAt) : undefined
        };
      })
      .filter((item) => !!item.shortcutNormalized);
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

  window.NihaoSettings = {
    DEFAULT_SETTINGS,
    clampNumber,
    parseTriggerPrefixes,
    normalizeQuery,
    normalizeStoredShortcut,
    normalizeAiReplyBranches,
    normalizeAiExtensionRules,
    normalizeEffectStyle,
    createDefaultFeatureUsageStats,
    normalizeFeatureUsageStats,
    normalizeSettings,
    normalizeSnippets
  };
})();
