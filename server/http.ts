import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z, ZodTypeAny } from 'zod';
import type { Config } from './config';
import type { Db } from './db';
import type { HostKind } from './hosts';
import type { Mailer } from './email';

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}
export const fail = (status: number, message: string, extra?: Record<string, unknown>): never => { throw new HttpError(status, message, extra); };

/** Parses a body or query with zod, turning the first problem into a plain 400. */
export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value ?? {});
  if (r.success) return r.data;
  const i = r.error.issues[0];
  return fail(400, i.message.startsWith('Expected') || i.message === 'Required' ? `Check ${i.path.join('.') || 'the request'}: ${i.message.toLowerCase()}.` : i.message);
}

export interface Tenant {
  id: string; slug: string; name: string; status: 'trial' | 'active' | 'suspended' | 'closed'; brand_color: string | null;
  seat_limit: number | null; retention_months: number; terms_accepted_at: string | null;
}
export interface User { id: string; tenant_id: string; email: string; name: string; student_id: string; role: 'student' | 'lecturer' | 'admin'; status: string; session_id: string }
export interface PlatformAdmin { id: string; email: string; name: string; totp_enabled: boolean; mfa: boolean; session_id: string }

export interface Deps { config: Config; db: Db; mailer: Mailer; kickGrader: () => void }

declare module 'fastify' {
  interface FastifyRequest {
    site: HostKind;
    tenant: Tenant | null;
    user: User | null;
    admin: PlatformAdmin | null;
    clientIp: string;
  }
}

export function needTenant(req: FastifyRequest): Tenant {
  if (req.site.kind !== 'tenant' || !req.tenant) return fail(404, 'There is no university at this address.');
  return req.tenant;
}
export function needUser(req: FastifyRequest, roles?: User['role'][]): User & { tenant: Tenant } {
  const tenant = needTenant(req);
  if (!req.user) return fail(401, 'Sign in to continue.');
  if (roles && !roles.includes(req.user.role)) return fail(403, 'You don’t have access to this page.');
  return { ...req.user, tenant };
}
export function needPlatform(req: FastifyRequest, { mfa = true } = {}): PlatformAdmin {
  if (req.site.kind !== 'platform') return fail(404, 'Not found.');
  if (!req.admin) return fail(401, 'Sign in to continue.');
  if (mfa && !req.admin.mfa) return fail(401, 'Enter the code from your authenticator app.', { mfa: true });
  return req.admin;
}

export const attachment = (reply: FastifyReply, name: string, type: string) =>
  reply.header('content-type', type).header('content-disposition', `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"`).header('cache-control', 'no-store');

/** A CSV cell that spreadsheets won't run as a formula. */
export const csvCell = (v: string | number | null | undefined) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s;
};

export const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'live.co.uk', 'msn.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.co.uk',
  'mail.com', 'yandex.com', 'zoho.com', 'btinternet.com', 'sky.com', 'virginmedia.com', 'talktalk.net', 'ntlworld.com', 'qq.com', '163.com']);
export const emailDomain = (email: string) => email.slice(email.lastIndexOf('@') + 1);
export const domainMatches = (domain: string, rule: { domain: string; include_subdomains: boolean }) =>
  domain === rule.domain || (rule.include_subdomains && domain.endsWith(`.${rule.domain}`));
