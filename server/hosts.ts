// Which part of the platform a request is for, from its Host header alone.
//   <domain>            the public site
//   www.<domain>        redirects to the public site
//   admin.<domain>      the platform console
//   <slug>.<domain>     a university's portal

export type HostKind = { kind: 'public' } | { kind: 'www' } | { kind: 'platform' } | { kind: 'tenant'; slug: string } | { kind: 'unknown' };

/** Never a university's subdomain: ours, cPanel's own service hosts, and names that would confuse people. */
export const RESERVED = new Set([
  'www', 'admin', 'api', 'app', 'status', 'staging', 'static', 'assets', 'cdn', 'help', 'support', 'docs', 'blog', 'mail', 'email',
  'smtp', 'imap', 'pop', 'webmail', 'cpanel', 'whm', 'webdisk', 'cpcalendars', 'cpcontacts', 'autodiscover', 'autoconfig', 'ftp',
  'ns1', 'ns2', 'dev', 'test', 'demo', 'login', 'signin', 'auth', 'account', 'accounts', 'platform', 'root', 'billing', 'security',
]);
export const SLUG = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;
export const slugProblem = (slug: string): string | null =>
  !SLUG.test(slug) ? 'Use 1–40 lower-case letters, digits and hyphens, starting and ending with a letter or digit.'
    : RESERVED.has(slug) ? `“${slug}” is reserved.` : null;

export function classifyHost(rawHost: string | undefined, base: string): HostKind {
  const host = (rawHost ?? '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (host === base) return { kind: 'public' };
  if (!host.endsWith(`.${base}`)) return { kind: 'unknown' };
  const sub = host.slice(0, -base.length - 1);
  if (sub === 'www') return { kind: 'www' };
  if (sub === 'admin') return { kind: 'platform' };
  if (sub.includes('.') || !SLUG.test(sub) || RESERVED.has(sub)) return { kind: 'unknown' };
  return { kind: 'tenant', slug: sub };
}

/** The address a university's links point at. Built from stored data, never from the request, so a forged Host can't redirect emails. */
export const tenantOrigin = (slug: string, base: string, secure: boolean, port?: number) =>
  `${secure ? 'https' : 'http'}://${slug}.${base}${!secure && port ? `:${port}` : ''}`;
export const platformOrigin = (base: string, secure: boolean, port?: number) => tenantOrigin('admin', base, secure, port);
