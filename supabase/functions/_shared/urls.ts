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
