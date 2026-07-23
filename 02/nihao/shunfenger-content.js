"use strict";
(() => {
  // src/content/index.ts
  var CONTENT_MARK = "__shunfenger_content_installed__";
  var apiDiscoveredAccounts = getApiAccountCache();
  var pagePollTimer;
  var pagePollRunning = false;
  var pagePollInFlight = false;
  if (!window[CONTENT_MARK]) {
    window[CONTENT_MARK] = true;
    injectPageHook();
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.source !== "shunfenger-page-hook" || data.type !== "api-response") return;
      if (!data.url || !data.bodyText) return;
      for (const account of discoverAccountsFromApi(data.url, data.bodyText)) {
        apiDiscoveredAccounts.set(account.wxid, account);
      }
      chrome.runtime.sendMessage({ type: "PAGE_API_CAPTURED", url: data.url, bodyText: data.bodyText }).catch(() => void 0);
    });
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "READ_SCRM_CONTEXT") {
        const url = new URL(window.location.href);
        sendResponse({
          ok: true,
          context: {
            isScrm: window.location.hostname === "tool.miaokol.com",
            url: window.location.href,
            wxid: url.searchParams.get("wxid") ?? "",
            chatWxid: url.searchParams.get("chat_wxid") ?? "",
            title: document.title
          }
        });
        return true;
      }
      if (message?.type === "READ_GROUP_ACCOUNTS") {
        sendResponse({
          ok: true,
          accounts: discoverTeacherAccounts()
        });
        return true;
      }
      if (message?.type === "START_PAGE_API_POLLER") {
        startPageApiPoller(message.accounts || [], message.intervalSeconds || 0.5, message.pageSize || 50);
        sendResponse({ ok: true });
        return true;
      }
      if (message?.type === "STOP_PAGE_API_POLLER") {
        stopPageApiPoller();
        sendResponse({ ok: true });
        return true;
      }
      if (message?.type === "POLL_PAGE_API_NOW") {
        pollLatestMembers(message.accounts || [], message.pageSize || 50, message.captureMode || "live").then(
          () => sendResponse({ ok: true }),
          (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
        );
        return true;
      }
      if (message?.type === "RUN_PAGE_API_DIAGNOSTIC") {
        runPageApiDiagnostic(message.accounts || [], message.pageSize || 50, message.keywords || []).then(
          (diagnostics) => sendResponse({ ok: true, diagnostics }),
          (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
        );
        return true;
      }
      return false;
    });
  }
  function startPageApiPoller(accounts, intervalSeconds, pageSize) {
    stopPageApiPoller();
    const enabledAccounts = accounts.filter((account) => account.enabled !== false && account.wxid);
    if (!enabledAccounts.length) return;
    pagePollRunning = true;
    const tick = async () => {
      if (!pagePollRunning) return;
      try {
        await pollLatestMembers(enabledAccounts, pageSize, "live");
      } catch (error) {
        chrome.runtime.sendMessage({
          type: "PAGE_POLLER_ERROR",
          error: error instanceof Error ? error.message : String(error)
        }).catch(() => void 0);
      } finally {
        if (pagePollRunning) {
          pagePollTimer = globalThis.setTimeout(tick, Math.max(500, intervalSeconds * 1e3));
        }
      }
    };
    tick().catch(() => void 0);
  }
  function stopPageApiPoller() {
    pagePollRunning = false;
    if (pagePollTimer !== void 0) {
      globalThis.clearTimeout(pagePollTimer);
      pagePollTimer = void 0;
    }
  }
  async function pollLatestMembers(accounts, pageSize, captureMode = "live") {
    if (pagePollInFlight) return;
    pagePollInFlight = true;
    const safePageSize = Math.max(1, Math.min(100, Math.round(Number(pageSize) || 50)));
    try {
      for (const account of accounts) {
        if (!account.wxid || account.enabled === false) continue;
        try {
          const url = `/api/im/latestChatMembers?wxid=${encodeURIComponent(account.wxid)}&type=1&page=1&page_size=${safePageSize}&history=1`;
          const response = await fetch(url, { credentials: "include" });
          const bodyText = await response.text();
          if (!response.ok) {
            chrome.runtime.sendMessage({
              type: "PAGE_POLLER_ERROR",
              error: `${account.label || account.wxid} \u63A5\u53E3 HTTP ${response.status}`
            }).catch(() => void 0);
            continue;
          }
          chrome.runtime.sendMessage({
            type: "PAGE_API_CAPTURED",
            url: new URL(url, window.location.origin).href,
            bodyText,
            captureMode
          }).catch(() => void 0);
        } catch (error) {
          chrome.runtime.sendMessage({
            type: "PAGE_POLLER_ERROR",
            error: `${account.label || account.wxid} \u63A5\u53E3\u5F02\u5E38 ${error instanceof Error ? error.message : String(error)}`
          }).catch(() => void 0);
        }
      }
    } finally {
      pagePollInFlight = false;
    }
  }
  function buildChatLogParamCandidates(account, record, chatWxid, pageSize) {
    const wxidCandidates = [
      account.wxid,
      pickTextForPage(record, ["owner_wxid", "parent_wxid", "account_wxid"]),
      pickTextForPage(record, ["contact_id", "customer_id", "id"]),
      chatWxid
    ].filter(Boolean);
    const uniqueWxids = Array.from(new Set(wxidCandidates));
    return uniqueWxids.map((wxid) => new URLSearchParams({
      wxid,
      chat_wxid: chatWxid,
      msg_type: "0",
      chat_type: /^R:/.test(chatWxid) ? "2" : "1",
      search: "",
      direction: "1",
      page_size: String(pageSize),
      page: "1",
      chat_module: "2"
    }));
  }
  async function runPageApiDiagnostic(accounts, pageSize, keywords) {
    const enabledAccounts = accounts.filter((account) => account.enabled !== false && account.wxid);
    const safePageSize = Math.max(1, Math.min(100, Math.round(Number(pageSize) || 50)));
    const currentPageWxid = new URL(window.location.href).searchParams.get("wxid") || "";
    const activeKeywords = keywords.filter((rule) => rule.enabled !== false && rule.keyword?.trim()).map((rule) => rule.keyword.trim().toLowerCase());
    const diagnostics = [];
    for (const account of enabledAccounts) {
      const checkedAt = Date.now();
      const diagnostic = {
        teacherWxid: account.wxid,
        teacherLabel: account.label || account.wxid,
        checkedAt,
        currentPageWxid,
        isCurrentAccount: Boolean(currentPageWxid && account.wxid === currentPageWxid),
        ok: false,
        rowCount: 0,
        detailProbeCount: 0,
        detailOkCount: 0,
        sampleTexts: [],
        matchedTexts: [],
        firstRowKeys: []
      };
      try {
        const url = `/api/im/latestChatMembers?wxid=${encodeURIComponent(account.wxid)}&type=1&page=1&page_size=${safePageSize}&history=1`;
        const response = await fetch(url, { credentials: "include" });
        diagnostic.status = response.status;
        const bodyText = await response.text();
        if (!response.ok) {
          diagnostic.error = `HTTP ${response.status}`;
          diagnostics.push(diagnostic);
          continue;
        }
        let json;
        try {
          json = JSON.parse(bodyText);
        } catch {
          diagnostic.error = "Response is not JSON";
          diagnostics.push(diagnostic);
          continue;
        }
        const rows = extractLatestMemberRowsForPage(json);
        diagnostic.ok = true;
        diagnostic.rowCount = rows.length;
        diagnostic.firstRowKeys = rows[0] && typeof rows[0] === "object" ? Object.keys(rows[0]).slice(0, 30) : [];
        const texts = rows.map((row) => extractConversationTextForPage(row)).filter(Boolean).slice(0, 8);
        const detailTexts = await probeChatLogTexts(account, rows.slice(0, 6));
        diagnostic.detailProbeCount = detailTexts.probed;
        diagnostic.detailOkCount = detailTexts.okCount;
        diagnostic.detailError = detailTexts.error;
        diagnostic.sampleTexts = texts;
        diagnostic.sampleTexts = [...texts, ...detailTexts.texts].filter(Boolean).slice(0, 10);
        diagnostic.matchedTexts = diagnostic.sampleTexts.filter((text) => {
          const lower = text.toLowerCase();
          return activeKeywords.some((keyword) => lower.includes(keyword));
        });
      } catch (error) {
        diagnostic.error = error instanceof Error ? error.message : String(error);
      }
      diagnostics.push(diagnostic);
    }
    return diagnostics;
  }
  async function probeChatLogTexts(account, rows) {
    const texts = [];
    let probed = 0;
    let okCount = 0;
    let lastError = "";
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const record = row;
      const chatWxid = pickTextForPage(record, ["wxid", "chat_wxid", "chatWxid", "user_wxid"]);
      if (!chatWxid) continue;
      for (const params of buildChatLogParamCandidates(account, record, chatWxid, 3)) {
        probed += 1;
        try {
          const response = await fetch(`/api/im/chatLog?${params.toString()}`, { credentials: "include" });
          if (!response.ok) {
            lastError = `HTTP ${response.status}`;
            continue;
          }
          const json = await response.json();
          const chatRows = extractLatestMemberRowsForPage(json);
          if (!chatRows.length) {
            lastError = "empty chatLog";
            continue;
          }
          okCount += 1;
          for (const chatRow of chatRows) {
            const text = extractChatLogTextForPage(chatRow);
            if (text) texts.push(`${pickTextForPage(record, ["remark", "nickname", "wx_nickname", "name"]) || chatWxid}: ${text}`);
          }
          break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
    }
    return { probed, okCount, texts, error: okCount ? void 0 : lastError || void 0 };
  }
  function extractLatestMemberRowsForPage(json) {
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
    return [];
  }
  function extractConversationTextForPage(row) {
    if (!row || typeof row !== "object") return "";
    const record = row;
    return pickTextForPage(record, [
      "last_msg",
      "last_content",
      "content",
      "lastMessage",
      "last_message",
      "msg",
      "message",
      "search_content"
    ]);
  }
  function extractChatLogTextForPage(row) {
    if (!row || typeof row !== "object") return "";
    const record = row;
    return pickTextForPage(record, [
      "content",
      "text",
      "msg",
      "message",
      "msg_content",
      "message_content",
      "title",
      "desc"
    ]);
  }
  function pickTextForPage(record, fields) {
    for (const field of fields) {
      const text = valueToTextForPage(record[field]);
      if (text) return text;
    }
    return "";
  }
  function valueToTextForPage(value) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (/^[{[]/.test(trimmed)) {
        try {
          const parsed = JSON.parse(trimmed);
          return valueToTextForPage(parsed) || trimmed;
        } catch {
          return trimmed;
        }
      }
      return trimmed;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (Array.isArray(value)) {
      return value.map((item) => valueToTextForPage(item)).filter(Boolean).join(" ");
    }
    if (value && typeof value === "object") {
      const record = value;
      if (Array.isArray(record.items)) {
        const text = record.items.map((item) => valueToTextForPage(item)).filter(Boolean).join(" ");
        if (text) return text;
      }
      return pickTextForPage(record, ["content", "text", "msg", "message", "last_content", "last_msg", "title", "desc"]);
    }
    return "";
  }
  function discoverTeacherAccounts() {
    const makeAdd = (accounts) => (wxid, label, source) => {
      const cleanWxid = wxid.trim();
      if (!/^\d{8,}$/.test(cleanWxid)) return;
      if (accounts.has(cleanWxid)) {
        const previous = accounts.get(cleanWxid);
        if (shouldReplaceAccount(previous, source, label, cleanWxid)) {
          accounts.set(cleanWxid, {
            wxid: cleanWxid,
            label: label?.trim() || previous.label,
            source
          });
        }
        return;
      }
      accounts.set(cleanWxid, {
        wxid: cleanWxid,
        label: label?.trim() || `\u8D26\u53F7 ${cleanWxid}`,
        source
      });
    };
    const domAccounts = /* @__PURE__ */ new Map();
    scanDomAccounts(makeAdd(domAccounts));
    const finalAccounts = new Map(domAccounts);
    const cacheAccounts = getApiAccountCache();
    if (cacheAccounts.size > 0) {
      for (const [, account] of cacheAccounts) {
        makeAdd(finalAccounts)(account.wxid, account.label, account.source);
      }
    }
    if (finalAccounts.size < 5) {
      scanStorageAccounts(makeAdd(finalAccounts));
    }
    return Array.from(finalAccounts.values());
  }
  function getApiAccountCache() {
    if (!window.__shunfengerApiDiscoveredAccounts) {
      window.__shunfengerApiDiscoveredAccounts = /* @__PURE__ */ new Map();
    }
    return window.__shunfengerApiDiscoveredAccounts;
  }
  function shouldReplaceAccount(previous, source, label, wxid) {
    if (!label.trim()) return false;
    if (!previous.label || previous.label === `\u8D26\u53F7 ${wxid}` || previous.label.includes("\u79C1\u57DF\u7BA1\u7406\u4E2D\u5FC3")) return true;
    const priority = { url: 0, storage: 1, api: 2, dom: 3 };
    return priority[source] > priority[previous.source];
  }
  function injectPageHook() {
    if (document.documentElement.dataset.shunfengerHookInjected === "1") return;
    document.documentElement.dataset.shunfengerHookInjected = "1";
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("page-hook.js");
    script.async = false;
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }
  function discoverAccountsFromApi(url, bodyText) {
    if (/latestChatMembers/i.test(url)) return [];
    if (!/teacher|staff|account|kefu|service|user|wxid|客服|老师|班主任/i.test(`${url} ${bodyText.slice(0, 1e3)}`)) return [];
    try {
      const json = JSON.parse(bodyText);
      const accounts = [];
      walkApiValue(json, accounts, 0);
      return accounts;
    } catch {
      return [];
    }
  }
  function walkApiValue(value, accounts, depth) {
    if (depth > 6 || value === null) return;
    if (Array.isArray(value)) {
      value.slice(0, 1e3).forEach((item) => walkApiValue(item, accounts, depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    const record = value;
    const keys = Object.keys(record).join(" ");
    const wxid = pickString(record, ["wxid", "teacherWxid", "teacher_wxid", "accountWxid", "account_wxid", "bindWxid", "bind_wxid"]);
    const label = pickString(record, ["label", "name", "nickname", "nickName", "realName", "remark", "teacherName", "teacher_name"]);
    const teacherLike = /teacher|staff|account|kefu|service|老师|班主任|客服/i.test(`${keys} ${label}`);
    if (wxid && teacherLike) {
      accounts.push({ wxid, label: inferLabel(label, wxid), source: "api" });
    }
    for (const child of Object.values(record)) walkApiValue(child, accounts, depth + 1);
  }
  function scanDomAccounts(add) {
    const leftPaneLimit = Math.min(Math.max(Math.floor(window.innerWidth * 0.12), 170), 220);
    const seenRows = /* @__PURE__ */ new Set();
    const attributeCandidates = Array.from(document.querySelectorAll([
      "a[href*='wxid=']",
      "a[href]",
      "[datakey]",
      "[data-key]",
      "[data-wxid]",
      "[data-id]",
      "[data-account-wxid]",
      "[data-teacher-wxid]",
      "[title]"
    ].join(", ")));
    const leftPaneCandidates = Array.from(document.querySelectorAll("body *")).filter((element) => isInsideLeftAccountPane(element, leftPaneLimit)).slice(0, 800);
    const candidates = Array.from(/* @__PURE__ */ new Set([...attributeCandidates, ...leftPaneCandidates]));
    for (const element of candidates) {
      const row = resolveLeftTeacherRow(element, leftPaneLimit);
      if (!row || seenRows.has(row)) continue;
      seenRows.add(row);
      const wxid = resolveTeacherWxidFromElement(element) || resolveTeacherWxidFromElement(row);
      if (wxid) add(wxid, inferTeacherLabel(row, wxid), "dom");
      scanReactAccountsFromElement(row, add);
    }
  }
  function isInsideLeftAccountPane(element, leftPaneLimit) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 12 || rect.height < 12) return false;
    if (rect.left < 0 || rect.left >= leftPaneLimit) return false;
    if (rect.top < 48 || rect.bottom > window.innerHeight - 8) return false;
    return true;
  }
  function resolveLeftTeacherRow(element, leftPaneLimit) {
    let current = element;
    let best;
    for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
      const rect = current.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 18) continue;
      if (rect.left < 0 || rect.left >= leftPaneLimit) continue;
      if (rect.top < 70 || rect.bottom > window.innerHeight - 16) continue;
      const text = cleanText(current.textContent);
      if (!text || text.length > 80) continue;
      best = current;
      if (/老师|客服|班主任|teacher|staff/i.test(text)) break;
    }
    return best;
  }
  function resolveTeacherWxidFromElement(element) {
    const values = [
      element.id,
      element.getAttribute("datakey"),
      element.getAttribute("data-key"),
      element.getAttribute("data-wxid"),
      element.getAttribute("data-id"),
      element.getAttribute("data-account-wxid"),
      element.getAttribute("data-teacher-wxid"),
      element.getAttribute("href")
    ].filter(Boolean);
    for (const value of values) {
      const wxid = resolveTeacherWxidFromRow(value, value);
      if (wxid) return wxid;
      const match = value.match(/(?:^|[^\d])a?(\d{8,})(?:$|[^\d])/i);
      if (match) return match[1];
    }
    return "";
  }
  function scanReactAccountsFromElement(element, add) {
    const fallbackLabel = cleanText(element.textContent);
    const recordAccount = (wxid, label) => {
      if (!/^\d{8,}$/.test(wxid)) return;
      add(wxid, inferLabel(label || fallbackLabel, wxid), "dom");
    };
    const elementRecord = element;
    for (const key of Object.keys(elementRecord)) {
      if (!/^__react(?:Props|Fiber|InternalInstance)\$/.test(key)) continue;
      const value = elementRecord[key];
      if (!value || typeof value !== "object") continue;
      scanAccountValue(value, recordAccount, 0, /* @__PURE__ */ new WeakSet());
      scanAccountValue(value.memoizedProps, recordAccount, 0, /* @__PURE__ */ new WeakSet());
      scanAccountValue(value.pendingProps, recordAccount, 0, /* @__PURE__ */ new WeakSet());
      scanAccountValue(value.memoizedState, recordAccount, 0, /* @__PURE__ */ new WeakSet());
    }
  }
  function scanAccountValue(value, add, depth, seen) {
    if (depth > 6 || value === null || value === void 0) return;
    if (typeof value === "string") {
      for (const wxid2 of extractWxids(value)) add(wxid2, "");
      return;
    }
    if (typeof value !== "object") return;
    const objectValue = value;
    if (seen.has(objectValue)) return;
    seen.add(objectValue);
    if (typeof objectValue.nodeType === "number") return;
    const wxid = pickString(objectValue, [
      "wxid",
      "wechat_wxid",
      "wechatWxid",
      "teacherWxid",
      "teacher_wxid",
      "accountWxid",
      "account_wxid",
      "bindWxid",
      "bind_wxid",
      "staffWxid",
      "staff_wxid",
      "kefuWxid",
      "kefu_wxid"
    ]);
    if (wxid) {
      const label = pickString(objectValue, [
        "label",
        "name",
        "nickname",
        "nickName",
        "realName",
        "remark",
        "teacherName",
        "teacher_name",
        "staffName",
        "staff_name"
      ]);
      add(wxid, label);
    }
    for (const [key, child] of Object.entries(objectValue)) {
      if (/^(return|child|sibling|alternate|stateNode|_owner|parent|base)$/i.test(key)) continue;
      if (typeof child === "function") continue;
      scanAccountValue(child, add, depth + 1, seen);
    }
  }
  function resolveTeacherWxidFromRow(id, dataKey) {
    const dataKeyMatch = dataKey.match(/^a?(\d{8,})$/i);
    if (dataKeyMatch) return dataKeyMatch[1];
    const idMatch = id.match(/^a(\d{8,})$/i);
    return idMatch?.[1] || "";
  }
  function scanStorageAccounts(add) {
    for (const store of [window.localStorage, window.sessionStorage]) {
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i) || "";
        const value = store.getItem(key) || "";
        if (!/teacher|staff|account|user|wxid|客服|老师|班主任/i.test(`${key} ${value.slice(0, 300)}`)) continue;
        try {
          const parsed = JSON.parse(value);
          walkStorageValue(parsed, key, add, 0);
        } catch {
          for (const wxid of extractWxids(value)) add(wxid, `\u8D26\u53F7 ${wxid}`, "storage");
        }
      }
    }
  }
  function walkStorageValue(value, path, add, depth) {
    if (depth > 5 || value === null) return;
    if (Array.isArray(value)) {
      value.slice(0, 500).forEach((item, index) => walkStorageValue(item, `${path}.${index}`, add, depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    const record = value;
    const keys = Object.keys(record).join(" ");
    const wxid = pickString(record, ["wxid", "teacherWxid", "teacher_wxid", "accountWxid", "account_wxid", "bindWxid", "bind_wxid"]);
    const label = pickString(record, ["label", "name", "nickname", "nickName", "realName", "remark", "teacherName", "teacher_name"]);
    const teacherLike = /teacher|staff|account|kefu|service|老师|班主任|客服/i.test(`${path} ${keys} ${label}`);
    if (wxid && teacherLike) add(wxid, inferLabel(label, wxid), "storage");
    for (const [key, child] of Object.entries(record)) {
      walkStorageValue(child, `${path}.${key}`, add, depth + 1);
    }
  }
  function extractWxids(text) {
    const found = /* @__PURE__ */ new Set();
    const patterns = [
      /(?:wxid|teacherWxid|teacher_wxid|accountWxid|account_wxid|bindWxid|bind_wxid|datakey)["'=:\s]+a?(\d{8,})/gi,
      /\bid=["']a(\d{8,})["']/gi,
      /\bdatakey=["']a?(\d{8,})["']/gi,
      /[?&]wxid=(\d{8,})/gi
    ];
    for (const pattern of patterns) {
      let match;
      while (match = pattern.exec(text)) found.add(match[1]);
    }
    return Array.from(found);
  }
  function pickString(record, keys) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" || typeof value === "number") return String(value).trim();
    }
    return "";
  }
  function inferLabel(text, wxid) {
    const clean = cleanText(text).replace(wxid, "").trim();
    if (!clean) return `\u8D26\u53F7 ${wxid}`;
    return clean.length > 28 ? clean.slice(0, 28) : clean;
  }
  function inferTeacherLabel(element, wxid) {
    const title = element.querySelector("[title*='\u8001\u5E08'], [class*='title']")?.getAttribute("title") || element.querySelector("[title]")?.getAttribute("title") || "";
    if (title) return inferLabel(title, wxid);
    return inferLabel(cleanText(element.textContent), wxid).replace(/^\d+/, "");
  }
  function cleanText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }
})();
