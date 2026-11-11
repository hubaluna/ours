export function isTikTokVideoUrl(value: string): boolean {
  return /^https:\/\/(?:www\.)?tiktok\.com\/@[^/]+\/video\/\d+(?:[/?#]|$)/i.test(
    value,
  );
}
