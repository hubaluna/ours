import { createVapidAuthorization, decodeBase64Url, encodeBase64Url, encryptWebPush } from "./web-push.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const value = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { value.set(part, offset); offset += part.length; }
  return value;
}
async function hmac(keyBytes: Uint8Array, input: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", keyBytes.slice().buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, input.slice().buffer as ArrayBuffer));
}
async function expand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array<ArrayBuffer>> {
  let previous = new Uint8Array();
  const output = new Uint8Array(length);
  let offset = 0;
  for (let block = 1; offset < length; block++) {
    previous = await hmac(prk, concat(previous, info, new Uint8Array([block])));
    const count = Math.min(previous.length, length - offset);
    output.set(previous.subarray(0, count), offset);
    offset += count;
  }
  return output;
}

Deno.test("Web Push aes128gcm payload can be decrypted by the browser subscription key", async () => {
  const client = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const clientPublic = new Uint8Array(await crypto.subtle.exportKey("raw", client.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  const payload = JSON.stringify({ title: "Покупки", body: "Партнер додав продукт" });
  const body = await encryptWebPush(payload, encodeBase64Url(clientPublic), encodeBase64Url(authSecret));
  const salt = body.subarray(0, 16);
  const serverPublic = body.subarray(21, 21 + body[20]);
  const ciphertext = body.subarray(21 + body[20]);
  const serverKey = await crypto.subtle.importKey("raw", serverPublic.slice().buffer as ArrayBuffer, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: serverKey }, client.privateKey, 256));
  const keyPrk = await hmac(authSecret, shared);
  const info = concat(encoder.encode("WebPush: info\0"), clientPublic, serverPublic);
  const inputKey = await expand(keyPrk, info, 32);
  const contentPrk = await hmac(salt, inputKey);
  const keyBytes = await expand(contentPrk, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await expand(contentPrk, encoder.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", keyBytes.slice().buffer as ArrayBuffer, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce.slice().buffer as ArrayBuffer }, key, ciphertext.slice().buffer as ArrayBuffer);
  const result = new Uint8Array(plain);
  if (result.at(-1) !== 2) throw new Error("Missing record delimiter");
  if (decoder.decode(result.subarray(0, -1)) !== payload) throw new Error("Push payload did not round trip");
});

Deno.test("VAPID authorization is a valid ES256 token scoped to the push endpoint", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const publicBytes = concat(new Uint8Array([4]), decodeBase64Url(publicJwk.x!), decodeBase64Url(publicJwk.y!));
  const publicKey = encodeBase64Url(publicBytes);
  const now = 1_800_000_000;
  const header = await createVapidAuthorization("https://fcm.googleapis.com/fcm/send/test", publicKey, privateJwk, "https://example.test/", now);
  const token = header.match(/^vapid t=([^,]+), k=/)?.[1];
  if (!token) throw new Error("VAPID token missing");
  const [jwtHeader, jwtClaims, jwtSignature] = token.split(".");
  const signingKey = await crypto.subtle.importKey("jwk", publicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, signingKey, decodeBase64Url(jwtSignature).buffer as ArrayBuffer, encoder.encode(`${jwtHeader}.${jwtClaims}`));
  if (!valid) throw new Error("VAPID signature invalid");
  const claims = JSON.parse(decoder.decode(decodeBase64Url(jwtClaims)));
  if (claims.aud !== "https://fcm.googleapis.com" || claims.exp !== now + 43200) throw new Error("VAPID claims invalid");
});
