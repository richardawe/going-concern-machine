import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

// Sign-in codes and session tokens are stored only as keyed hashes, so a copy of the database can't be used to sign in.

export const hmac = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const sixDigits = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Course join codes: 6 characters with no look-alikes (0/O, 1/I/L), shown as KX7-42Q. */
const JOIN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const joinCode = () => Array.from({ length: 6 }, () => JOIN[randomInt(0, JOIN.length)]).join('');
export const formatJoin = (c: string) => `${c.slice(0, 3)}-${c.slice(3)}`;
export const parseJoin = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

// TOTP (RFC 6238) for the platform console's second factor: 30-second steps, 6 digits, SHA-1, as every authenticator app expects.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function unbase32(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, ''), out: number[] = [];
  let bits = 0, value = 0;
  for (const ch of clean) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export const newTotpSecret = () => base32(randomBytes(20));
export function totpAt(secret: string, time = Date.now(), step = 0) {
  const counter = Math.floor(time / 30_000) + step, buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', unbase32(secret)).update(buf).digest(), o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}
/** Accepts the current code and one step either side, for clock drift. */
export const totpValid = (secret: string, code: string, time = Date.now()) =>
  /^\d{6}$/.test(code) && [-1, 0, 1].some(s => safeEqual(totpAt(secret, time, s), code));
export const totpUri = (secret: string, account: string, issuer = 'Going Concern') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&period=30&digits=6`;
