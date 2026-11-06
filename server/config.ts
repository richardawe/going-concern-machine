import { z } from 'zod';

// Every setting comes from the environment (the server's shared/.env in production). Nothing secret has a default.

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3100),
  HOST: z.string().default('127.0.0.1'),
  /** The domain universities hang off, e.g. goingconcern.co.uk. Hosts are apex, admin.<domain> and <slug>.<domain>. */
  BASE_DOMAIN: z.string().min(3).transform(s => s.toLowerCase()),
  DATABASE_URL: z.string().min(1),
  /** Random, at least 32 characters. Keys the hashes of sign-in codes and session tokens. */
  SESSION_SECRET: z.string().min(32),
  /** 'brevo' sends real mail; 'log' prints it (development); 'memory' keeps it for tests. */
  EMAIL_MODE: z.enum(['brevo', 'log', 'memory']).default('log'),
  BREVO_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default('no-reply@example.com'),
  EMAIL_FROM_NAME: z.string().default('Going Concern Lab'),
  /** Where the built web app lives (Vite's dist). */
  STATIC_DIR: z.string().default('dist'),
  /** Commit the release was built from, reported by /healthz so a deploy can check it is live. */
  RELEASE: z.string().default('dev'),
  /** Behind Cloudflare: read the visitor's IP from CF-Connecting-IP. Only safe when the origin accepts Cloudflare alone. */
  TRUST_CLOUDFLARE: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  /** Secure cookies with the __Host- prefix. Off only for local http development. */
  SECURE_COOKIES: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
  /** Run the background grader in this process (one of the PM2 workers is enough, but more is safe). */
  GRADER: z.enum(['on', 'off', 'inline']).default('on'),
  /** Days of backups to report on the System page; the path is read only to show when the last one ran. */
  BACKUP_DIR: z.string().optional(),
  ENVIRONMENT_NAME: z.string().default('local'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`The server's settings are incomplete:\n${lines}`);
  }
  const c = parsed.data;
  if (c.EMAIL_MODE === 'brevo' && !c.BREVO_API_KEY) throw new Error('EMAIL_MODE=brevo needs BREVO_API_KEY.');
  if (c.NODE_ENV === 'production' && !c.SECURE_COOKIES) throw new Error('Production needs SECURE_COOKIES=true.');
  if (c.NODE_ENV === 'production' && c.EMAIL_MODE !== 'brevo') throw new Error('Production needs EMAIL_MODE=brevo.');
  return c;
}
