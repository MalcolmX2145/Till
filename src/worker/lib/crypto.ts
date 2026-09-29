const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Length-independent, value-constant-time comparison. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function derive(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPin(
  pin: string,
): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(pin, salt);
  return { hash: toBase64(hash), salt: toBase64(salt) };
}

export async function verifyPin(
  pin: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  try {
    const computed = await derive(pin, fromBase64(salt));
    return timingSafeEqual(computed, fromBase64(hash));
  } catch {
    return false;
  }
}

/**
 * A PBKDF2 pass against a throwaway salt, used on unknown usernames so that a
 * missing user and a wrong PIN take the same wall-clock time.
 */
export async function dummyPinWork(pin: string): Promise<void> {
  await derive(pin, new Uint8Array(SALT_BYTES));
}

export function randomToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Session row id. The raw token never touches the database. */
export async function sessionIdFor(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return toHex(new Uint8Array(digest));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * The cookie carries `token.signature`. Verifying the signature lets us reject
 * forged or stale cookies without spending a D1 query, which matters on the
 * free plan's 50-queries-per-invocation budget.
 */
export async function signToken(token: string, secret: string): Promise<string> {
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(token),
  );
  return `${token}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifySignedToken(
  value: string,
  secret: string,
): Promise<string | null> {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const token = value.slice(0, dot);
  const expected = await signToken(token, secret);
  if (
    !timingSafeEqual(encoder.encode(value), encoder.encode(expected))
  ) {
    return null;
  }
  return token;
}
