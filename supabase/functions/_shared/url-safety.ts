import ipaddr from "ipaddr.js";
import { publicUrl } from "./urls.ts";
export function isPublicAddress(address: string): boolean {
  try {
    const ip = ipaddr.parse(address);
    if (ip.kind() === "ipv6" && (ip as ipaddr.IPv6).isIPv4MappedAddress())
      return (ip as ipaddr.IPv6).toIPv4Address().range() === "unicast";
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export async function resolvePublicUrl(
  input: string,
  resolve: (host: string) => Promise<string[]>,
) {
  const safe = publicUrl(input);
  if (!safe) throw new Error("UNSAFE_URL");
  const url = new URL(safe);
  const addresses = await resolve(url.hostname);
  if (!addresses.length || addresses.some((ip) => !isPublicAddress(ip)))
    throw new Error("UNSAFE_ADDRESS");
  return { url, addresses };
}
