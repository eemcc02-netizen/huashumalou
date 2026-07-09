import type { UserSettings } from "./types";

function getBrowserNamespace() {
  const ua = globalThis.navigator?.userAgent?.toLowerCase() ?? "";
  if (ua.includes("edg/")) {
    return "edge";
  }
  if (ua.includes("chrome/")) {
    return "chrome";
  }
  return "other";
}

export function getStorageKeys() {
  const namespace = `tb.${getBrowserNamespace()}`;
  return {
    snippets: `${namespace}.snippets`,
    settings: `${namespace}.settings`,
    pendingQuickSave: `${namespace}.pendingQuickSave`
  } as const;
}

export const LEGACY_STORAGE_KEYS = {
  snippets: "tb.snippets",
  settings: "tb.settings",
  pendingQuickSave: "tb.pendingQuickSave"
} as const;

export const DEFAULT_SETTINGS: UserSettings = {
  enableExtension: true,
  triggerPrefixes: ["/", "、"],
  triggerKey: "Tab",
  completionMode: "manual",
  matchMode: "prefix",
  enableSuggestionPanel: true,
  suggestionWidth: 360,
  suggestionOpacity: 96,
  autoSendImageConfirm: false,
  textHotSeparator: "",
  blacklistSites: [],
  siteRules: {},
  defaultSignature: "",
  disableInPasswordFields: true,
  disableInSensitiveFields: true
};

export const DEFAULT_SNIPPETS = [
  {
    title: "账单说明",
    shortcut: "、zd",
    content: "您好，关于账单问题我已经为您记录，我们会尽快核实后回复您。"
  },
  {
    title: "感谢回复",
    shortcut: "/ty",
    content: "您好，感谢您的回复，我们会继续跟进处理。"
  }
];
