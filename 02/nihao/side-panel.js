import {
  Activity,
  Bell,
  ChevronDown,
  Circle,
  CircleCheck,
  ExternalLink,
  Play,
  RefreshCw,
  Settings,
  Square,
  Trash2,
  UserPlus,
  __toESM,
  getSnapshot,
  require_client,
  require_jsx_runtime,
  require_react,
  sendRequest
} from "./assets/chunk-OHGEDR7R.js";

// src/side-panel/main.tsx
var import_react = __toESM(require_react(), 1);
var import_client = __toESM(require_client(), 1);

// src/shared/format.ts
function formatDateTime(value) {
  if (!value) return "\u672A\u77E5\u65F6\u95F4";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
function getLevelMeta(level, levels) {
  const found = levels?.find((item) => item.id === level);
  if (found) return found;
  if (level === "high") return { label: "\u9AD8\u610F\u5411", color: "#f472b6" };
  if (level === "medium") return { label: "\u4E2D\u610F\u5411", color: "#a855f7" };
  return { label: "\u4F4E\u610F\u5411", color: "#60a5fa" };
}
function statusLabel(status) {
  if (status === "done") return "\u5DF2\u5904\u7406";
  if (status === "viewed") return "\u5DF2\u67E5\u770B";
  return "\u65B0\u7EBF\u7D22";
}

// src/side-panel/main.tsx
var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
function App() {
  const [snapshot, setSnapshot] = (0, import_react.useState)();
  const [error, setError] = (0, import_react.useState)("");
  const [diagnosticOpen, setDiagnosticOpen] = (0, import_react.useState)(false);
  const [busyAction, setBusyAction] = (0, import_react.useState)("");
  async function refresh() {
    try {
      setSnapshot(await getSnapshot());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  async function act(type) {
    if (busyAction) return;
    setBusyAction(type);
    try {
      const response = await sendRequest({ type });
      if (response.ok && response.snapshot) {
        setSnapshot(response.snapshot);
        setError("");
      } else if (!response.ok) {
        setError(response.error);
      }
    } finally {
      setBusyAction("");
    }
  }
  async function updateStatus(id, status) {
    const response = await sendRequest({ type: "UPDATE_LEAD_STATUS", id, status });
    if (response.ok && response.snapshot) setSnapshot(response.snapshot);
    else if (!response.ok) setError(response.error);
  }
  (0, import_react.useEffect)(() => {
    refresh();
    const listener = (message) => {
      if (message?.type === "PANEL_SNAPSHOT_UPDATED" && message.snapshot) setSnapshot(message.snapshot);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);
  const leads = (0, import_react.useMemo)(() => snapshot?.leads ?? [], [snapshot]);
  const newCount = leads.filter((lead) => lead.status === "new").length;
  const directionDiagnostics = snapshot?.state.directionDiagnostics ?? [];
  const apiDiagnostics = snapshot?.state.apiDiagnostics ?? [];
  const baselineText = snapshot?.state.baselineStartedAt ? snapshot.state.baselineMessageCount !== void 0 ? `\u57FA\u7EBF\u79CD\u5B50 ${snapshot.state.baselineMessageCount} \u6761` : "\u57FA\u7EBF\u91C7\u96C6\u4E2D" : "\u57FA\u7EBF\u672A\u542F\u52A8";
  const apiDiagnosticSummary = apiDiagnostics.length ? `${formatDateTime(apiDiagnostics[0].checkedAt)} / ${apiDiagnostics.length} \u6761\u8BB0\u5F55 / \u547D\u4E2D ${apiDiagnostics.reduce((total, item) => total + item.matchedTexts.length, 0)}` : `\u65B9\u5411\u6837\u672C ${directionDiagnostics.length} \u6761`;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", { className: "app-shell", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "hero", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "eyebrow", children: "\u987A\u98CE\u8033\u76D1\u542C" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "\u65B0\u7EBF\u7D22\u6293\u53D6" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bell, { className: "hero-icon", size: 30 })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "toolbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: snapshot?.state.running ? "\u76D1\u63A7\u4E2D" : "\u5DF2\u505C\u6B62" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: snapshot?.state.lastPollAt ? `\u4E0A\u6B21 ${formatDateTime(snapshot.state.lastPollAt)}` : "\u5C1A\u672A\u8F6E\u8BE2" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: baselineText })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "button-row", children: [
        snapshot?.state.running ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "icon-button danger", title: "\u505C\u6B62\u76D1\u63A7", disabled: Boolean(busyAction), onClick: () => act("STOP_MONITOR"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Square, { size: 16 }) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "icon-button primary", title: busyAction === "START_MONITOR" ? "\u542F\u52A8\u4E2D" : "\u542F\u52A8\u76D1\u63A7", disabled: Boolean(busyAction), onClick: () => act("START_MONITOR"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { size: 16 }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "icon-button", title: "\u7ACB\u5373\u5237\u65B0", disabled: Boolean(busyAction), onClick: () => act("POLL_NOW"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { size: 16 }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "icon-button", title: "\u63A5\u53E3\u8BCA\u65AD", disabled: Boolean(busyAction), onClick: () => act("RUN_API_DIAGNOSTIC"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Activity, { size: 16 }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "icon-button", title: "\u5BFC\u5165\u5F53\u524D\u5206\u7EC4\u8D26\u53F7", disabled: Boolean(busyAction), onClick: () => act("IMPORT_CURRENT_GROUP_ACCOUNTS"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UserPlus, { size: 16 }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "icon-button", title: "\u6253\u5F00\u8BBE\u7F6E", onClick: () => chrome.runtime.openOptionsPage(), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Settings, { size: 16 }) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "stats-grid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, { label: "\u8D26\u53F7", value: snapshot?.state.activeAccountCount ?? 0 }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, { label: "\u7EBF\u7D22", value: snapshot?.state.leadCount ?? 0 }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, { label: "\u672A\u5904\u7406", value: newCount })
    ] }),
    (error || snapshot?.state.latestError) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "error-banner", children: error || snapshot?.state.latestError }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "account-strip", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "list-header compact", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u76D1\u63A7\u8D26\u53F7" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          snapshot?.state.accounts.length ?? 0,
          " \u4E2A"
        ] })
      ] }),
      snapshot?.state.accounts.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "account-list", children: snapshot.state.accounts.map((account) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "account-chip", title: account.wxid, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: account.label || account.wxid }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: account.wxid })
      ] }, account.id || account.wxid)) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "empty small", children: "\u6682\u65E0\u53EF\u76D1\u542C\u8D26\u53F7\uFF0C\u8BF7\u5148\u5728 SCRM \u9875\u9762\u5BFC\u5165\u5F53\u524D\u5206\u7EC4\u8D26\u53F7\u3002" })
    ] }),
    apiDiagnostics.length || directionDiagnostics.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: `diagnostic-panel ${diagnosticOpen ? "open" : ""}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { className: "diagnostic-toggle", onClick: () => setDiagnosticOpen((open) => !open), "aria-expanded": diagnosticOpen, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u63A5\u53E3\u8BCA\u65AD" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: apiDiagnosticSummary })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { size: 16 })
      ] }),
      diagnosticOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "diagnostic-list", children: [
        apiDiagnostics.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: `diagnostic-item ${item.matchedTexts.length ? "hit" : ""}`, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "diagnostic-topline", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
              item.teacherLabel,
              " ",
              item.isCurrentAccount ? "\u5F53\u524D" : "\u5176\u4ED6"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: item.ok ? `HTTP ${item.status} / \u5217\u8868 ${item.rowCount} / \u8BE6\u60C5 ${item.detailOkCount || 0}/${item.detailProbeCount || 0}` : item.error || `HTTP ${item.status || "-"}` })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("code", { children: [
            item.teacherWxid,
            item.currentPageWxid ? ` / \u5F53\u524D\u9875 ${item.currentPageWxid}` : ""
          ] }),
          item.matchedTexts.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "diagnostic-hit", children: [
            "\u547D\u4E2D: ",
            item.matchedTexts.join(" / ")
          ] }) : item.sampleTexts.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: item.sampleTexts.slice(0, 3).join(" / ") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: item.ok ? "\u63A5\u53E3\u8FD4\u56DE\u6B63\u5E38\uFF0C\u4F46\u65E0\u547D\u4E2D\u5173\u952E\u8BCD" : "\u63A5\u53E3\u8BF7\u6C42\u5931\u8D25\u6216\u672A\u767B\u5F55" }),
          item.firstRowKeys.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
            "\u5B57\u6BB5: ",
            item.firstRowKeys.slice(0, 10).join(", ")
          ] }) : null
        ] }, item.teacherWxid)),
        directionDiagnostics.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "list-header compact", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u65B9\u5411\u8BCA\u65AD\u6837\u672C" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              directionDiagnostics.length,
              " \u6761"
            ] })
          ] }),
          directionDiagnostics.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: `diagnostic-item ${item.direction === "outbound" ? "hit" : ""}`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "diagnostic-topline", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: item.teacherLabel }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                item.source,
                " / ",
                item.direction
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("code", { children: [
              item.teacherWxid,
              " \u2192 ",
              item.chatWxid
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
              "from:",
              item.fromWxid || "-",
              " / to:",
              item.toWxid || "-",
              item.reason ? ` / ${item.reason}` : ""
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: item.messageText })
          ] }, `${item.at}-${item.messageId}`))
        ] }) : null
      ] }) : null
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "list-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u7EBF\u7D22\u5217\u8868" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { className: "text-button", disabled: Boolean(busyAction), onClick: () => act("CLEAR_ALL_LEADS"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { size: 14 }),
        "\u6E05\u7A7A\u7EBF\u7D22"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", { className: "lead-list", children: leads.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "empty", children: "\u5F53\u524D\u6CA1\u6709\u7EBF\u7D22\u3002" }) : leads.map((lead) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LeadCard, { lead, levels: snapshot?.config?.levels, onStatus: updateStatus }, lead.id)) })
  ] });
}
function Stat(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "stat", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: props.label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: props.value })
  ] });
}
function LeadCard(props) {
  const { lead } = props;
  const levelMeta = getLevelMeta(lead.level, props.levels);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: `lead-card ${lead.level} ${lead.status}`, style: { "--lead-level-color": levelMeta.color }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lead-topline", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "teacher", children: lead.teacherLabel }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "badge", style: { background: levelMeta.color, borderColor: levelMeta.color, color: "#fff" }, children: levelMeta.label })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: lead.studentRemark || lead.studentNickname || lead.chatWxid }),
    lead.studentNickname && lead.studentNickname !== lead.studentRemark && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "nickname", children: lead.studentNickname }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "message", children: lead.messageText }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "meta", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: formatDateTime(lead.messageTime) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: lead.matchedKeywords.join(" / ") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lead-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", { className: "text-button", href: lead.sourceUrl, target: "_blank", rel: "noreferrer", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExternalLink, { size: 14 }),
        "\u6253\u5F00\u4F1A\u8BDD"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { className: "text-button", onClick: () => props.onStatus(lead.id, lead.status === "done" ? "viewed" : "done"), children: [
        lead.status === "done" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Circle, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, { size: 14 }),
        lead.status === "done" ? "\u6807\u8BB0\u672A\u5B8C\u6210" : "\u5B8C\u6210"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "status", children: statusLabel(lead.status) })
    ] })
  ] });
}
(0, import_client.createRoot)(document.getElementById("root")).render(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(App, {}));
