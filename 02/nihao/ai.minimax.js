(() => {
  const MODEL_OPTIONS = [
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed",
    "MiniMax-M2.5",
    "MiniMax-M2.5-highspeed",
    "MiniMax-M2.1",
    "MiniMax-M2.1-highspeed",
    "MiniMax-M2",
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "ep-20250101000000-xxxx"
  ];

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

  function normalizeHostPreset(hostPreset) {
    return HOST_PRESET_MAP[hostPreset] ? hostPreset : "minimax-cn";
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

  function getDefaultConfig() {
    return {
      apiFormat: "openai",
      apiHostPreset: "minimax-cn",
      apiBaseUrl: "https://api.minimaxi.com/v1",
      apiKey: "",
      model: "MiniMax-M2.7",
      suggestCount: 3,
      systemPrompt: "你是资深客服助手，请基于上下文生成简洁、礼貌、可直接发送的回复建议。"
    };
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

  function buildRequest(config, userPrompt) {
    const format = resolveApiFormat(config);
    const endpoint = normalizeBaseUrl(config.apiBaseUrl, format, config.apiHostPreset);
    const apiKey = String(config.apiKey || "").trim();
    const model = String(config.model || "MiniMax-M2.7").trim();
    const systemPrompt = String(config.systemPrompt || "").trim();

    if (!apiKey) {
      throw new Error("缺少 API Key");
    }
    if (!model) {
      throw new Error("缺少模型名");
    }

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

  function buildRequestCandidates(config, userPrompt) {
    const format = resolveApiFormat(config);
    const apiKey = String(config.apiKey || "").trim();
    const model = String(config.model || "MiniMax-M2.7").trim();
    const systemPrompt = String(config.systemPrompt || "").trim();
    if (!apiKey) throw new Error("缺少 API Key");
    if (!model) throw new Error("缺少模型名");

    const endpoints = getCandidateEndpoints(config);
    return endpoints.map((endpoint) => {
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
    });
  }

  function parseResponseText(apiFormat, responseJson) {
    if (apiFormat === "openai") {
      const content = responseJson?.choices?.[0]?.message?.content;
      if (Array.isArray(content)) {
        return content
          .map((item) => {
            if (typeof item === "string") return item;
            if (item && typeof item.text === "string") return item.text;
            return "";
          })
          .filter(Boolean)
          .join("\n")
          .trim();
      }
      return String(content || responseJson?.choices?.[0]?.text || "");
    }
    const blocks = Array.isArray(responseJson?.content) ? responseJson.content : [];
    const textFromBlocks = blocks
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item;
        if (typeof item.text === "string") return item.text;
        if (item.type === "text" && item.text) return String(item.text);
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
    if (textFromBlocks) return textFromBlocks;
    return String(
      responseJson?.output_text ||
      responseJson?.message?.content ||
      responseJson?.reply ||
      ""
    ).trim();
  }

  function parseSuggestions(text, limit) {
    const max = Math.min(5, Math.max(1, Number(limit || 3)));
    const cleanedText = String(text || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, " ")
      .replace(/<\/?think>/gi, " ")
      .trim();
    const lines = cleanedText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    let cleaned = lines
      .map((line) => line.replace(/^(\d+[\.\)、]|[-*])\s*/, "").trim())
      .filter((line) => !/^(上下文|context)\s*[:：]?$/i.test(line))
      .filter((line) => !/^(我|用户|学员|老师|客服)\s*[:：]/.test(line))
      .filter((line) => !/^用户让我/.test(line))
      .filter((line) => !/作为客服助手/.test(line))
      .filter(Boolean);
    if (cleaned.length === 0) return [];
    if (cleaned.length === 1) {
      // Fallback: split paragraph response into sentence-level suggestions
      const sentenceParts = cleaned[0]
        .split(/[。！？!?；;]\s*/g)
        .map((part) => part.trim())
        .filter(Boolean);
      if (sentenceParts.length > 1) {
        cleaned = sentenceParts;
      }
    }
    return cleaned.slice(0, max);
  }

  const api = {
    MODEL_OPTIONS,
    getDefaultConfig,
    normalizeBaseUrl,
    getCandidateEndpoints,
    buildRequest,
    buildRequestCandidates,
    parseResponseText,
    parseSuggestions
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }
  window.NihaoMiniMax = api;
})();
