import { DEFAULT_SETTINGS, DEFAULT_SNIPPETS, getStorageKeys, LEGACY_STORAGE_KEYS } from "./constants";
import type { ExportPayload, PendingQuickSave, Snippet, UserSettings } from "./types";

const STORAGE_KEYS = getStorageKeys();
const SNIPPETS_KEY = STORAGE_KEYS.snippets;
const SETTINGS_KEY = STORAGE_KEYS.settings;
const PENDING_KEY = STORAGE_KEYS.pendingQuickSave;

export function normalizeShortcut(shortcut: string) {
  return shortcut.trim().toLowerCase();
}

async function getWithLegacyFallback<T>(key: string, legacyKey: string) {
  const result = await chrome.storage.local.get([key, legacyKey]);
  if (result[key] !== undefined) {
    return result[key] as T | undefined;
  }
  if (key !== legacyKey && result[legacyKey] !== undefined) {
    const migrated = result[legacyKey] as T;
    await chrome.storage.local.set({ [key]: migrated });
    return migrated;
  }
  return undefined;
}

export function applySettingsDefaults(settings?: Partial<UserSettings>) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    triggerPrefixes: settings?.triggerPrefixes?.filter(Boolean) ?? DEFAULT_SETTINGS.triggerPrefixes,
    blacklistSites: settings?.blacklistSites?.filter(Boolean) ?? DEFAULT_SETTINGS.blacklistSites,
    siteRules: settings?.siteRules ?? DEFAULT_SETTINGS.siteRules,
    completionMode: settings?.completionMode === "auto" ? "auto" : DEFAULT_SETTINGS.completionMode,
    matchMode: ["prefix", "contains", "exact"].includes(settings?.matchMode ?? "")
      ? settings?.matchMode ?? DEFAULT_SETTINGS.matchMode
      : DEFAULT_SETTINGS.matchMode,
    suggestionWidth: clampNumber(settings?.suggestionWidth, 240, 560, DEFAULT_SETTINGS.suggestionWidth),
    suggestionOpacity: clampNumber(settings?.suggestionOpacity, 40, 100, DEFAULT_SETTINGS.suggestionOpacity),
    textHotSeparator: settings?.textHotSeparator ?? DEFAULT_SETTINGS.textHotSeparator
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numberValue)));
}

export function createSnippet(input: {
  title: string;
  shortcut: string;
  content: string;
  type?: Snippet["type"];
  imageDataUrl?: string;
  imageName?: string;
  autoSendAfterInsert?: boolean;
  category?: string;
  tags?: string[];
  isFavorite?: boolean;
}): Snippet {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: input.type ?? "text",
    title: input.title.trim(),
    shortcut: input.shortcut.trim(),
    shortcutNormalized: normalizeShortcut(input.shortcut),
    content: input.content,
    imageDataUrl: input.imageDataUrl,
    imageName: input.imageName,
    autoSendAfterInsert: input.autoSendAfterInsert ?? false,
    category: input.category?.trim() || "",
    tags: input.tags ?? [],
    isFavorite: input.isFavorite ?? false,
    createdAt: now,
    updatedAt: now,
    useCount: 0
  };
}

export async function getSnippets() {
  const snippets = (await getWithLegacyFallback<Snippet[]>(SNIPPETS_KEY, LEGACY_STORAGE_KEYS.snippets)) ?? [];
  return snippets.map((item) =>
    prepareSnippetForSave({
      ...item,
      type: item.type === "image" ? "image" : "text",
      imageDataUrl: item.imageDataUrl,
      imageName: item.imageName,
      autoSendAfterInsert: item.autoSendAfterInsert === true,
      tags: Array.isArray(item.tags) ? item.tags : [],
      isFavorite: Boolean(item.isFavorite),
      category: item.category ?? "",
      useCount: Number(item.useCount || 0),
      createdAt: item.createdAt ?? new Date().toISOString()
    })
  );
}

export async function saveSnippets(snippets: Snippet[]) {
  await chrome.storage.local.set({ [SNIPPETS_KEY]: snippets });
}

export function prepareSnippetForSave(
  input: Omit<Snippet, "shortcutNormalized" | "updatedAt"> & Partial<Pick<Snippet, "shortcutNormalized" | "updatedAt">>
): Snippet {
  return {
    ...input,
    type: input.type ?? "text",
    title: input.title.trim(),
    shortcut: input.shortcut.trim(),
    shortcutNormalized: normalizeShortcut(input.shortcut),
    updatedAt: input.updatedAt ?? new Date().toISOString()
  };
}

export async function upsertSnippet(input: Snippet) {
  const snippets = await getSnippets();
  const prepared = prepareSnippetForSave(input);
  const next = snippets.some((item) => item.id === input.id)
    ? snippets.map((item) => (item.id === input.id ? prepared : item))
    : [...snippets, prepared];

  await saveSnippets(next);
  return next;
}

export async function deleteSnippet(id: string) {
  const snippets = await getSnippets();
  const next = snippets.filter((item) => item.id !== id);
  await saveSnippets(next);
  return next;
}

export async function deleteSnippets(ids: string[]) {
  const idSet = new Set(ids);
  const snippets = await getSnippets();
  const next = snippets.filter((item) => !idSet.has(item.id));
  await saveSnippets(next);
  return next;
}

export async function trackSnippetUsage(id: string) {
  const snippets = await getSnippets();
  const now = new Date().toISOString();
  const next = snippets.map((item) =>
    item.id === id
      ? {
          ...item,
          lastUsedAt: now,
          useCount: item.useCount + 1,
          updatedAt: now
        }
      : item
  );
  await saveSnippets(next);
}

export async function getSettings() {
  const settings = await getWithLegacyFallback<UserSettings>(SETTINGS_KEY, LEGACY_STORAGE_KEYS.settings);
  return applySettingsDefaults(settings);
}

export async function saveSettings(settings: UserSettings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: applySettingsDefaults(settings) });
}

export async function ensureDefaults() {
  const [snippets, settings] = await Promise.all([getSnippets(), getSettings()]);
  await chrome.storage.local.set({
    [SNIPPETS_KEY]: snippets,
    [SETTINGS_KEY]: settings
  });
}

export async function ensureBootstrapData() {
  await ensureDefaults();
  const snippets = await getSnippets();
  if (snippets.length === 0) {
    await saveSnippets(DEFAULT_SNIPPETS.map((item) => createSnippet(item)));
  }
}

export async function setPendingQuickSave(payload: PendingQuickSave) {
  await chrome.storage.local.set({ [PENDING_KEY]: payload });
}

export async function getPendingQuickSave() {
  return getWithLegacyFallback<PendingQuickSave>(PENDING_KEY, LEGACY_STORAGE_KEYS.pendingQuickSave);
}

export async function clearPendingQuickSave() {
  await chrome.storage.local.remove(PENDING_KEY);
}

export function findShortcutConflicts(snippets: Snippet[], shortcut: string, excludeId?: string) {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) {
    return [];
  }

  return snippets.filter((item) => item.shortcutNormalized === normalized && item.id !== excludeId);
}

export async function exportAllData(): Promise<ExportPayload> {
  const [snippets, settings] = await Promise.all([getSnippets(), getSettings()]);
  return {
    version: "0.1.0",
    exportedAt: new Date().toISOString(),
    snippets: snippets.map(({ useCount: _useCount, lastUsedAt: _lastUsedAt, ...snippet }) => snippet),
    settings
  };
}

export async function importAllData(payload: ExportPayload) {
  const nextSnippets = Array.isArray(payload.snippets)
    ? payload.snippets
        .filter((item) => item && typeof item.title === "string" && typeof item.shortcut === "string")
        .map((item) =>
          prepareSnippetForSave({
            ...item,
            id: item.id || crypto.randomUUID(),
            content: item.content ?? "",
            type: item.type === "image" ? "image" : "text",
            imageDataUrl: item.imageDataUrl,
            imageName: item.imageName,
            autoSendAfterInsert: item.autoSendAfterInsert === true,
            tags: Array.isArray(item.tags) ? item.tags : [],
            isFavorite: Boolean(item.isFavorite),
            createdAt: item.createdAt ?? new Date().toISOString(),
            useCount: typeof item.useCount === "number" ? item.useCount : 0,
            category: item.category ?? "",
            lastUsedAt: item.lastUsedAt
          })
        )
    : [];

  const nextSettings = applySettingsDefaults(payload.settings);

  await chrome.storage.local.set({
    [SNIPPETS_KEY]: nextSnippets,
    [SETTINGS_KEY]: nextSettings
  });

  return {
    snippets: nextSnippets,
    settings: nextSettings
  };
}
