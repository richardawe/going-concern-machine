import type { FastifyReply, FastifyRequest } from 'fastify';
import { hmac, newToken } from './crypto';
import type { Deps, PlatformAdmin, Tenant, User } from './http';

// Sessions are server-side rows; the browser holds only a random token in a host-only cookie. With the __Host- prefix
// the cookie can't be set for another subdomain, so a session at one university never works at another.

const DAY = 86_400_000;
export const SESSION_TTL = { student: 30 * DAY, lecturer: 30 * DAY, admin: 12 * 3_600_000, platform: 12 * 3_600_000 };

export const cookieName = (secure: boolean, platform: boolean) => `${secure ? '__Host-' : ''}gcm${platform ? '_admin' : ''}`;
const cookieOptions = (secure: boolean, maxAgeMs: number) => ({ path: '/', httpOnly: true, secure, sameSite: 'lax' as const, maxAge: Math.floor(maxAgeMs / 1000) });

export async function startTenantSession(d: Deps, req: FastifyRequest, reply: FastifyReply, tenant: Tenant, user: { id: string; role: User['role'] }) {
  const token = newToken(), ttl = SESSION_TTL[user.role];
  await d.db.tenant(tenant.id, q => q.exec(
    'insert into sessions (tenant_id, user_id, token_hash, user_agent, ip, expires_at) values ($1, $2, $3, $4, $5, now() + $6 * interval \'1 millisecond\')',
    [tenant.id, user.id, hmac(d.config.SESSION_SECRET, token), String(req.headers['user-agent'] ?? '').slice(0, 300), req.clientIp, ttl]));
  reply.setCookie(cookieName(d.config.SECURE_COOKIES, false), token, cookieOptions(d.config.SECURE_COOKIES, ttl));
}

export async function startPlatformSession(d: Deps, req: FastifyRequest, reply: FastifyReply, adminId: string) {
  const token = newToken(), ttl = SESSION_TTL.platform;
  await d.db.platform(q => q.exec(
    'insert into platform_sessions (admin_id, token_hash, user_agent, ip, expires_at) values ($1, $2, $3, $4, now() + $5 * interval \'1 millisecond\')',
    [adminId, hmac(d.config.SESSION_SECRET, token), String(req.headers['user-agent'] ?? '').slice(0, 300), req.clientIp, ttl]));
  reply.setCookie(cookieName(d.config.SECURE_COOKIES, true), token, cookieOptions(d.config.SECURE_COOKIES, ttl));
}

/** The signed-in user, if the cookie names a live session for an active person at an open university. */
export async function readTenantSession(d: Deps, req: FastifyRequest, tenant: Tenant): Promise<User | null> {
  const token = req.cookies[cookieName(d.config.SECURE_COOKIES, false)];
  if (!token) return null;
  return d.db.tenant(tenant.id, async q => {
    const row = await q.maybe<User & { last_seen_at: string }>(
      `select u.id, u.tenant_id, u.email, u.name, u.student_id, u.role, u.status, s.id as session_id, s.last_seen_at
         from sessions s join users u on u.id = s.user_id
        where s.token_hash = $1 and s.expires_at > now() and u.status = 'active'`, [hmac(d.config.SESSION_SECRET, token)]);
    if (!row) return null;
    if (Date.now() - Date.parse(row.last_seen_at) > 5 * 60_000) {
      await q.exec('update sessions set last_seen_at = now() where id = $1', [row.session_id]);
      await q.exec('update users set last_seen_at = now() where id = $1', [row.id]);
    }
    const { last_seen_at: _, ...user } = row;
    return user;
  });
}

export async function readPlatformSession(d: Deps, req: FastifyRequest): Promise<PlatformAdmin | null> {
  const token = req.cookies[cookieName(d.config.SECURE_COOKIES, true)];
  if (!token) return null;
  return d.db.platform(async q => {
    const row = await q.maybe<{ id: string; email: string; name: string; totp_enabled_at: string | null; mfa_at: string | null; session_id: string }>(
      `select a.id, a.email, a.name, a.totp_enabled_at, s.mfa_at, s.id as session_id
         from platform_sessions s join platform_admins a on a.id = s.admin_id
        where s.token_hash = $1 and s.expires_at > now()`, [hmac(d.config.SESSION_SECRET, token)]);
    if (!row) return null;
    return { id: row.id, email: row.email, name: row.name, totp_enabled: !!row.totp_enabled_at, mfa: !!row.mfa_at && !!row.totp_enabled_at, session_id: row.session_id };
  });
}

export function clearSessionCookie(d: Deps, reply: FastifyReply, platform: boolean) {
  reply.clearCookie(cookieName(d.config.SECURE_COOKIES, platform), { path: '/', secure: d.config.SECURE_COOKIES, httpOnly: true, sameSite: 'lax' });
}
