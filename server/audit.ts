import type { FastifyRequest } from 'fastify';
import type { Q } from './db';

// Who did what, to what, when. Written in the same transaction as the change it records.

export function audit(q: Q, req: FastifyRequest, action: string, target: string | null, detail: Record<string, unknown> = {}, tenantId?: string | null) {
  const actor = req.admin ? { kind: 'platform', id: req.admin.id, email: req.admin.email }
    : req.user ? { kind: 'user', id: req.user.id, email: req.user.email } : { kind: 'system', id: null, email: null };
  return q.exec(
    'insert into audit_log (tenant_id, actor_kind, actor_id, actor_email, action, target, detail, ip) values ($1, $2, $3, $4, $5, $6, $7, $8)',
    [tenantId ?? req.tenant?.id ?? null, actor.kind, actor.id, actor.email, action, target, JSON.stringify(detail), req.clientIp]);
}
