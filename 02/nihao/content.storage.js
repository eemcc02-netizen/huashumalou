(() => {
  const STORAGE_KEYS = {
    SNIPPETS: "tb-snippets",
    SETTINGS: "tb-settings",
    MONKEY_MEMO_ITEMS: "tb-monkey-memo-items",
    MONKEY_MEMO_POSITION: "tb-monkey-memo-position",
    CHANGE_HELPER_POSITION: "tb-change-helper-position",
    QUICK_CLICK_PENDING_TARGET: "tb-quick-click-pending-target"
  };

  async function loadInitialData(normalizeSettings, normalizeSnippets) {
    const data = await chrome.storage.local.get([STORAGE_KEYS.SNIPPETS, STORAGE_KEYS.SETTINGS]);
    const settings = normalizeSettings(data[STORAGE_KEYS.SETTINGS] || {});
    const snippets = normalizeSnippets(data[STORAGE_KEYS.SNIPPETS] || [], settings.triggerPrefixes);
    return { settings, snippets };
  }

  function watchChanges(onChange) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      onChange(changes);
    });
  }

  async function increaseSnippetUse(snippetId, normalizeSnippets, triggerPrefixes) {
    const data = await chrome.storage.local.get(STORAGE_KEYS.SNIPPETS);
    const list = normalizeSnippets(data[STORAGE_KEYS.SNIPPETS] || [], triggerPrefixes);
    const next = list.map((item) => {
      if (item.id !== snippetId) return item;
      return {
        ...item,
        useCount: (item.useCount || 0) + 1,
        lastUsedAt: new Date().toISOString()
      };
    });
    await chrome.storage.local.set({ [STORAGE_KEYS.SNIPPETS]: next });
  }

  async function increaseFeatureUsage(updater, normalizeSettings) {
    const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const settings = normalizeSettings(data[STORAGE_KEYS.SETTINGS] || {});
    const nextStats = updater(settings.featureUsageStats || {});
    const nextSettings = {
      ...settings,
      featureUsageStats: nextStats
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: nextSettings });
    return nextStats;
  }

  window.NihaoStorage = {
    STORAGE_KEYS,
    loadInitialData,
    watchChanges,
    increaseSnippetUse,
    increaseFeatureUsage
  };
})();
