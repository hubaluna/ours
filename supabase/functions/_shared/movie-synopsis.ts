// A readable plot paragraph, without copying an entire Wikipedia section.
export function movieSynopsis(text: string, limit = 650): string {
  const clean = text.replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const sentences = clean.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [clean];
  let paragraph = "";
  for (const sentence of sentences.slice(0, 3)) {
    const next = `${paragraph} ${sentence.trim()}`.trim();
    if (next.length > limit) break;
    paragraph = next;
  }
  if (paragraph) return paragraph;
  if (clean.length <= limit) return clean;
  const clipped = clean.slice(0, limit - 1);
  return clipped.slice(0, Math.max(clipped.lastIndexOf(" "), limit - 80)).trimEnd() + "…";
}
