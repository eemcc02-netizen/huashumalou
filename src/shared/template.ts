const TEMPLATE_REGEX = /\{\{([a-zA-Z0-9_]+)\}\}/g;

export function findTemplateKeys(content: string) {
  const keys = new Set<string>();
  for (const match of content.matchAll(TEMPLATE_REGEX)) {
    keys.add(match[1]);
  }
  return Array.from(keys);
}

export function renderTemplate(content: string, values: Record<string, string>) {
  return content.replace(TEMPLATE_REGEX, (_, key: string) => values[key] ?? "");
}
