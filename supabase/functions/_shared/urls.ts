export function publicUrl(input: string, base?: string): string {
  try {
    const u = new URL(input, base);
    const h = u.hostname.toLowerCase().replace(/\.$/, "");
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      (u.port && u.port !== "443") ||
      h.length > 253 ||
      !h.includes(".") ||
      h.includes(":") ||
      h.startsWith("[") ||
      /^\d+(?:\.\d+)*$/.test(h) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(
        h,
      )
    )
      return "";
    u.hostname = h;
    u.hash = "";
    return u.href.length <= 2048 ? u.href : "";
  } catch {
    return "";
  }
}

function stripTrailingPunctuation(raw: string): string {
  let cleaned = raw.replace(/[.,!?;:»"'…]+$/, "");
  while (cleaned.endsWith(")")) {
    const opens = (cleaned.match(/\(/g) || []).length;
    const closes = (cleaned.match(/\)/g) || []).length;
    if (closes > opens) cleaned = cleaned.slice(0, -1);
    else break;
  }
  return cleaned;
}

/** Normalize user-pasted link or share text (e.g. bare vt.tiktok.com/ZSpVxxHh1/) into HTTPS URL. */
export function normalizeImportUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const httpsMatch = trimmed.match(/https:\/\/[^\s<>"{}|\\^`[\]]+/i);
  if (httpsMatch) {
    const valid = publicUrl(stripTrailingPunctuation(httpsMatch[0]));
    if (valid) return valid;
  }
  if (!/\b[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    const bareMatch = trimmed.match(
      /(?:^|[\s(])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:[/?#][^\s<>"{}|\\^`[\]]*)?)/i,
    );
    if (bareMatch) {
      const cleaned = stripTrailingPunctuation(bareMatch[1]);
      const valid = publicUrl(`https://${cleaned}`);
      if (valid) return valid;
    }
  }
  return trimmed;
}
