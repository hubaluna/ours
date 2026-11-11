const encoder = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;

export function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function concat(...values: Uint8Array[]): Bytes {
  const output = new Uint8Array(values.reduce((length, value) => length + value.length, 0));
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

async function hmac(keyBytes: Uint8Array, message: Uint8Array): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", keyBytes.slice().buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, message.slice().buffer as ArrayBuffer));
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Bytes> {
  const output = new Uint8Array(length);
  let previous = new Uint8Array();
  let offset = 0;
  for (let block = 1; offset < length; block++) {
    previous = await hmac(prk, concat(previous, info, new Uint8Array([block])));
    const take = Math.min(previous.length, length - offset);
    output.set(previous.subarray(0, take), offset);
    offset += take;
  }
  return output;
}

export async function encryptWebPush(
  payload: string,
  p256dh: string,
  authSecret: string,
): Promise<Uint8Array> {
  const clientPublicBytes = decodeBase64Url(p256dh);
  const authBytes = decodeBase64Url(authSecret);
  if (clientPublicBytes.length !== 65 || authBytes.length < 16) throw new Error("Invalid push encryption keys");

  const clientPublicKey = await crypto.subtle.importKey(
    "raw", clientPublicBytes.slice().buffer as ArrayBuffer, { name: "ECDH", namedCurve: "P-256" }, false, [],
  );
  const serverKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"],
  ) as CryptoKeyPair;
  const serverPublicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey));
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPublicKey }, serverKeys.privateKey, 256,
  ));

  const keyPrk = await hmac(authBytes, sharedSecret);
  const keyInfo = concat(encoder.encode("WebPush: info\0"), clientPublicBytes, serverPublicBytes);
  const inputKeyingMaterial = await hkdfExpand(keyPrk, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentPrk = await hmac(salt, inputKeyingMaterial);
  const contentKey = await hkdfExpand(contentPrk, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(contentPrk, encoder.encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", contentKey.slice().buffer as ArrayBuffer, "AES-GCM", false, ["encrypt"]);
  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce.slice().buffer as ArrayBuffer }, aesKey, plaintext.slice().buffer as ArrayBuffer));
  const recordSize = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, recordSize, new Uint8Array([serverPublicBytes.length]), serverPublicBytes, ciphertext);
}

export async function createVapidAuthorization(
  endpoint: string,
  publicKey: string,
  privateJwk: JsonWebKey,
  subject: string,
  now = Math.floor(Date.now() / 1000),
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = encodeBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = encodeBase64Url(encoder.encode(JSON.stringify({ aud: audience, exp: now + 12 * 60 * 60, sub: subject })));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsigned),
  ));
  return `vapid t=${unsigned}.${encodeBase64Url(signature)}, k=${publicKey}`;
}

export function allowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      host === "fcm.googleapis.com" ||
      host === "web.push.apple.com" ||
      host === "updates.push.services.mozilla.com" ||
      host === "push.services.mozilla.com" ||
      host.endsWith(".notify.windows.com")
    );
  } catch {
    return false;
  }
}
