const STORAGE_KEYS = {
  SETTINGS: "tb-settings",
  QUICK_CLICK_PENDING_TARGET: "tb-quick-click-pending-target",
  QUICK_CLICK_DRAFT: "tb-quick-click-draft"
};
const miniMax = window.NihaoMiniMax;
const LEGACY_AI_REPLY_PROMPT = "以下是聊天上下文：\n{{context}}\n\n请输出 {{count}} 条回复建议，要求：\n1) 每条一句，口语自然；\n2) 语气礼貌；\n3) 不要编造事实；\n4) 每条前加序号。";

document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("global-toggle");
  const monkeyEyeToggle = document.getElementById("monkey-eye-toggle");
  const autoSendImageToggle = document.getElementById("auto-send-image-toggle");
  const imageSendStrategyToggle = document.getElementById("image-send-strategy-toggle");
  const imageSendStrategyLabel = document.getElementById("image-send-strategy-label");
  const imageSendStrategyMenu = document.getElementById("image-send-strategy-menu");
  const aiReplyToggle = document.getElementById("ai-reply-toggle");
  const btnMonkeyMemo = document.getElementById("btn-monkey-memo");
  const activationPanel = document.getElementById("activation-panel");
  const activationCodeInput = document.getElementById("activation-code-input");
  const activationTip = document.getElementById("activation-tip");
  const btnActivatePlugin = document.getElementById("btn-activate-plugin");
  const btnValidateAi = document.getElementById("btn-validate-ai");
  const btnGenerateAi = document.getElementById("btn-generate-ai");
  const btnTestAi = document.getElementById("btn-test-ai");
  const btnChangeHelper = document.getElementById("btn-change-helper");
  const aiValidateResult = document.getElementById("ai-validate-result");
  const aiSuggestList = document.getElementById("ai-suggest-list");
  const aiDebugLog = document.getElementById("ai-debug-log");
  const statusText = document.getElementById("status-text");
  const btnSettings = document.getElementById("btn-settings");
  const quickClickId = document.getElementById("quick-click-id");
  const quickClickName = document.getElementById("quick-click-name");
  const quickClickUrlPattern = document.getElementById("quick-click-url-pattern");
  const quickClickTargetDisplay = document.getElementById("quick-click-target-display");
  const btnQuickClickCapture = document.getElementById("btn-quick-click-capture");
  const btnQuickClickNew = document.getElementById("btn-quick-click-new");
  const btnQuickClickPickElement = document.getElementById("btn-quick-click-pick-element");
  const btnQuickClickPickCoordinate = document.getElementById("btn-quick-click-pick-coordinate");
  const btnQuickClickSave = document.getElementById("btn-quick-click-save");
  const btnQuickClickTest = document.getElementById("btn-quick-click-test");
  const quickClickTip = document.getElementById("quick-click-tip");
  const quickClickList = document.getElementById("quick-click-list");

  let currentSettings = await loadCurrentSettings();
  let quickClickDraft = await loadQuickClickDraft();
  await applyPendingQuickClickTarget();
  quickClickDraft = await loadQuickClickDraft();
  syncToggles(currentSettings);
  fillQuickClickDraft(quickClickDraft);
  renderQuickClickRules();
  updateStatusUI(currentSettings.enabled !== false);
  applyActivationState(currentSettings.activated === true);

  if (toggle) {
    toggle.addEventListener("change", async (e) => {
      if (!(await ensureActivated())) {
        e.target.checked = false;
        return;
      }
      currentSettings = await persistSettings({ enabled: e.target.checked });
      updateStatusUI(currentSettings.enabled !== false);
    });
  }

  if (monkeyEyeToggle) {
    monkeyEyeToggle.addEventListener("change", async (e) => {
      if (!(await ensureActivated())) {
        e.target.checked = false;
        return;
      }
      currentSettings = await persistSettings({ monkeyEyeEnabled: e.target.checked });
      await notifyActiveTab("tb-sync-monkey-eye");
    });
  }

  if (autoSendImageToggle) {
    autoSendImageToggle.addEventListener("change", async (e) => {
      if (!(await ensureActivated())) {
        e.target.checked = false;
        return;
      }
      currentSettings = await persistSettings({ autoSendImageConfirm: e.target.checked });
    });
  }

  if (imageSendStrategyToggle) {
    imageSendStrategyToggle.addEventListener("click", async (event) => {
      if (!(await ensureActivated())) return;
      event.stopPropagation();
      toggleImageStrategyMenu();
    });
  }

  if (imageSendStrategyMenu) {
    imageSendStrategyMenu.addEventListener("click", async (event) => {
      const option = event.target?.closest?.("[data-strategy]");
      if (!option) return;
      const next = option.dataset.strategy === "enter" ? "enter" : "click";
      currentSettings = await persistSettings({ imageAutoSendStrategy: next });
      closeImageStrategyMenu();
      syncToggles(currentSettings);
    });
  }

  document.addEventListener("click", closeImageStrategyMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeImageStrategyMenu();
  });

  if (aiReplyToggle) {
    aiReplyToggle.addEventListener("change", async (e) => {
      if (!(await ensureActivated())) {
        e.target.checked = false;
        return;
      }
      currentSettings = await persistSettings({ aiReplySuggestEnabled: e.target.checked });
    });
  }

  if (btnMonkeyMemo) {
    btnMonkeyMemo.addEventListener("click", async () => {
      if (!(await ensureActivated())) return;
      await notifyActiveTab("tb-toggle-monkey-memo");
      window.close();
    });
  }

  if (btnChangeHelper) {
    btnChangeHelper.addEventListener("click", async () => {
      if (!(await ensureActivated())) return;
      await notifyActiveTab("tb-toggle-change-helper");
      window.close();
    });
  }

  if (btnActivatePlugin) {
    btnActivatePlugin.addEventListener("click", async () => {
      const code = (activationCodeInput.value || "").trim();
      if (code !== "oaayeduangduangduang888") {
        activationTip.textContent = "激活码错误。";
        return;
      }
      currentSettings = await persistSettings({ activated: true });
      activationTip.textContent = "激活成功，神功已解锁。";
      applyActivationState(true);
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes[STORAGE_KEYS.SETTINGS]) {
      currentSettings = changes[STORAGE_KEYS.SETTINGS].newValue || {};
      syncToggles(currentSettings);
      renderQuickClickRules();
      updateStatusUI(currentSettings.enabled !== false);
      applyActivationState(currentSettings.activated === true);
    }
    if (changes[STORAGE_KEYS.QUICK_CLICK_DRAFT]) {
      quickClickDraft = normalizeQuickClickDraft(changes[STORAGE_KEYS.QUICK_CLICK_DRAFT].newValue);
      fillQuickClickDraft(quickClickDraft);
    }
  });

  btnValidateAi.addEventListener("click", async () => {
    if (!(await ensureActivated())) return;
    aiValidateResult.textContent = "正在识别...";
    aiSuggestList.innerHTML = "";
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        aiValidateResult.textContent = "未获取到当前标签页。";
        return;
      }
      const merged = await collectConversationFromTab(tab.id);
      if (merged.total === 0) {
        aiValidateResult.textContent = "未识别到聊天 div.msg-text，请确认当前在 SCRM 聊天窗口页面。";
        return;
      }
      aiValidateResult.textContent =
        `识别到 ${merged.total} 条：用户 ${merged.userCount}，我方 ${merged.meCount}。` +
        (merged.preview ? ` 预览：${merged.preview}` : "");
      renderDebug(aiDebugLog, {
        stage: "scan_ok",
        total: merged.total,
        userCount: merged.userCount,
        meCount: merged.meCount
      });
    } catch (error) {
      aiValidateResult.textContent = `识别失败：${error?.message || "请刷新页面后重试"}`;
      renderDebug(aiDebugLog, { stage: "scan_error", message: String(error?.message || error) });
    }
  });

  btnGenerateAi.addEventListener("click", async () => {
    if (!(await ensureActivated())) return;
    aiSuggestList.innerHTML = "";
    aiValidateResult.textContent = "正在生成建议...";
    btnGenerateAi.disabled = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        aiValidateResult.textContent = "未获取到当前标签页。";
        return;
      }
      const merged = await collectConversationFromTab(tab.id);
      if (merged.total === 0) {
        aiValidateResult.textContent = "未识别到可用对话内容，请先在聊天窗口点击验证。";
        return;
      }

      const currentData = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      const aiConfig = getAiConfig(currentData[STORAGE_KEYS.SETTINGS] || {});
      const userPrompt = buildConversationPrompt(merged.messages, aiConfig.suggestCount, aiConfig.replyPrompt);
      const built = miniMax.buildRequest(aiConfig, userPrompt);
      renderDebug(aiDebugLog, {
        stage: "request",
        apiFormat: aiConfig.apiFormat,
        endpoint: built.endpoint,
        model: aiConfig.model,
        totalMessages: merged.messages.length,
        promptChars: userPrompt.length
      });

      const data = await requestWithFallback(aiConfig, userPrompt, aiDebugLog);
      const content = miniMax.parseResponseText(aiConfig.apiFormat, data);
      const suggestions = miniMax.parseSuggestions(content, aiConfig.suggestCount);
      if (!suggestions.length) {
        aiValidateResult.textContent = "已调用成功，但未解析出建议内容。";
        renderDebug(aiDebugLog, { stage: "empty", raw: JSON.stringify(data).slice(0, 600) });
        return;
      }
      renderSuggestions(aiSuggestList, suggestions);
      aiValidateResult.textContent = `已生成 ${suggestions.length} 条建议。`;
      renderDebug(aiDebugLog, {
        stage: "ok",
        firstSuggestion: suggestions[0]
      });
    } catch (error) {
      aiValidateResult.textContent = `生成失败：${error?.message || "请检查配置"}`;
      renderDebug(aiDebugLog, { stage: "error", message: String(error?.message || error) });
    } finally {
      btnGenerateAi.disabled = false;
    }
  });

  btnTestAi.addEventListener("click", async () => {
    if (!(await ensureActivated())) return;
    aiValidateResult.textContent = "正在测试 AI 接口...";
    aiSuggestList.innerHTML = "";
    btnTestAi.disabled = true;
    try {
      const currentData = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      const aiConfig = getAiConfig(currentData[STORAGE_KEYS.SETTINGS] || {});
      const built = miniMax.buildRequest(
        aiConfig,
        "请返回两条简短中文客服回复建议，分别处理“未找到入口”和“需要等待处理”场景。"
      );
      renderDebug(aiDebugLog, {
        stage: "test_request",
        apiFormat: aiConfig.apiFormat,
        endpoint: built.endpoint,
        model: aiConfig.model
      });
      const data = await requestWithFallback(
        aiConfig,
        "请返回两条简短中文客服回复建议，分别处理“未找到入口”和“需要等待处理”场景。",
        aiDebugLog
      );
      const content = miniMax.parseResponseText(aiConfig.apiFormat, data);
      const suggestions = miniMax.parseSuggestions(content, 2);
      renderSuggestions(aiSuggestList, suggestions.length ? suggestions : ["接口可用，但未解析到标准序号回复。"]);
      aiValidateResult.textContent = "接口测试成功。";
      renderDebug(aiDebugLog, { stage: "test_ok", preview: String(content).slice(0, 300) });
    } catch (error) {
      aiValidateResult.textContent = `接口测试失败：${error?.message || "请检查配置"}`;
      renderDebug(aiDebugLog, { stage: "test_error", message: String(error?.message || error) });
    } finally {
      btnTestAi.disabled = false;
    }
  });

  if (btnQuickClickCapture) {
    btnQuickClickCapture.addEventListener("click", () => {
      btnQuickClickCapture.textContent = "请按下快捷键...";
      btnQuickClickCapture.classList.add("is-capturing");
      window.addEventListener("keydown", captureQuickClickHotkey, { once: true, capture: true });
    });
  }

  if (btnQuickClickNew) {
    btnQuickClickNew.addEventListener("click", async () => {
      quickClickDraft = createQuickClickDraft();
      await saveQuickClickDraft(quickClickDraft);
      fillQuickClickDraft(quickClickDraft);
      setQuickClickTip("已新建草稿。");
    });
  }

  if (quickClickName) {
    quickClickName.addEventListener("input", () => {
      void updateQuickClickDraftFromForm();
    });
  }

  if (quickClickUrlPattern) {
    quickClickUrlPattern.addEventListener("input", () => {
      void updateQuickClickDraftFromForm();
    });
  }

  if (btnQuickClickPickElement) {
    btnQuickClickPickElement.addEventListener("click", () => startQuickClickPickFromPopup("selector"));
  }

  if (btnQuickClickPickCoordinate) {
    btnQuickClickPickCoordinate.addEventListener("click", () => startQuickClickPickFromPopup("coordinate"));
  }

  if (btnQuickClickSave) {
    btnQuickClickSave.addEventListener("click", saveQuickClickRuleFromPopup);
  }

  if (btnQuickClickTest) {
    btnQuickClickTest.addEventListener("click", testQuickClickRuleFromPopup);
  }

  if (quickClickList) {
    quickClickList.addEventListener("click", onQuickClickListClick);
  }

  btnSettings.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  function updateStatusUI(enabled) {
    if (enabled) {
      statusText.textContent = "已启用";
      statusText.style.color = "#34d399";
      statusText.style.textShadow = "0 0 8px rgba(52, 211, 153, 0.4)";
    } else {
      statusText.textContent = "已停用";
      statusText.style.color = "#94a3b8";
      statusText.style.textShadow = "none";
    }
  }

  function applyActivationState(activated) {
    if (activationPanel) {
      activationPanel.style.display = activated ? "none" : "block";
    }
    const disabled = !activated;
    if (toggle) toggle.disabled = disabled;
    if (monkeyEyeToggle) monkeyEyeToggle.disabled = disabled;
    if (autoSendImageToggle) autoSendImageToggle.disabled = disabled;
    if (imageSendStrategyToggle) imageSendStrategyToggle.disabled = disabled;
    if (aiReplyToggle) aiReplyToggle.disabled = disabled;
    btnMonkeyMemo.disabled = disabled;
    btnChangeHelper.disabled = disabled;
    btnValidateAi.disabled = disabled;
    btnGenerateAi.disabled = disabled;
    btnTestAi.disabled = disabled;
    btnQuickClickCapture.disabled = disabled;
    btnQuickClickNew.disabled = disabled;
    btnQuickClickPickElement.disabled = disabled;
    btnQuickClickPickCoordinate.disabled = disabled;
    btnQuickClickSave.disabled = disabled;
    btnQuickClickTest.disabled = disabled;
    if (!activated) {
      statusText.textContent = "未激活";
      statusText.style.color = "#f472b6";
      statusText.style.textShadow = "0 0 8px rgba(244, 114, 182, 0.4)";
    } else {
      updateStatusUI(toggle.checked);
    }
  }

  function toggleImageStrategyMenu() {
    if (!imageSendStrategyMenu || !imageSendStrategyToggle) return;
    const willOpen = imageSendStrategyMenu.hidden;
    imageSendStrategyMenu.hidden = !willOpen;
    imageSendStrategyToggle.setAttribute("aria-expanded", String(willOpen));
  }

  function closeImageStrategyMenu() {
    if (!imageSendStrategyMenu || !imageSendStrategyToggle) return;
    imageSendStrategyMenu.hidden = true;
    imageSendStrategyToggle.setAttribute("aria-expanded", "false");
  }

  function syncToggles(settings) {
    if (toggle) toggle.checked = settings.enabled !== false;
    if (monkeyEyeToggle) monkeyEyeToggle.checked = settings.monkeyEyeEnabled === true;
    if (autoSendImageToggle) autoSendImageToggle.checked = settings.autoSendImageConfirm === true;
    const strategy = settings.imageAutoSendStrategy === "enter" ? "enter" : "click";
    if (imageSendStrategyLabel) {
      imageSendStrategyLabel.textContent = strategy === "enter" ? "回车发送" : "自动发送";
    }
    if (imageSendStrategyToggle) {
      imageSendStrategyToggle.title = `当前：${strategy === "enter" ? "回车发送" : "自动发送"}`;
    }
    if (imageSendStrategyMenu) {
      imageSendStrategyMenu.querySelectorAll("[data-strategy]").forEach((option) => {
        option.classList.toggle("is-active", option.dataset.strategy === strategy);
      });
    }
    if (aiReplyToggle) aiReplyToggle.checked = settings.aiReplySuggestEnabled === true;
  }

  async function loadCurrentSettings() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return data[STORAGE_KEYS.SETTINGS] || {};
  }

  async function persistSettings(patch) {
    const latest = await loadCurrentSettings();
    const next = { ...latest, ...patch };
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
    return next;
  }

  async function ensureActivated() {
    currentSettings = await loadCurrentSettings();
    const activated = currentSettings.activated === true;
    if (!activated) {
      applyActivationState(false);
      activationTip.textContent = "请先输入激活码。";
      return false;
    }
    return true;
  }

  async function captureQuickClickHotkey(event) {
    event.preventDefault();
    event.stopPropagation();
    const hotkey = hotkeyFromKeyboardEvent(event);
    if (!hotkey) {
      btnQuickClickCapture.textContent = "点击识别按键";
      btnQuickClickCapture.classList.remove("is-capturing");
      setQuickClickTip("没有识别到有效按键，请重试。", true);
      return;
    }
    quickClickDraft = normalizeQuickClickDraft({ ...quickClickDraft, hotkey });
    await saveQuickClickDraft(readQuickClickDraftFromForm(quickClickDraft));
    fillQuickClickDraft(quickClickDraft);
    setQuickClickTip(`已识别快捷键：${hotkey}`);
  }

  async function updateQuickClickDraftFromForm() {
    quickClickDraft = readQuickClickDraftFromForm(quickClickDraft);
    await saveQuickClickDraft(quickClickDraft);
  }

  async function startQuickClickPickFromPopup(mode) {
    if (!(await ensureActivated())) return;
    quickClickDraft = readQuickClickDraftFromForm(quickClickDraft);
    await saveQuickClickDraft(quickClickDraft);
    try {
      await sendMessageToActiveContent({ type: "tb-start-quick-click-pick", mode });
      setQuickClickTip(mode === "coordinate" ? "已进入坐标选取，去网页点一下目标位置。" : "已进入元素选取，去网页点一下 button/div。");
      window.close();
    } catch (error) {
      setQuickClickTip(`无法进入选取模式：${error?.message || "请刷新网页后重试"}`, true);
    }
  }

  async function saveQuickClickRuleFromPopup() {
    if (!(await ensureActivated())) return;
    const rule = readQuickClickDraftFromForm(quickClickDraft);
    if (!rule.name) {
      setQuickClickTip("先给这条快捷点击起个名字。", true);
      return;
    }
    if (!rule.hotkey) {
      setQuickClickTip("请点击识别按键，录入快捷键。", true);
      return;
    }
    if (rule.mode === "coordinate" && (!Number.isFinite(rule.x) || !Number.isFinite(rule.y))) {
      setQuickClickTip("请先选取坐标。", true);
      return;
    }
    if (rule.mode !== "coordinate" && !rule.selector) {
      setQuickClickTip("请先选取元素。", true);
      return;
    }
    const list = normalizeQuickClickRules(currentSettings.quickClickRules);
    const index = list.findIndex((item) => item.id === rule.id);
    const next = index >= 0
      ? list.map((item) => item.id === rule.id ? rule : item)
      : [...list, rule];
    currentSettings = await persistSettings({ quickClickRules: next });
    renderQuickClickRules();
    setQuickClickTip("快捷点击已保存。");
  }

  async function testQuickClickRuleFromPopup() {
    if (!(await ensureActivated())) return;
    const rule = readQuickClickDraftFromForm(quickClickDraft);
    try {
      const response = await sendMessageToActiveContent({ type: "tb-test-quick-click", rule });
      setQuickClickTip(response?.ok ? "已发送测试点击。" : `测试失败：${response?.error || "未找到目标"}`, !response?.ok);
    } catch (error) {
      setQuickClickTip(`测试失败：${error?.message || "请刷新网页后重试"}`, true);
    }
  }

  async function onQuickClickListClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    const list = normalizeQuickClickRules(currentSettings.quickClickRules);
    const item = list.find((rule) => rule.id === id);
    if (!item) return;
    if (action === "edit") {
      quickClickDraft = normalizeQuickClickDraft(item);
      await saveQuickClickDraft(quickClickDraft);
      fillQuickClickDraft(quickClickDraft);
      setQuickClickTip("已载入这条规则，可修改后保存。");
      return;
    }
    if (action === "delete") {
      currentSettings = await persistSettings({ quickClickRules: list.filter((rule) => rule.id !== id) });
      renderQuickClickRules();
      if (quickClickDraft.id === id) {
        quickClickDraft = createQuickClickDraft();
        await saveQuickClickDraft(quickClickDraft);
        fillQuickClickDraft(quickClickDraft);
      }
      setQuickClickTip("已删除。");
    }
  }

  async function applyPendingQuickClickTarget() {
    const data = await chrome.storage.local.get([STORAGE_KEYS.QUICK_CLICK_PENDING_TARGET, STORAGE_KEYS.QUICK_CLICK_DRAFT]);
    const pending = data[STORAGE_KEYS.QUICK_CLICK_PENDING_TARGET];
    if (!pending || typeof pending !== "object") return;
    const draft = normalizeQuickClickDraft(data[STORAGE_KEYS.QUICK_CLICK_DRAFT]);
    const next = normalizeQuickClickDraft({
      ...draft,
      name: draft.name || (pending.label ? `点击${pending.label}` : "快捷点击"),
      mode: pending.mode === "coordinate" ? "coordinate" : "selector",
      selector: pending.selector || draft.selector,
      x: Number.isFinite(Number(pending.x)) ? Number(pending.x) : draft.x,
      y: Number.isFinite(Number(pending.y)) ? Number(pending.y) : draft.y,
      urlPattern: draft.urlPattern || pending.host || ""
    });
    await chrome.storage.local.set({ [STORAGE_KEYS.QUICK_CLICK_DRAFT]: next });
    await chrome.storage.local.remove(STORAGE_KEYS.QUICK_CLICK_PENDING_TARGET);
  }

  function fillQuickClickDraft(draft) {
    if (quickClickId) quickClickId.value = draft.id;
    if (quickClickName) quickClickName.value = draft.name || "";
    if (quickClickUrlPattern) quickClickUrlPattern.value = draft.urlPattern || "";
    if (btnQuickClickCapture) {
      btnQuickClickCapture.textContent = draft.hotkey || "点击识别按键";
      btnQuickClickCapture.classList.remove("is-capturing");
    }
    if (quickClickTargetDisplay) {
      quickClickTargetDisplay.textContent = describeQuickClickTarget(draft) || "未选取目标";
    }
  }

  function readQuickClickDraftFromForm(base) {
    return normalizeQuickClickDraft({
      ...base,
      id: quickClickId?.value || base?.id,
      name: quickClickName?.value || "",
      urlPattern: quickClickUrlPattern?.value || ""
    });
  }

  async function loadQuickClickDraft() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.QUICK_CLICK_DRAFT);
    return normalizeQuickClickDraft(data[STORAGE_KEYS.QUICK_CLICK_DRAFT]);
  }

  async function saveQuickClickDraft(draft) {
    quickClickDraft = normalizeQuickClickDraft(draft);
    await chrome.storage.local.set({ [STORAGE_KEYS.QUICK_CLICK_DRAFT]: quickClickDraft });
  }

  function renderQuickClickRules() {
    if (!quickClickList) return;
    const list = normalizeQuickClickRules(currentSettings.quickClickRules);
    if (!list.length) {
      quickClickList.innerHTML = `<div class="quick-click-item">暂无快捷点击规则</div>`;
      return;
    }
    quickClickList.innerHTML = list.map((item) => `
      <div class="quick-click-item">
        <div class="quick-click-item-main">
          <span>${escapeHtml(item.name)}</span>
          <span>${escapeHtml(item.hotkey)}</span>
        </div>
        <div class="quick-click-item-meta">${escapeHtml(describeQuickClickTarget(item))}</div>
        <div class="quick-click-item-meta">${escapeHtml(item.urlPattern || "所有网页")}</div>
        <div class="quick-click-item-actions">
          <button class="quick-click-link" type="button" data-action="edit" data-id="${escapeAttr(item.id)}">编辑</button>
          <button class="quick-click-link danger" type="button" data-action="delete" data-id="${escapeAttr(item.id)}">删除</button>
        </div>
      </div>
    `).join("");
  }

  function setQuickClickTip(message, isError = false) {
    if (!quickClickTip) return;
    quickClickTip.textContent = message || "";
    quickClickTip.style.color = isError ? "#fda4af" : "#c4b5fd";
  }
});

async function notifyActiveTab(type, payload) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type, payload });
  } catch (_error) {
    // Ignore unsupported pages like chrome://
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    throw new Error("未获取到当前标签页");
  }
  return tab;
}

async function sendMessageToActiveContent(message) {
  const tab = await getActiveTab();
  if (!isInjectableTab(tab)) {
    throw new Error("当前页面不允许插件选取，请切到普通网页再试");
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (firstError) {
    try {
      await injectContentScripts(tab.id);
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (secondError) {
      if (message?.type === "tb-start-quick-click-pick") {
        await startQuickClickPickWithInjectedPicker(tab.id, message.mode === "coordinate" ? "coordinate" : "selector");
        return { ok: true, fallback: true };
      }
      throw secondError || firstError;
    }
  }
}

async function injectContentScripts(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [
      "content.settings.js",
      "content.storage.js",
      "content.panel.js",
      "ai.minimax.js",
      "content.js"
    ]
  });
}

function isInjectableTab(tab) {
  const url = String(tab?.url || "");
  return /^(https?:|file:)/i.test(url);
}

async function startQuickClickPickWithInjectedPicker(tabId, mode) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: runQuickClickPickerLite,
    args: [mode, STORAGE_KEYS.QUICK_CLICK_PENDING_TARGET]
  });
}

function runQuickClickPickerLite(mode, storageKey) {
  const oldPicker = document.getElementById("tb-quick-click-lite-picker");
  if (oldPicker) oldPicker.remove();
  const monkeyImage = document.getElementById("tb-monkey-image-host");
  if (monkeyImage) monkeyImage.style.display = "none";

  const overlay = document.createElement("div");
  overlay.id = "tb-quick-click-lite-picker";
  overlay.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    "width:0",
    "height:0",
    "border:2px solid #22d3ee",
    "background:rgba(34,211,238,0.12)",
    "box-shadow:0 0 0 9999px rgba(2,6,23,0.12),0 0 22px rgba(34,211,238,0.45)",
    "z-index:2147483647",
    "pointer-events:none",
    "border-radius:6px"
  ].join(";");

  const hint = document.createElement("div");
  hint.textContent = mode === "coordinate"
    ? "快捷点击：点击页面坐标，Esc 取消"
    : "快捷点击：点击要绑定的元素，Esc 取消";
  hint.style.cssText = [
    "position:fixed",
    "left:16px",
    "top:16px",
    "z-index:2147483647",
    "padding:8px 10px",
    "border-radius:10px",
    "background:rgba(15,23,42,0.92)",
    "color:#fff",
    "font-size:13px",
    "box-shadow:0 8px 24px rgba(0,0,0,0.22)"
  ].join(";");

  document.documentElement.appendChild(overlay);
  document.documentElement.appendChild(hint);

  function cleanup() {
    overlay.remove();
    hint.remove();
    document.removeEventListener("pointermove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeydown, true);
  }

  function onMove(event) {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || target === overlay || target === hint) {
      overlay.style.width = "0";
      overlay.style.height = "0";
      return;
    }
    const rect = target.getBoundingClientRect();
    overlay.style.left = `${Math.max(0, rect.left)}px`;
    overlay.style.top = `${Math.max(0, rect.top)}px`;
    overlay.style.width = `${Math.max(0, rect.width)}px`;
    overlay.style.height = `${Math.max(0, rect.height)}px`;
  }

  function onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const payload = mode === "coordinate"
      ? {
        mode: "coordinate",
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
        selector: element ? buildSelector(element) : "",
        label: element ? getLabel(element) : "",
        host: location.hostname
      }
      : {
        mode: "selector",
        selector: element ? buildSelector(element) : "",
        label: element ? getLabel(element) : "",
        host: location.hostname
      };
    chrome.storage.local.set({ [storageKey]: payload });
    cleanup();
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cleanup();
    }
  }

  function buildSelector(element) {
    if (!(element instanceof Element)) return "";
    if (element.id) return `#${cssEscapeLite(element.id)}`;
    const parts = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      let part = node.tagName.toLowerCase();
      const stableAttr = ["data-testid", "data-id", "name", "aria-label", "title"].find((attr) => node.getAttribute(attr));
      if (stableAttr) {
        part += `[${stableAttr}="${String(node.getAttribute(stableAttr)).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
        parts.unshift(part);
        break;
      }
      const classes = Array.from(node.classList || [])
        .filter((name) => !/^\d/.test(name) && !/[{}[\]()]/.test(name))
        .slice(0, 3);
      if (classes.length) part += `.${classes.map(cssEscapeLite).join(".")}`;
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

  function cssEscapeLite(value) {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function getLabel(element) {
    return (element.innerText || element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || element.tagName || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
  }

  document.addEventListener("pointermove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeydown, true);
}

function createQuickClickDraft() {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    name: "",
    hotkey: "",
    mode: "selector",
    selector: "",
    x: null,
    y: null,
    urlPattern: "",
    clickType: "mouse"
  };
}

function normalizeQuickClickDraft(raw) {
  const list = normalizeQuickClickRules([raw]);
  return list[0] || createQuickClickDraft();
}

function normalizeQuickClickRules(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((item) => {
      const mode = item?.mode === "coordinate" ? "coordinate" : "selector";
      const x = Number(item?.x);
      const y = Number(item?.y);
      return {
        id: typeof item?.id === "string" && item.id ? item.id : crypto.randomUUID(),
        enabled: item?.enabled !== false,
        name: typeof item?.name === "string" && item.name.trim() ? item.name.trim() : "",
        hotkey: normalizeHotkey(item?.hotkey || ""),
        mode,
        selector: typeof item?.selector === "string" ? item.selector.trim() : "",
        x: Number.isFinite(x) ? x : null,
        y: Number.isFinite(y) ? y : null,
        urlPattern: typeof item?.urlPattern === "string" ? item.urlPattern.trim() : "",
        clickType: item?.clickType === "native" ? "native" : "mouse"
      };
    })
    .filter((item) => item.id);
}

function hotkeyFromKeyboardEvent(event) {
  const key = normalizeKey(event.key);
  if (!key || ["Control", "Alt", "Shift", "Meta"].includes(key)) return "";
  const parts = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  parts.push(key);
  return parts.join("+");
}

function normalizeHotkey(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const seen = new Set();
  const parts = text
    .split("+")
    .map((part) => normalizeKey(part.trim()))
    .filter(Boolean)
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const order = ["Ctrl", "Alt", "Shift", "Meta"];
  const modifiers = order.filter((part) => parts.includes(part));
  const key = parts.find((part) => !order.includes(part));
  return key ? [...modifiers, key].join("+") : "";
}

function normalizeKey(key) {
  const value = String(key || "").trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  const alias = {
    control: "Ctrl",
    ctrl: "Ctrl",
    option: "Alt",
    alt: "Alt",
    shift: "Shift",
    meta: "Meta",
    command: "Meta",
    cmd: "Meta",
    escape: "Esc",
    esc: "Esc",
    " ": "Space",
    spacebar: "Space",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight"
  };
  if (alias[lower]) return alias[lower];
  if (value.length === 1) return value.toUpperCase();
  return value[0].toUpperCase() + value.slice(1);
}

function describeQuickClickTarget(item) {
  if (!item) return "";
  if (item.mode === "coordinate") {
    return Number.isFinite(item.x) && Number.isFinite(item.y) ? `坐标 (${item.x}, ${item.y})` : "";
  }
  return item.selector || "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

async function collectConversationFromTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => {
      const nodes = Array.from(document.querySelectorAll("div.msg-text"));
      const messages = nodes
        .map((node) => {
          const text = (node.innerText || "").trim();
          if (!text) return null;
          const className = node.className || "";
          const isMe = /style_isMe__|isMe/i.test(className);
          return {
            role: isMe ? "me" : "user",
            text
          };
        })
        .filter(Boolean);
      const meCount = messages.filter((m) => m.role === "me").length;
      const userCount = messages.filter((m) => m.role === "user").length;
      const preview = messages
        .slice(-2)
        .map((m) => `${m.role}:${m.text}`)
        .join(" | ")
        .slice(0, 120);
      return {
        total: messages.length,
        meCount,
        userCount,
        preview,
        messages
      };
    }
  });

  return results.reduce(
    (acc, item) => {
      const val = item && item.result
        ? item.result
        : { total: 0, meCount: 0, userCount: 0, preview: "", messages: [] };
      acc.total += val.total || 0;
      acc.meCount += val.meCount || 0;
      acc.userCount += val.userCount || 0;
      if (!acc.preview && val.preview) acc.preview = val.preview;
      if (Array.isArray(val.messages) && val.messages.length > 0) {
        acc.messages.push(...val.messages);
      }
      return acc;
    },
    { total: 0, meCount: 0, userCount: 0, preview: "", messages: [] }
  );
}

function getAiConfig(raw) {
  const defaults = miniMax.getDefaultConfig();
  const replyPrompt = typeof raw.aiReplyPrompt === "string" ? raw.aiReplyPrompt.trim() : "";
  const replyPromptWithIntent = typeof raw.aiReplyPromptWithIntent === "string" ? raw.aiReplyPromptWithIntent.trim() : "";
  const config = {
    apiFormat: raw.aiApiFormat === "anthropic" ? "anthropic" : "openai",
    apiHostPreset: ["minimax-cn", "minimax-global", "deepseek", "volcengine"].includes(raw.aiApiHostPreset)
      ? raw.aiApiHostPreset
      : defaults.apiHostPreset,
    apiBaseUrl: String(raw.aiApiBaseUrl || defaults.apiBaseUrl).trim(),
    apiKey: String(raw.aiApiKey || defaults.apiKey).trim(),
    model: String(raw.aiModel || defaults.model).trim(),
    suggestCount: Number(raw.aiSuggestCount || defaults.suggestCount),
    systemPrompt: String(raw.aiSystemPrompt || defaults.systemPrompt).trim(),
    replyPrompt: !replyPrompt || replyPrompt === LEGACY_AI_REPLY_PROMPT
      ? "以下是聊天上下文：\n{{context}}\n\n请输出 {{count}} 条回复建议，要求：\n1) 每条一句，口语自然；\n2) 语气礼貌；\n3) 不要编造事实；\n4) 每条前加序号。"
      : replyPrompt,
    replyPromptWithIntent: replyPromptWithIntent || "以下是聊天上下文：\n{{context}}\n\n{{intent_block}}请输出 {{count}} 条回复建议，要求：\n1) 优先满足额外要求；\n2) 每条一句，口语自然；\n3) 语气礼貌；\n4) 不要编造事实；\n5) 每条前加序号。"
  };
  if (!config.apiKey) {
    throw new Error("请先在“基础设置”里配置 AI API Key。");
  }
  return config;
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

function compactMessages(messages, maxMessages, maxChars) {
  const list = Array.isArray(messages) ? messages : [];
  const result = [];
  for (const item of list) {
    if (!item || !item.text) continue;
    const role = item.role === "me" ? "me" : "user";
    const text = String(item.text).replace(/\s+/g, " ").trim();
    if (!text) continue;
    // skip exact consecutive duplicates
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

function renderDebug(target, payload) {
  if (!target) return;
  target.textContent = `[${new Date().toLocaleTimeString()}]\n${JSON.stringify(payload, null, 2)}`;
}

async function requestWithFallback(aiConfig, userPrompt, debugTarget) {
  const candidates = miniMax.buildRequestCandidates(aiConfig, userPrompt);
  let lastError = null;
  const tried = [];

  for (const candidate of candidates) {
    tried.push(candidate.endpoint);
    try {
      const response = await fetch(candidate.endpoint, candidate.requestInit);
      if (!response.ok) {
        const text = await response.text();
        const message = `(${response.status}) ${text.slice(0, 300)}`;
        // 4xx with invalid key or auth errors should stop immediately
        if (response.status === 401 || response.status === 403) {
          throw new Error(`鉴权失败 ${message}`);
        }
        throw new Error(message);
      }
      const json = await response.json();
      renderDebug(debugTarget, {
        stage: "fallback_ok",
        endpoint: candidate.endpoint,
        tried
      });
      return json;
    } catch (error) {
      lastError = error;
      renderDebug(debugTarget, {
        stage: "fallback_try_failed",
        endpoint: candidate.endpoint,
        message: String(error?.message || error)
      });
    }
  }

  throw new Error(`接口测试失败 ${lastError?.message || "未知错误"}；已尝试：${tried.join(" | ")}`);
}

function renderSuggestions(container, suggestions) {
  container.innerHTML = "";
  suggestions.forEach((text, index) => {
    const item = document.createElement("div");
    item.className = "suggest-item";
    const content = document.createElement("div");
    content.textContent = `${index + 1}. ${text}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = "复制";
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(text);
      btn.textContent = "已复制";
      setTimeout(() => {
        btn.textContent = "复制";
      }, 1000);
    });
    item.appendChild(content);
    item.appendChild(btn);
    container.appendChild(item);
  });
}
