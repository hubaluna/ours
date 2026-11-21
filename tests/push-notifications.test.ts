import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowedPushEndpoint } from "../supabase/functions/push-dispatch/web-push";
import {
  decodeVapidPublicKey,
  subscriptionMatchesVapid,
} from "../src/lib/push-notifications";

describe("allowedPushEndpoint", () => {
  it("allows Apple (including regional subdomains), FCM, Mozilla, and Windows endpoints", () => {
    expect(allowedPushEndpoint("https://web.push.apple.com/Q123456")).toBe(true);
    expect(allowedPushEndpoint("https://eu01.push.apple.com/Q123456")).toBe(true);
    expect(allowedPushEndpoint("https://us02.push.apple.com/Q123456")).toBe(true);
    expect(allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(allowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(allowedPushEndpoint("https://push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(allowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=abc")).toBe(true);
  });

  it("rejects non-HTTPS, userinfo, non-443 ports, IP literals, and untrusted hosts", () => {
    expect(allowedPushEndpoint("http://web.push.apple.com/Q123")).toBe(false);
    expect(allowedPushEndpoint("https://user:pass@web.push.apple.com/Q123")).toBe(false);
    expect(allowedPushEndpoint("https://web.push.apple.com:8443/Q123")).toBe(false);
    expect(allowedPushEndpoint("https://127.0.0.1/push")).toBe(false);
    expect(allowedPushEndpoint("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(allowedPushEndpoint("https://evil.example.com/push")).toBe(false);
    expect(allowedPushEndpoint("not-a-url")).toBe(false);
  });
});

describe("VAPID key matching", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("matches identical VAPID public key bytes and rejects mismatched keys", () => {
    const keyBytes = decodeVapidPublicKey();
    expect(keyBytes.length).toBe(65);
    expect(keyBytes[0]).toBe(4); // Uncompressed P-256 point

    const matchingSub = {
      options: { applicationServerKey: keyBytes.slice().buffer },
    } as unknown as PushSubscription;
    expect(subscriptionMatchesVapid(matchingSub)).toBe(true);

    const otherBytes = keyBytes.slice();
    otherBytes[10] ^= 0xff;
    const mismatchedSub = {
      options: { applicationServerKey: otherBytes.buffer },
    } as unknown as PushSubscription;
    expect(subscriptionMatchesVapid(mismatchedSub)).toBe(false);
  });

  it("returns true when browser omits applicationServerKey on read", () => {
    const subWithoutKey = {
      options: { applicationServerKey: null },
    } as unknown as PushSubscription;
    expect(subscriptionMatchesVapid(subWithoutKey)).toBe(true);
  });
});
