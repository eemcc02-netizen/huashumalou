export type TriggerKey = "Tab" | "Space" | "Enter";
export type CompletionMode = "auto" | "manual";
export type MatchMode = "prefix" | "contains" | "exact";
export type SnippetType = "text" | "image";

export type SiteRules = Record<string, boolean>;

export type Snippet = {
  id: string;
  type: SnippetType;
  title: string;
  shortcut: string;
  shortcutNormalized: string;
  content: string;
  imageDataUrl?: string;
  imageName?: string;
  autoSendAfterInsert?: boolean;
  category?: string;
  tags: string[];
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  useCount: number;
};

export type ExportSnippet = Omit<Snippet, "lastUsedAt" | "useCount"> & Partial<Pick<Snippet, "lastUsedAt" | "useCount">>;

export type UserSettings = {
  enableExtension: boolean;
  triggerPrefixes: string[];
  triggerKey: TriggerKey;
  completionMode: CompletionMode;
  matchMode: MatchMode;
  enableSuggestionPanel: boolean;
  suggestionWidth: number;
  suggestionOpacity: number;
  autoSendImageConfirm: boolean;
  textHotSeparator: string;
  blacklistSites: string[];
  siteRules: SiteRules;
  defaultSignature: string;
  disableInPasswordFields: boolean;
  disableInSensitiveFields: boolean;
};

export type PendingQuickSave = {
  selectedText: string;
  createdAt: string;
};

export type ExportPayload = {
  version: string;
  exportedAt: string;
  snippets: ExportSnippet[];
  settings: UserSettings;
};

export type StorageShape = {
  "tb.snippets": Snippet[];
  "tb.settings": UserSettings;
  "tb.pendingQuickSave"?: PendingQuickSave;
};
