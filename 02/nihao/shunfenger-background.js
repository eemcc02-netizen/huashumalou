// src/shared/lead-utils.ts
var STRING_FIELDS = [
  "last_msg",
  "lastMsg",
  "last_content",
  "lastContent",
  "last_msg_content",
  "lastMsgContent",
  "lastMessageContent",
  "content",
  "msg_content",
  "msgContent",
  "message_content",
  "messageContent",
  "content_text",
  "contentText",
  "plain_text",
  "plainText",
  "display_content",
  "displayContent",
  "lastMessage",
  "last_message",
  "latest_msg",
  "latestMsg",
  "latest_content",
  "latestContent",
  "msg",
  "message",
  "text",
  "digest",
  "summary",
  "search_content"
];
var TIME_FIELDS = [
  "last_msg_time",
  "lastMsgTime",
  "last_message_time",
  "update_time",
  "utime",
  "not_reply_time",
  "unread_earliest_time",
  "latest_msg_time",
  "latestMsgTime",
  "last_time",
  "lastTime",
  "ctime"
];
var ID_FIELDS = [
  "svrid",
  "wx_svrid",
  "msg_id",
  "msgid",
  "message_id",
  "client_id",
  "id",
  "seq"
];
function toText(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[{[]/.test(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed);
        return toText(parsed) || trimmed;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean).join(" ");
  }
  if (value && typeof value === "object") {
    const record = value;
    const items = record.items;
    if (Array.isArray(items)) {
      const itemText = items.map((item) => toText(item)).filter(Boolean).join(" ");
      if (itemText) return itemText;
    }
    return pickString(record, [
      "content",
      "text",
      "msg",
      "msgContent",
      "message",
      "messageContent",
      "last_content",
      "lastContent",
      "last_msg",
      "lastMsg",
      "last_msg_content",
      "lastMsgContent",
      "title",
      "desc",
      "remark"
    ]) || findNestedMessageText(record, 0);
  }
  return "";
}
function findNestedMessageText(value, depth) {
  if (depth > 4 || value === null || value === void 0) return "";
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || /^\d+$/.test(text) || /^https?:\/\//i.test(text)) return "";
    return text.length > 220 ? text.slice(0, 220) : text;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = findNestedMessageText(item, depth + 1);
      if (text) return text;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  const record = value;
  const preferred = pickString(record, STRING_FIELDS);
  if (preferred) return preferred;
  for (const [key, child] of Object.entries(record)) {
    if (/wxid|id|time|date|avatar|url|src|phone|mobile|count|num/i.test(key)) continue;
    const text = findNestedMessageText(child, depth + 1);
    if (text) return text;
  }
  return "";
}
function pickString(record, fields) {
  for (const field of fields) {
    const value = toText(record[field]);
    if (value) return value;
  }
  return "";
}
function pickNumber(record, fields) {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}
function normalizeTime(value) {
  if (!value) return "";
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    const ms = numeric > 1e10 ? numeric : numeric * 1e3;
    return new Date(ms).toISOString();
  }
  return value;
}
function simpleHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
function normalizeConversation(raw) {
  if (!raw || typeof raw !== "object") return void 0;
  const record = raw;
  const chatWxid = pickString(record, ["chat_wxid", "chatWxid", "wxid", "user_wxid"]);
  if (!chatWxid) return void 0;
  const messageText = pickString(record, STRING_FIELDS);
  const messageTime = normalizeTime(pickString(record, TIME_FIELDS));
  const messageId = pickString(record, ID_FIELDS);
  return {
    chatWxid,
    studentRemark: pickString(record, ["remark", "name", "display_name"]),
    studentNickname: pickString(record, ["nickname", "wx_nickname", "studentName"]),
    messageText,
    messageTime,
    messageId,
    unreadCount: pickNumber(record, ["unread_count", "unreadCount", "unread_num", "unreadNum", "new_msg_count", "newMsgCount", "unread"]),
    notReplyTime: pickNumber(record, ["not_reply_time", "notReplyTime"]),
    rawKeys: Object.keys(record)
  };
}
function getDefaultLevelId(levels) {
  return levels?.[levels.length - 1]?.id || "low";
}
function matchKeywords(text, keywords, levels = DEFAULT_LEVELS) {
  const normalized = text.toLowerCase();
  const matched = keywords.filter((rule) => rule.enabled && rule.keyword.trim() && normalized.includes(rule.keyword.trim().toLowerCase()));
  const levelRank = new Map(levels.map((level, index) => [level.id, index]));
  const fallbackLevel = getDefaultLevelId(levels);
  const level = matched.reduce((best, rule) => {
    const bestRank = levelRank.has(best) ? levelRank.get(best) : Number.POSITIVE_INFINITY;
    const ruleRank = levelRank.has(rule.level) ? levelRank.get(rule.level) : Number.POSITIVE_INFINITY;
    return ruleRank < bestRank ? rule.level : best;
  }, fallbackLevel);
  return { matched, level };
}
function buildLeadHit(input) {
  const messageText = input.conversation.messageText || "\u4F1A\u8BDD\u6709\u66F4\u65B0\uFF0C\u4F46\u5217\u8868\u63A5\u53E3\u672A\u8FD4\u56DE\u6D88\u606F\u6458\u8981";
  const levels = input.levels || DEFAULT_LEVELS;
  const { matched, level } = matchKeywords(messageText, input.keywords, levels);
  if (matched.length === 0 && !input.includeWithoutKeyword) return void 0;
  const now = input.now ?? Date.now();
  const messageTime = input.conversation.messageTime || new Date(now).toISOString();
  const stableMessageKey = input.conversation.messageId || input.conversation.messageTime || simpleHash(messageText);
  const id = [
    input.account.wxid,
    input.conversation.chatWxid,
    stableMessageKey,
    simpleHash(messageText)
  ].join(":");
  return {
    id,
    teacherWxid: input.account.wxid,
    teacherLabel: input.account.label || input.account.wxid,
    chatWxid: input.conversation.chatWxid,
    studentRemark: input.conversation.studentRemark,
    studentNickname: input.conversation.studentNickname,
    messageText,
    messageTime,
    matchedKeywords: matched.length ? matched.map((rule) => rule.keyword) : ["\u672A\u8BFB"],
    level: matched.length ? level : getDefaultLevelId(levels),
    sourceUrl: `https://tool.miaokol.com/im/chat?wxid=${input.account.wxid}&chat_wxid=${input.conversation.chatWxid}`,
    status: "new",
    firstSeenAt: now,
    lastSeenAt: now
  };
}

// src/shared/defaults.ts
var DEFAULT_KEYWORDS = [
  { id: "kw-signup", keyword: "\u62A5\u540D", category: "\u62A5\u540D\u54A8\u8BE2", level: "high", enabled: true },
  { id: "kw-consult", keyword: "\u54A8\u8BE2", category: "\u62A5\u540D\u54A8\u8BE2", level: "medium", enabled: true },
  { id: "kw-price", keyword: "\u591A\u5C11\u94B1", category: "\u4EF7\u683C\u54A8\u8BE2", level: "high", enabled: true },
  { id: "kw-fee", keyword: "\u4EF7\u683C", category: "\u4EF7\u683C\u54A8\u8BE2", level: "high", enabled: true },
  { id: "kw-tuition", keyword: "\u5B66\u8D39", category: "\u4EF7\u683C\u54A8\u8BE2", level: "high", enabled: true },
  { id: "kw-discount", keyword: "\u4F18\u60E0", category: "\u4EF7\u683C\u54A8\u8BE2", level: "medium", enabled: true },
  { id: "kw-course", keyword: "\u8BFE\u7A0B", category: "\u8BFE\u7A0B\u54A8\u8BE2", level: "medium", enabled: true },
  { id: "kw-trial", keyword: "\u8BD5\u542C", category: "\u8BFE\u7A0B\u54A8\u8BE2", level: "medium", enabled: true },
  { id: "kw-buy", keyword: "\u600E\u4E48\u4E70", category: "\u8D2D\u4E70\u610F\u5411", level: "high", enabled: true },
  { id: "kw-pay", keyword: "\u4ED8\u6B3E", category: "\u8D2D\u4E70\u610F\u5411", level: "high", enabled: true },
  { id: "kw-link", keyword: "\u94FE\u63A5", category: "\u8D2D\u4E70\u610F\u5411", level: "medium", enabled: true },
  { id: "kw-seat", keyword: "\u540D\u989D", category: "\u8D2D\u4E70\u610F\u5411", level: "medium", enabled: true }
];
var DEFAULT_LEVELS = [
  { id: "high", label: "\u9AD8\u610F\u5411", color: "#f472b6" },
  { id: "medium", label: "\u4E2D\u610F\u5411", color: "#a855f7" },
  { id: "low", label: "\u4F4E\u610F\u5411", color: "#60a5fa" }
];
var DEFAULT_CONFIG = {
  running: false,
  pollIntervalSeconds: 0.5,
  pageSize: 50,
  showAllUnread: false,
  accounts: [],
  levels: DEFAULT_LEVELS,
  keywords: DEFAULT_KEYWORDS
};

// src/shared/types.ts
var STORAGE_KEYS = {
  config: "shunfenger.config",
  leads: "shunfenger.leadHits",
  state: "shunfenger.monitorState",
  runtimeAccounts: "shunfenger.runtimeAccounts",
  seenMessageIds: "shunfenger.seenMessageIds"
};

// src/shared/storage.ts
function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => resolve(result[key]));
  });
}
function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, () => resolve()));
}
function sessionGet(key) {
  return new Promise((resolve) => chrome.storage.session.get(key, (result) => resolve(result[key])));
}
function sessionSet(values) {
  return new Promise((resolve) => chrome.storage.session.set(values, () => resolve()));
}
async function loadConfig() {
  const stored = await storageGet(STORAGE_KEYS.config);
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    pollIntervalSeconds: Math.max(0.5, Number(stored?.pollIntervalSeconds ?? DEFAULT_CONFIG.pollIntervalSeconds) || DEFAULT_CONFIG.pollIntervalSeconds),
    accounts: stored?.accounts?.length ? stored.accounts : DEFAULT_CONFIG.accounts,
    levels: stored?.levels?.length ? stored.levels : DEFAULT_CONFIG.levels,
    keywords: stored?.keywords?.length ? stored.keywords : DEFAULT_CONFIG.keywords
  };
}
async function saveConfig(config) {
  await storageSet({ [STORAGE_KEYS.config]: config });
}
async function loadLeads() {
  return await storageGet(STORAGE_KEYS.leads) ?? [];
}
async function saveLeads(leads) {
  await storageSet({ [STORAGE_KEYS.leads]: leads.slice(0, 500) });
}
async function loadState() {
  const config = await loadConfig();
  const leads = await loadLeads();
  const stored = await storageGet(STORAGE_KEYS.state);
  return {
    running: config.running,
    accounts: config.accounts,
    leadCount: leads.length,
    activeAccountCount: config.accounts.filter((account) => account.enabled).length,
    ...stored
  };
}
async function saveState(state) {
  await storageSet({ [STORAGE_KEYS.state]: state });
}
async function loadRuntimeAccounts() {
  return await sessionGet(STORAGE_KEYS.runtimeAccounts) ?? [];
}
async function saveRuntimeAccounts(accounts) {
  await sessionSet({ [STORAGE_KEYS.runtimeAccounts]: accounts });
}
async function loadSeenMessageIds() {
  return await sessionGet(STORAGE_KEYS.seenMessageIds) ?? [];
}
async function saveSeenMessageIds(ids) {
  await sessionSet({ [STORAGE_KEYS.seenMessageIds]: ids.slice(-2e3) });
}
async function loadPanelSnapshot() {
  const config = await loadConfig();
  const leads = await loadLeads();
  const state = await loadState();
  const runtimeAccounts = await loadRuntimeAccounts();
  const accounts = runtimeAccounts.length ? runtimeAccounts : config.accounts;
  const activeAccountCount = accounts.filter((account) => account.enabled).length;
  const latestError = activeAccountCount > 0 && /未发现运行中的分组账号/.test(state.latestError || "") ? void 0 : state.latestError;
  return {
    config,
    leads,
    state: {
      ...state,
      running: config.running,
      accounts,
      leadCount: leads.length,
      activeAccountCount,
      latestError
    }
  };
}

// src/background/index.ts
var pollTimer;
var polling = false;
var monitorTabId;
var captureMode = "live";
var startMonitorTask;
var MAX_DIRECTION_DIAGNOSTICS = 40;
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => void 0);
  bootstrapScrmTabs().catch(() => void 0);
});
chrome.runtime.onStartup.addListener(() => {
  scheduleFromStoredConfig().catch(() => void 0);
  bootstrapScrmTabs().catch(() => void 0);
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "shunfenger.poll") {
    pollOnce().catch(() => void 0);
  }
});
var SHUNFENGER_MESSAGE_TYPES = /* @__PURE__ */ new Set([
  "GET_PANEL_SNAPSHOT",
  "SAVE_CONFIG",
  "START_MONITOR",
  "STOP_MONITOR",
  "POLL_NOW",
  "RUN_API_DIAGNOSTIC",
  "IMPORT_CURRENT_ACCOUNT",
  "IMPORT_CURRENT_GROUP_ACCOUNTS",
  "PAGE_API_CAPTURED",
  "PAGE_CHATLOG_CAPTURED",
  "PAGE_POLLER_ERROR",
  "UPDATE_LEAD_STATUS",
  "CLEAR_DONE_LEADS",
  "CLEAR_ALL_LEADS"
]);
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !SHUNFENGER_MESSAGE_TYPES.has(message.type)) return false;
  handleMessage(message).then((response) => sendResponse(response)).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
async function handleMessage(message) {
  if (message.type === "GET_PANEL_SNAPSHOT") {
    return { ok: true, snapshot: await loadPanelSnapshot() };
  }
  if (message.type === "SAVE_CONFIG") {
    await saveConfig(message.config);
    if (message.config.running) {
      await startPagePoller(monitorTabId, message.config);
    }
    await applySchedule(message.config);
    await publishSnapshot();
    return { ok: true, snapshot: await loadPanelSnapshot() };
  }
  if (message.type === "START_MONITOR") {
    const config = { ...await loadConfig(), running: true };
    await saveConfig(config);
    await saveState({
      ...await loadState(),
      running: true,
      latestError: void 0
    });
    await publishSnapshot();
    if (!startMonitorTask) {
      startMonitorTask = startMonitorInBackground().finally(() => {
        startMonitorTask = void 0;
      });
    }
    return { ok: true, snapshot: await loadPanelSnapshot() };
  }
  if (message.type === "STOP_MONITOR") {
    const config = { ...await loadConfig(), running: false };
    await saveConfig(config);
    captureMode = "live";
    await stopPagePoller();
    await applySchedule(config);
    await publishSnapshot();
    return { ok: true, snapshot: await loadPanelSnapshot() };
  }
  if (message.type === "POLL_NOW") {
    await pollPageNow();
    await publishSnapshot();
    return { ok: true, snapshot: await loadPanelSnapshot() };
  }
  if (message.type === "RUN_API_DIAGNOSTIC") {
    await runApiDiagnostic();
    return { ok: true, snapshot: await loadPanelSnapshot() };
  }
  if (message.type === "IMPORT_CURRENT_ACCOUNT") {
    await importCurrentAccount();
    await publishSnapshot();
    return { ok: true, snapshot: await loadPanelSnapshot() };
  }
  if (message.type === "IMPORT_CURRENT_GROUP_ACCOUNTS") {
    monitorTabId = await refreshRuntimeAccountsFromActiveTab();
    const config = await loadConfig();
    if (config.running) await startPagePoller(monitorTabId, config);
    await publishSnapshot();
    return { ok: true, snapshot: await loadPanelSnapshot() };
  }
  if (message.type === "PAGE_API_CAPTURED") {
    await ingestCapturedApi(message.url, message.bodyText, message.captureMode);
    return { ok: true };
  }
  if (message.type === "PAGE_CHATLOG_CAPTURED") {
    await ingestChatLogCapture(message);
    return { ok: true };
  }
  if (message.type === "PAGE_POLLER_ERROR") {
    await recordLatestError(`\u9875\u9762 API \u8F6E\u8BE2\u5931\u8D25\uFF1A${message.error}`);
    await publishSnapshot();
    return { ok: true };
  }
  if (message.type === "UPDATE_LEAD_STATUS") {
    const leads = await loadLeads();
    await saveLeads(leads.map((lead) => lead.id === message.id ? { ...lead, status: message.status } : lead));
    await publishSnapshot();
    return { ok: true, snapshot: await loadPanelSnapshot() };
  }
  if (message.type === "CLEAR_DONE_LEADS") {
    const leads = await loadLeads();
    await saveLeads(leads.filter((lead) => lead.status !== "done"));
    await publishSnapshot();
    return { ok: true, snapshot: await loadPanelSnapshot() };
  }
  if (message.type === "CLEAR_ALL_LEADS") {
    await saveLeads([]);
    await publishSnapshot();
    return { ok: true, snapshot: await loadPanelSnapshot() };
  }
  return { ok: false, error: "\u672A\u77E5\u8BF7\u6C42" };
}
async function importCurrentAccount() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    throw new Error("\u6CA1\u6709\u627E\u5230\u5F53\u524D\u6807\u7B7E\u9875");
  }
  const url = new URL(tab.url);
  if (url.hostname !== "tool.miaokol.com") {
    throw new Error("\u8BF7\u5148\u5207\u5230 SCRM \u9875\u9762\u518D\u5BFC\u5165\u8D26\u53F7");
  }
  const wxid = url.searchParams.get("wxid")?.trim();
  if (!wxid) {
    throw new Error("\u5F53\u524D\u9875\u9762 URL \u91CC\u6CA1\u6709 wxid\uFF0C\u65E0\u6CD5\u8BC6\u522B\u8001\u5E08\u8D26\u53F7");
  }
  const config = await loadConfig();
  const exists = config.accounts.some((account) => account.wxid === wxid);
  if (exists) return;
  await saveConfig({
    ...config,
    accounts: [
      ...config.accounts,
      {
        id: `teacher-${wxid}`,
        wxid,
        label: `\u8D26\u53F7 ${wxid}`,
        enabled: true
      }
    ]
  });
}
async function refreshRuntimeAccountsFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    throw new Error("\u6CA1\u6709\u627E\u5230\u5F53\u524D SCRM \u6807\u7B7E\u9875\uFF0C\u65E0\u6CD5\u542F\u52A8\u76D1\u542C");
  }
  const url = new URL(tab.url);
  if (url.hostname !== "tool.miaokol.com") {
    throw new Error("\u8BF7\u5148\u5207\u5230 SCRM \u5728\u7EBF\u804A\u5929\u9875\uFF0C\u518D\u542F\u52A8\u987A\u98CE\u8033");
  }
  await saveDiscoveredRuntimeAccounts(await readGroupAccountsFromTab(tab.id, url));
  monitorTabId = tab.id;
  return tab.id;
}
async function startMonitorInBackground() {
  try {
    monitorTabId = await refreshRuntimeAccountsFromActiveTab();
    await establishBaseline();
    const config = await loadConfig();
    if (!config.running) {
      await publishSnapshot();
      return;
    }
    await startPagePoller(monitorTabId, config);
    await applySchedule(config);
    await publishSnapshot();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await saveConfig({ ...await loadConfig(), running: false });
    captureMode = "live";
    await recordLatestError(`\u542F\u52A8\u76D1\u542C\u5931\u8D25\uFF1A${message}`);
    await publishSnapshot();
  }
}
async function bootstrapScrmTabs() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const discovered = [];
  const tabCandidates = [];
  if (activeTab?.id && activeTab?.url && new URL(activeTab.url).hostname === "tool.miaokol.com") {
    tabCandidates.push(activeTab);
  } else {
    const tabs = await chrome.tabs.query({ url: "https://tool.miaokol.com/*" });
    tabCandidates.push(...tabs);
  }
  for (const tab of tabCandidates) {
    if (!tab.id || !tab.url) continue;
    try {
      const accounts = await readGroupAccountsFromTab(tab.id, new URL(tab.url));
      discovered.push(...accounts);
      break;
    } catch {
    }
  }
  if (!discovered.length) return;
  await saveDiscoveredRuntimeAccounts(discovered);
  await publishSnapshot();
}
async function readGroupAccountsFromTab(tabId, url) {
  try {
    const first = await chrome.tabs.sendMessage(tabId, { type: "READ_GROUP_ACCOUNTS" });
    if (isUsefulGroupAccountDiscovery(first?.accounts)) return first.accounts;
  } catch {
  }
  await injectContentScript(tabId);
  try {
    const second = await chrome.tabs.sendMessage(tabId, { type: "READ_GROUP_ACCOUNTS" });
    if (isUsefulGroupAccountDiscovery(second?.accounts)) return second.accounts;
  } catch {
  }
  const wxid = url.searchParams.get("wxid")?.trim();
  if (wxid) {
    const configAccounts = (await loadConfig()).accounts.filter((account) => account.enabled && account.wxid.trim());
    if (configAccounts.length) {
      return configAccounts.map((account) => ({
        wxid: account.wxid,
        label: account.label || `\u8D26\u53F7 ${account.wxid}`,
        source: "storage"
      }));
    }
    throw new Error("\u53EA\u8BC6\u522B\u5230\u5F53\u524D\u804A\u5929\u8D26\u53F7\uFF0C\u672A\u80FD\u8BFB\u53D6\u5DE6\u4FA7\u5206\u7EC4\u8D26\u53F7\u5217\u8868\u3002\u8BF7\u5237\u65B0 SCRM \u9875\u9762\u540E\u518D\u70B9\u5F00\u59CB\u76D1\u542C\u3002");
  }
  return [];
}
function isUsefulGroupAccountDiscovery(accounts) {
  if (!Array.isArray(accounts) || accounts.length === 0) return false;
  return accounts.some((account) => account?.source && account.source !== "url") || accounts.length > 1;
}
async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["shunfenger-content.js"]
  });
}
async function startPagePoller(tabId, config) {
  if (!tabId) return;
  const accounts = await loadMonitoringAccounts(config);
  if (!accounts.length) return;
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "START_PAGE_API_POLLER",
      accounts,
      intervalSeconds: config.pollIntervalSeconds,
      pageSize: config.pageSize
    });
  } catch {
    await injectContentScript(tabId);
    await chrome.tabs.sendMessage(tabId, {
      type: "START_PAGE_API_POLLER",
      accounts,
      intervalSeconds: config.pollIntervalSeconds,
      pageSize: config.pageSize
    });
  }
}
async function stopPagePoller() {
  if (!monitorTabId) return;
  try {
    await chrome.tabs.sendMessage(monitorTabId, { type: "STOP_PAGE_API_POLLER" });
  } catch {
  }
}
async function pollPageNow(mode = "live") {
  if (!monitorTabId) return;
  const config = await loadConfig();
  const accounts = await loadMonitoringAccounts(config);
  if (!accounts.length) return;
  try {
    await chrome.tabs.sendMessage(monitorTabId, {
      type: "POLL_PAGE_API_NOW",
      accounts,
      pageSize: config.pageSize,
      captureMode: mode
    });
  } catch {
  }
}
async function establishBaseline() {
  const startedAt = Date.now();
  await saveSeenMessageIds([]);
  captureMode = "baseline";
  await saveState({
    ...await loadState(),
    baselineStartedAt: startedAt,
    baselineMessageCount: 0,
    latestError: void 0
  });
  try {
    await pollPageNow("baseline");
  } finally {
    captureMode = "live";
    const baselineMessageCount = (await loadSeenMessageIds()).length;
    await saveState({
      ...await loadState(),
      baselineStartedAt: startedAt,
      baselineMessageCount,
      latestError: void 0
    });
  }
}
async function runApiDiagnostic() {
  const config = await loadConfig();
  let tabId;
  let accounts = [];
  try {
    tabId = await refreshRuntimeAccountsFromActiveTab();
    accounts = await loadRuntimeAccounts();
  } catch {
    tabId = monitorTabId;
    accounts = await loadRuntimeAccounts();
    if (!tabId) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && tab.url && new URL(tab.url).hostname === "tool.miaokol.com") tabId = tab.id;
    }
  }
  if (!tabId) {
    throw new Error("\u8BF7\u5148\u5207\u5230 Edge \u91CC\u7684 SCRM \u5728\u7EBF\u804A\u5929\u9875\u9762\uFF0C\u518D\u8FD0\u884C\u63A5\u53E3\u8BCA\u65AD");
  }
  if (!accounts.length) {
    throw new Error("\u8FD8\u6CA1\u6709\u53D1\u73B0\u5206\u7EC4\u8D26\u53F7\uFF0C\u8BF7\u5148\u5728 SCRM \u9875\u9762\u70B9\u51FB\u5F00\u59CB\u76D1\u542C\u6216\u5BFC\u5165\u5206\u7EC4\u8D26\u53F7");
  }
  let response;
  try {
    response = await chrome.tabs.sendMessage(tabId, {
      type: "RUN_PAGE_API_DIAGNOSTIC",
      accounts,
      pageSize: config.pageSize,
      keywords: config.keywords
    });
  } catch {
    await injectContentScript(tabId);
    response = await chrome.tabs.sendMessage(tabId, {
      type: "RUN_PAGE_API_DIAGNOSTIC",
      accounts,
      pageSize: config.pageSize,
      keywords: config.keywords
    });
  }
  if (!response?.ok) {
    throw new Error(response?.error || "\u9875\u9762\u63A5\u53E3\u8BCA\u65AD\u5931\u8D25");
  }
  const leads = await loadLeads();
  const state = await loadState();
  await saveState({
    running: config.running,
    lastPollAt: Date.now(),
    baselineStartedAt: state.baselineStartedAt,
    baselineMessageCount: state.baselineMessageCount,
    directionDiagnostics: state.directionDiagnostics,
    accounts,
    latestError: void 0,
    leadCount: leads.length,
    activeAccountCount: accounts.filter((account) => account.enabled).length,
    apiDiagnostics: response.diagnostics || []
  });
  await publishSnapshot();
}
async function saveDiscoveredRuntimeAccounts(discovered) {
  const unique = dedupeDiscoveredAccounts(discovered);
  if (!unique.length) {
    throw new Error("\u6CA1\u6709\u4ECE\u5F53\u524D\u5206\u7EC4\u9875\u9762\u53D1\u73B0\u8001\u5E08\u8D26\u53F7 wxid\uFF0C\u8BF7\u786E\u8BA4\u5DE6\u4FA7\u5206\u7EC4\u8D26\u53F7\u5217\u8868\u5DF2\u52A0\u8F7D");
  }
  await saveRuntimeAccounts(unique.map((account) => ({
    id: `teacher-${account.wxid}`,
    wxid: account.wxid,
    label: account.label || `\u8D26\u53F7 ${account.wxid}`,
    enabled: true
  })));
}
function dedupeDiscoveredAccounts(accounts) {
  const byWxid = /* @__PURE__ */ new Map();
  const hasGroupSource = accounts.some((account) => account.source && account.source !== "url");
  for (const account of accounts) {
    if (hasGroupSource && account.source === "url") continue;
    const wxid = account.wxid?.trim();
    if (!/^\d{8,}$/.test(wxid)) continue;
    const previous = byWxid.get(wxid);
    if (!previous || previous.source === "url") {
      byWxid.set(wxid, {
        wxid,
        label: account.label?.trim() || previous?.label || `\u8D26\u53F7 ${wxid}`,
        source: account.source
      });
    }
  }
  return Array.from(byWxid.values());
}
async function scheduleFromStoredConfig() {
  await applySchedule(await loadConfig());
}
async function applySchedule(config) {
  clearPollTimer();
  chrome.alarms.clear("shunfenger.poll");
  if (!config.running) return;
  const intervalMs = Math.max(500, config.pollIntervalSeconds * 1e3);
  pollTimer = globalThis.setTimeout(() => {
    pollOnce().catch(() => void 0);
  }, intervalMs);
  chrome.alarms.create("shunfenger.poll", { periodInMinutes: Math.max(0.5, config.pollIntervalSeconds / 60) });
}
async function recordLatestError(error) {
  const leads = await loadLeads();
  const config = await loadConfig();
  const accounts = await loadMonitoringAccounts(config);
  const previousState = await loadState();
  await saveState({
    running: config.running,
    lastPollAt: Date.now(),
    accounts,
    baselineStartedAt: previousState.baselineStartedAt,
    baselineMessageCount: previousState.baselineMessageCount,
    directionDiagnostics: previousState.directionDiagnostics,
    latestError: error,
    leadCount: leads.length,
    activeAccountCount: accounts.filter((account) => account.enabled).length,
    apiDiagnostics: previousState.apiDiagnostics
  });
}
function clearPollTimer() {
  if (pollTimer !== void 0) {
    globalThis.clearTimeout(pollTimer);
    pollTimer = void 0;
  }
}
async function pollOnce() {
  if (polling) return;
  polling = true;
  const config = await loadConfig();
  if (!config.running) {
    polling = false;
    return;
  }
  const startedAt = Date.now();
  let latestError = "";
  let newLeads = [];
  try {
    const activeAccounts = (await loadMonitoringAccounts(config)).filter((account) => account.enabled && account.wxid.trim());
    if (!activeAccounts.length) {
      throw new Error("\u542F\u52A8\u76D1\u542C\u5931\u8D25\uFF1A\u672A\u68C0\u6D4B\u5230\u53EF\u76D1\u542C\u8D26\u53F7\uFF0C\u8BF7\u5148\u5728 SCRM \u5DE6\u4FA7\u5206\u7EC4\u9875\u8BFB\u53D6\u8001\u5E08\u8D26\u53F7");
    }
    if (monitorTabId) {
      pollPageNow("live").catch(() => void 0);
      return;
    }
    for (const account of activeAccounts) {
      try {
        const accountLeads = await pollAccount(account, config);
        newLeads = newLeads.concat(accountLeads);
      } catch (error) {
        latestError = latestError || (error instanceof Error ? error.message : String(error));
      }
    }
    await commitLeads(newLeads);
  } catch (error) {
    latestError = error instanceof Error ? error.message : String(error);
  } finally {
    const leads = await loadLeads();
    const accounts = await loadMonitoringAccounts(config);
    const previousState = await loadState();
    const state = {
      running: config.running,
      lastPollAt: startedAt,
      baselineStartedAt: previousState.baselineStartedAt,
      baselineMessageCount: previousState.baselineMessageCount,
      accounts,
      latestError: latestError || void 0,
      leadCount: leads.length,
      activeAccountCount: accounts.filter((account) => account.enabled).length,
      apiDiagnostics: previousState.apiDiagnostics,
      directionDiagnostics: previousState.directionDiagnostics
    };
    await saveState(state);
    polling = false;
    await publishSnapshot();
    await applySchedule(await loadConfig());
  }
}
async function loadMonitoringAccounts(config) {
  const resolvedConfig = config ?? await loadConfig();
  const runtimeAccounts = await loadRuntimeAccounts();
  if (runtimeAccounts.length) return runtimeAccounts;
  return resolvedConfig.accounts || [];
}
async function ingestCapturedApi(urlText, bodyText, mode = captureMode) {
  let json;
  if (urlText.startsWith("websocket:") || urlText.startsWith("socket-event:")) {
    json = parseSocketPayload(bodyText);
    if (json === void 0) return;
    await ingestSocketCapture(json);
    return;
  }
  try {
    json = JSON.parse(bodyText);
  } catch {
    if (/latestChatMembers/i.test(urlText)) {
      await recordLatestError("latestChatMembers \u8FD4\u56DE\u975E JSON\uFF0C\u53EF\u80FD\u662F\u767B\u5F55\u6001\u5931\u6548\u3001\u63A5\u53E3\u88AB\u62E6\u622A\u6216\u6269\u5C55\u672A\u91CD\u65B0\u52A0\u8F7D");
      await publishSnapshot();
    }
    return;
  }
  const url = new URL(urlText, "https://tool.miaokol.com");
  if (/latestChatMembers/i.test(url.pathname) || /latestChatMembers/i.test(url.href)) {
    await ingestLatestMembersCapture(url, json, mode);
    return;
  }
}
function parseSocketPayload(bodyText) {
  const trimmed = bodyText.trim();
  const candidates = [trimmed];
  const firstBrace = trimmed.search(/[{[]/);
  if (firstBrace > 0) candidates.push(trimmed.slice(firstBrace));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
    }
  }
  const objectMatches = trimmed.match(/[{[][^]*[}\]]/g) || [];
  for (const match of objectMatches.slice(0, 3)) {
    try {
      return JSON.parse(match);
    } catch {
    }
  }
  return void 0;
}
async function ingestSocketCapture(json) {
  const config = await loadConfig();
  const monitoringAccounts = await loadMonitoringAccounts(config);
  const accountByWxid = new Map(monitoringAccounts.map((account) => [account.wxid, account]));
  const leads = [];
  const directionDiagnostics = [];
  walkSocketValue(json, (record) => {
    const content = extractMessageContent(record);
    const rawContent = typeof content === "string" ? content : (() => {
      try {
        return JSON.stringify(content);
      } catch {
        return "";
      }
    })();
    const explicitWxid = pickRecordString(record, ["wxid", "owner_wxid", "account_wxid", "client_wxid"]);
    const fromWxid = pickRecordString(record, ["from_wxid", "fromWxid"]);
    const toWxid = pickRecordString(record, ["to_wxid", "toWxid"]);
    const teacherWxid = accountByWxid.has(explicitWxid) ? explicitWxid : accountByWxid.has(fromWxid) ? fromWxid : accountByWxid.has(toWxid) ? toWxid : "";
    if (!teacherWxid) return;
    const account = accountByWxid.get(teacherWxid);
    const chatWxid = pickRecordString(record, ["chat_wxid", "chatWxid", "user_wxid"]) || (fromWxid === teacherWxid ? toWxid : fromWxid) || toWxid || fromWxid;
    if (!chatWxid || chatWxid === teacherWxid) return;
    const direction = resolveMessageDirection({
      record,
      teacherWxid,
      teacherLabel: account.label,
      chatWxid,
      source: "socket",
      messageText: rawContent
    });
    directionDiagnostics.push(direction);
    if (direction.direction === "outbound") return;
    const conversation = normalizeConversation({
      chat_wxid: chatWxid,
      remark: pickRecordString(record, ["remark", "name", "display_name"]),
      nickname: pickRecordString(record, ["nickname", "wx_nickname", "studentName"]),
      content,
      msg_time: extractMessageTime(record),
      message_id: extractMessageId(record)
    });
    if (!conversation) return;
    const lead = buildLeadHit({ account, conversation, keywords: config.keywords, levels: config.levels, includeWithoutKeyword: config.showAllUnread });
    if (lead) leads.push(lead);
  });
  if (!leads.length) return;
  if (directionDiagnostics.length) await appendDirectionDiagnostics(directionDiagnostics);
  await commitLeads(leads);
  await publishSnapshot();
}
function walkSocketValue(value, visit, depth = 0) {
  if (depth > 8 || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => walkSocketValue(item, visit, depth + 1));
    return;
  }
  if (typeof value !== "object") return;
  const record = value;
  const keys = Object.keys(record).join(" ");
  if (/content|text|msg|message|from_wxid|to_wxid|chat_wxid|wxid/i.test(keys)) visit(record);
  for (const child of Object.values(record)) walkSocketValue(child, visit, depth + 1);
}
async function ingestLatestMembersCapture(url, json, mode = captureMode) {
  const teacherWxid = url.searchParams.get("wxid")?.trim();
  if (!teacherWxid) return;
  const rows = extractLatestMemberRows(json);
  if (!rows.length) return;
  const config = await loadConfig();
  const runtimeAccounts = await loadRuntimeAccounts();
  const directionDiagnostics = [];
  const runtimeAccount = runtimeAccounts.find((item) => item.wxid === teacherWxid);
  if (runtimeAccounts.length && !runtimeAccount) return;
  const account = runtimeAccount ?? config.accounts.find((item) => item.wxid === teacherWxid);
  if (!account) return;
  const leads = [];
  for (const row of rows) {
    const conversation = normalizeConversation(row);
    if (!conversation) continue;
    if (!isUnreadConversation(conversation)) continue;
    const direction = resolveMessageDirection({
      record: row,
      teacherWxid,
      teacherLabel: account.label,
      chatWxid: conversation.chatWxid,
      source: "latestChatMembers",
      messageText: conversation.messageText
    });
    directionDiagnostics.push(direction);
    if (direction.direction === "outbound") continue;
    const enriched = await resolveUnreadConversationContent(account, conversation);
    if (!enriched?.messageText.trim()) continue;
    const lead = buildLeadHit({ account, conversation: enriched, keywords: config.keywords, levels: config.levels, includeWithoutKeyword: config.showAllUnread });
    if (lead) leads.push(lead);
  }
  if (directionDiagnostics.length) await appendDirectionDiagnostics(directionDiagnostics);
  await commitLeads(leads, mode);
  if (leads.length) await publishSnapshot();
}
async function ingestChatLogCapture(message) {
  let json;
  try {
    json = JSON.parse(message.bodyText);
  } catch {
    return;
  }
  const rows = extractLatestMemberRows(json);
  if (!rows.length) return;
  const config = await loadConfig();
  const account = {
    id: `teacher-${message.teacherWxid}`,
    wxid: message.teacherWxid,
    label: message.teacherLabel || message.teacherWxid,
    enabled: true
  };
  const diagnostics = [];
  const leads = orderMessageRowsByNewest(rows).map((row) => {
    const messageText = extractMessageContent(row);
    const rawMessageText = typeof messageText === "string" ? messageText : "";
    const direction = resolveMessageDirection({
      record: row,
      teacherWxid: message.teacherWxid,
      teacherLabel: account.label,
      chatWxid: message.chatWxid,
      source: "chatLog",
      messageText: rawMessageText
    });
    diagnostics.push(direction);
    if (direction.direction === "outbound") return void 0;
    const conversation = normalizeConversation({
      chat_wxid: message.chatWxid,
      remark: message.studentRemark,
      nickname: message.studentNickname,
      content: rawMessageText,
      msg_time: extractMessageTime(row),
      message_id: extractMessageId(row)
    });
    if (!conversation) return void 0;
    return buildLeadHit({ account, conversation, keywords: config.keywords, levels: config.levels });
  }).filter((lead) => Boolean(lead));
  if (diagnostics.length) await appendDirectionDiagnostics(diagnostics);
  if (!leads.length) return;
  await commitLeads(leads, message.captureMode || captureMode);
  await publishSnapshot();
}
async function commitLeads(newLeads, mode = captureMode) {
  if (!newLeads.length) return;
  const seenIds = new Set(await loadSeenMessageIds());
  const existing = await loadLeads();
  for (const lead of existing) {
    for (const key of getLeadDedupeKeys(lead)) seenIds.add(key);
  }
  const freshLeads = [];
  for (const lead of newLeads) {
    const keys = getLeadDedupeKeys(lead);
    if (!keys.some((key) => seenIds.has(key))) {
      freshLeads.push(lead);
    }
    for (const key of keys) seenIds.add(key);
  }
  await saveSeenMessageIds(Array.from(seenIds));
  if (mode === "baseline" || !freshLeads.length) return;
  await mergeLeads(freshLeads);
}
async function mergeLeads(freshLeads) {
  if (!freshLeads.length) return;
  const existing = await loadLeads();
  const byKey = new Map(existing.map((lead) => [lead.id, lead]));
  for (const lead of freshLeads) {
    const old = byKey.get(lead.id);
    byKey.set(lead.id, old ? { ...old, lastSeenAt: lead.lastSeenAt } : lead);
  }
  await saveLeads(Array.from(byKey.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt));
}
function getLeadDedupeKeys(lead) {
  const textHash = simpleHash(normalizeDedupeText(lead.messageText));
  const base = `${lead.teacherWxid}:${lead.chatWxid}:${textHash}`;
  const timeBucket = getSecondBucket(lead.messageTime);
  return [
    `id:${lead.id}`,
    `fp:${base}:${timeBucket || "no-time"}`
  ];
}
function normalizeDedupeText(text) {
  return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
}
function getSecondBucket(value) {
  if (!value) return "";
  const numeric = Number(value);
  let ms = 0;
  if (Number.isFinite(numeric) && numeric > 0) {
    ms = numeric > 1e10 ? numeric : numeric * 1e3;
  } else {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) ms = parsed;
  }
  return ms > 0 ? String(Math.floor(ms / 1e3)) : "";
}
function pickRecordString(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") return String(value).trim();
  }
  return "";
}
function resolveMessageDirection(params) {
  return analyzeMessageDirection(params);
}
function analyzeMessageDirection(params) {
  const { record, teacherWxid, teacherLabel, chatWxid, source, messageText } = params;
  const fromWxid = pickRecordString(record, ["from_wxid", "fromWxid", "sender_wxid", "senderWxid"]);
  const toWxid = pickRecordString(record, ["to_wxid", "toWxid", "receiver_wxid", "receiverWxid"]);
  const sourceWxid = pickRecordString(record, ["wxid", "owner_wxid", "account_wxid", "client_wxid"]);
  const senderType = pickRecordString(record, ["sender_type", "senderType", "from_type", "fromType", "role", "send_role"]).toLowerCase();
  const normalizedMessageText = messageText ? String(messageText).trim() : "";
  const rawKeys = Object.keys(record).slice(0, 60);
  const reasonParts = [];
  const messageId = extractMessageId(record) || simpleHash([teacherWxid, chatWxid, extractMessageTime(record), normalizedMessageText].join("|"));
  if (fromWxid && (fromWxid === teacherWxid || sourceWxid && fromWxid === sourceWxid)) {
    reasonParts.push(`from_wxid:${fromWxid}`);
    return {
      at: Date.now(),
      source,
      teacherWxid,
      teacherLabel,
      chatWxid,
      fromWxid,
      toWxid,
      messageId,
      direction: "outbound",
      reason: reasonParts.join(" | "),
      messageText: normalizedMessageText,
      rawKeys
    };
  }
  if (/^(self|me|staff|teacher|kefu|service|employee|admin|operator)$/.test(senderType)) {
    reasonParts.push(`sender_type:${senderType}`);
    return {
      at: Date.now(),
      source,
      teacherWxid,
      teacherLabel,
      chatWxid,
      fromWxid,
      toWxid,
      messageId,
      direction: "outbound",
      reason: reasonParts.join(" | "),
      messageText: normalizedMessageText,
      rawKeys
    };
  }
  if (pickRecordBoolean(record, [
    "is_self",
    "isSelf",
    "self",
    "from_me",
    "fromMe",
    "is_send",
    "isSend",
    "send_by_self",
    "sendBySelf",
    "is_sender",
    "isSender"
  ])) {
    reasonParts.push("self_flag");
    return {
      at: Date.now(),
      source,
      teacherWxid,
      teacherLabel,
      chatWxid,
      fromWxid,
      toWxid,
      messageId,
      direction: "outbound",
      reason: reasonParts.join(" | "),
      messageText: normalizedMessageText,
      rawKeys
    };
  }
  return {
    at: Date.now(),
    source,
    teacherWxid,
    teacherLabel,
    chatWxid,
    fromWxid,
    toWxid,
    messageId,
    direction: fromWxid && toWxid ? fromWxid === teacherWxid ? "outbound" : "inbound" : "unknown",
    reason: reasonParts.length > 0 ? reasonParts.join(" | ") : "no clear direction field",
    messageText: normalizedMessageText,
    rawKeys
  };
}
async function appendDirectionDiagnostics(samples) {
  if (!samples.length) return;
  const state = await loadState();
  const merged = [...samples, ...state.directionDiagnostics || []].reduce((acc, item) => {
    if (acc.some((existing) => existing.messageId === item.messageId)) return acc;
    acc.push(item);
    return acc;
  }, []);
  const normalized = merged.sort((a, b) => b.at - a.at).slice(0, MAX_DIRECTION_DIAGNOSTICS).map((item) => ({
    ...item,
    messageText: item.messageText ? item.messageText.slice(0, 140) : "",
    rawKeys: item.rawKeys.slice(0, 12)
  }));
  await saveState({
    ...state,
    directionDiagnostics: normalized
  });
}
function pickRecordBoolean(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (value === true) return true;
    if (typeof value === "number" && value === 1) return true;
    if (typeof value === "string" && /^(1|true|yes|self|me)$/i.test(value.trim())) return true;
  }
  return false;
}
function isUnreadConversation(conversation) {
  return conversation.unreadCount > 0;
}
async function resolveUnreadConversationContent(account, conversation) {
  if (conversation.messageText.trim()) return conversation;
  const rows = await fetchConversationRowsForContent(account, conversation.chatWxid, 5);
  for (const row of orderMessageRowsByNewest(rows)) {
    if (!row || typeof row !== "object") continue;
    const direction = resolveMessageDirection({
      record: row,
      teacherWxid: account.wxid,
      teacherLabel: account.label,
      chatWxid: conversation.chatWxid,
      source: "chatLog",
      messageText: String(extractMessageContent(row) || "")
    });
    if (direction.direction === "outbound") continue;
    const enriched = normalizeConversation({
      chat_wxid: conversation.chatWxid,
      remark: conversation.studentRemark,
      nickname: conversation.studentNickname,
      content: extractMessageContent(row),
      msg_time: extractMessageTime(row),
      message_id: extractMessageId(row)
    });
    if (enriched?.messageText.trim()) {
      return {
        ...enriched,
        unreadCount: conversation.unreadCount || enriched.unreadCount,
        notReplyTime: conversation.notReplyTime || enriched.notReplyTime
      };
    }
  }
  return void 0;
}
async function fetchConversationRowsForContent(account, chatWxid, pageSize) {
  for (const request of buildContentRequestCandidates(account, chatWxid, pageSize)) {
    try {
      const response = await fetch(`https://tool.miaokol.com/api/im/${request.path}?${request.params.toString()}`, {
        credentials: "include"
      });
      if (!response.ok) continue;
      const rows = extractLatestMemberRows(await response.json());
      if (rows.length) return rows;
    } catch {
    }
  }
  return [];
}
function buildContentRequestCandidates(account, chatWxid, pageSize) {
  const chatType = /^R:/.test(chatWxid) ? "2" : "1";
  const latestWithBrackets = new URLSearchParams({
    wechat_wxid: account.wxid,
    count: String(pageSize),
    need_wechat_detail: chatType === "2" ? "1" : "0",
    filter_ai_msg: "1"
  });
  latestWithBrackets.append("chat_wxids[]", chatWxid);
  const latestPlain = new URLSearchParams({
    wechat_wxid: account.wxid,
    chat_wxids: chatWxid,
    count: String(pageSize),
    need_wechat_detail: chatType === "2" ? "1" : "0",
    filter_ai_msg: "1"
  });
  const chatLogOnline = new URLSearchParams({
    wechat_wxid: account.wxid,
    chat_wxid: chatWxid,
    msg_type: "0",
    chat_type: chatType,
    search: "",
    direction: "1",
    page_size: String(pageSize),
    page: "1"
  });
  const chatLogHistory = new URLSearchParams(chatLogOnline.toString());
  chatLogHistory.set("wxid", account.wxid);
  chatLogHistory.set("chat_module", "2");
  return [
    { path: "latestChatlog", params: latestWithBrackets },
    { path: "latestChatlog", params: latestPlain },
    { path: "chatLog", params: chatLogOnline },
    { path: "chatLog", params: chatLogHistory }
  ];
}
async function pollAccount(account, config) {
  const pageSize = Math.max(1, Math.min(100, config.pageSize || 50));
  const leads = [];
  const directionDiagnostics = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  let seen = 0;
  while (seen < total) {
    const url = `https://tool.miaokol.com/api/im/latestChatMembers?wxid=${encodeURIComponent(account.wxid)}&type=1&page=${page}&page_size=${pageSize}&history=1`;
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`${account.label || account.wxid} \u63A5\u53E3\u5931\u8D25\uFF1AHTTP ${response.status}`);
    }
    const json = await response.json();
    if (typeof json.errcode === "number" && json.errcode !== 0) {
      throw new Error(`${account.label || account.wxid} \u63A5\u53E3\u5931\u8D25\uFF1A${json.errmsg || json.errcode}`);
    }
    const rows = extractLatestMemberRows(json);
    total = Number(json.pager?.numRecords || getNestedPagerTotal(json) || rows.length || 0);
    seen += rows.length;
    for (const row of rows) {
      const normalized = normalizeConversation(row);
      if (!normalized) continue;
      if (!isUnreadConversation(normalized)) continue;
      const direction = resolveMessageDirection({
        record: row,
        teacherWxid: account.wxid,
        teacherLabel: account.label,
        chatWxid: normalized.chatWxid,
        source: "latestChatMembers",
        messageText: normalized.messageText
      });
      directionDiagnostics.push(direction);
      if (direction.direction === "outbound") continue;
      const enriched = await resolveUnreadConversationContent(account, normalized);
      if (!enriched?.messageText.trim()) continue;
      const lead = buildLeadHit({ account, conversation: enriched, keywords: config.keywords, levels: config.levels, includeWithoutKeyword: config.showAllUnread });
      if (lead) leads.push(lead);
    }
    if (!rows.length || seen >= total) break;
    page += 1;
  }
  if (directionDiagnostics.length) {
    await appendDirectionDiagnostics(directionDiagnostics);
  }
  return leads;
}
function extractLatestMemberRows(json) {
  if (!json || typeof json !== "object") return [];
  const record = json;
  const data = record.data;
  const candidates = [
    record.data,
    data?.list,
    data?.rows,
    data?.records,
    data?.data,
    data?.items,
    data?.logs,
    data?.chatlog,
    data?.chatlogs,
    data?.history,
    record.list,
    record.rows,
    record.records,
    record.items,
    record.logs,
    record.chatlog,
    record.chatlogs,
    record.history
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const value of Object.values(data)) {
      if (Array.isArray(value)) return value;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nestedArray = Object.values(value).find(Array.isArray);
        if (Array.isArray(nestedArray)) return nestedArray;
      }
    }
  }
  return [];
}
function extractMessageContent(row) {
  if (!row || typeof row !== "object") return "";
  const record = row;
  const direct = pickRecordString(record, [
    "text",
    "msg",
    "message",
    "msg_content",
    "msgContent",
    "message_content",
    "messageContent",
    "content_text",
    "contentText",
    "plain_text",
    "plainText",
    "display_content",
    "displayContent",
    "title",
    "desc"
  ]);
  if (direct) return direct;
  const content = record.content;
  if (typeof content === "string") {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }
  return content ?? "";
}
function extractMessageTime(row) {
  if (!row || typeof row !== "object") return "";
  const record = row;
  return pickRecordString(record, ["msg_time", "message_time", "create_time", "ctime", "time", "timestamp", "svr_time"]);
}
function orderMessageRowsByNewest(rows) {
  if (!rows.length) return [];
  return rows.map((row, index) => ({ row, index, time: messageTimeToMillis(extractMessageTime(row)) })).sort((a, b) => {
    if (a.time !== b.time) return b.time - a.time;
    return a.index - b.index;
  }).map((item) => item.row);
}
function messageTimeToMillis(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e10 ? value : value * 1e3;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 1e10 ? numeric : numeric * 1e3;
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
function extractMessageId(row) {
  if (!row || typeof row !== "object") return "";
  const record = row;
  return pickRecordString(record, ["svrid", "wx_svrid", "msg_id", "msgid", "message_id", "client_id", "id", "seq"]);
}
function getNestedPagerTotal(json) {
  const data = json.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return 0;
  const pager = data.pager;
  if (!pager || typeof pager !== "object") return 0;
  const total = pager.numRecords ?? pager.total;
  return Number(total) || 0;
}
async function publishSnapshot() {
  const snapshot = await loadPanelSnapshot();
  chrome.runtime.sendMessage({ type: "PANEL_SNAPSHOT_UPDATED", snapshot }).catch(() => void 0);
}
scheduleFromStoredConfig().catch(() => void 0);
bootstrapScrmTabs().catch(() => void 0);
