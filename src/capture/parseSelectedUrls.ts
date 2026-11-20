export function parseSelectedUrls(text: string, limit = 500): string[] {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer");
  const candidates = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  const urls = new Set<string>();
  for (const candidate of candidates) {
    const value = candidate.replace(/[),.;!?]+$/, "");
    try {
      const parsed = new URL(value);
      if ((parsed.protocol === "http:" || parsed.protocol === "https:") && !urls.has(parsed.href)) {
        urls.add(parsed.href);
        if (urls.size >= limit) break;
      }
    } catch {
      // Ignore malformed selections rather than failing the entire batch.
    }
  }
  return [...urls];
}
