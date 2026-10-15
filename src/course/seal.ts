// Sealing: a submission is posted as a GitHub issue on a public repository, so it is encrypted in the student's
// browser before it leaves. The JSON is gzipped, encrypted with a fresh AES-256-GCM key, and that key is wrapped with
// the course's RSA-OAEP public key. Only the private key (an Actions secret, and the lecturer's key file) opens it.
// Uses Web Crypto and compression streams only, so the same code runs in the browser, in tests and in the Action.

const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' } as const;
export const SEAL_PREFIX = 'GCM1';
/** Largest sealed code accepted, and largest decompressed submission, to keep the intake safe from oversized input. */
export const MAX_SEALED = 60_000, MAX_PLAIN = 1_000_000;

const b64 = (bytes: Uint8Array) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = (text: string) => { const s = atob(text.replace(/-/g, '+').replace(/_/g, '/')); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader(), parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > limit) { await reader.cancel(); throw new Error('The submission is too large.'); }
    parts.push(value);
  }
  const out = new Uint8Array(size); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export async function generateKeys(): Promise<{ publicKey: JsonWebKey; privateKey: JsonWebKey }> {
  const pair = await crypto.subtle.generateKey({ ...RSA, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
  return { publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey), privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey) };
}

const secure = () => { if (!globalThis.crypto?.subtle) throw new Error('Sealing needs a secure page: open the course over https.'); };

export async function seal(value: unknown, course: string, publicKey: JsonWebKey): Promise<string> {
  secure();
  const key = await crypto.subtle.importKey('jwk', publicKey, RSA, false, ['encrypt']);
  const plain = await pipe(new TextEncoder().encode(JSON.stringify(value)), new CompressionStream('gzip'));
  const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, plain as BufferSource));
  const wrapped = new Uint8Array(await crypto.subtle.encrypt(RSA, key, await crypto.subtle.exportKey('raw', aes)));
  return [SEAL_PREFIX, course.replace(/[^A-Za-z0-9_-]/g, ''), b64(wrapped), b64(iv), b64(body)].join('.');
}

/** The first sealed code in some text (an issue body, a pasted list), or null. */
export const findSealed = (text: string) => findAllSealed(text)[0] ?? null;
export const findAllSealed = (text: string) => [...text.matchAll(/GCM1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)].map(m => m[0]).filter(c => c.length <= MAX_SEALED);
export const sealedCourse = (code: string) => code.split('.')[1] ?? '';

export async function unseal(code: string, privateKey: JsonWebKey): Promise<unknown> {
  secure();
  if (code.length > MAX_SEALED) throw new Error('The sealed code is too long.');
  const [prefix, , wrapped, iv, body] = code.trim().split('.');
  if (prefix !== SEAL_PREFIX || !wrapped || !iv || !body) throw new Error('This is not a sealed submission code.');
  const key = await crypto.subtle.importKey('jwk', privateKey, RSA, false, ['decrypt']);
  let plain: Uint8Array;
  try {
    const raw = await crypto.subtle.decrypt(RSA, key, unb64(wrapped) as BufferSource);
    const aes = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) as BufferSource }, aes, unb64(body) as BufferSource));
  } catch { throw new Error('The code could not be opened: it is incomplete, edited, or sealed for a different key.'); }
  return JSON.parse(new TextDecoder().decode(await pipe(plain, new DecompressionStream('gzip'), MAX_PLAIN)));
}
