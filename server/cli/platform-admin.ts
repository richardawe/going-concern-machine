import { Db } from '../db';

// Manage platform admins (the people who can use admin.<domain>). Run on the server:
//   npm run platform:admin -- add you@example.com "Your Name"
//   npm run platform:admin -- reset-2fa you@example.com      (lost phone: set up the authenticator again at next sign-in)
//   npm run platform:admin -- remove someone@example.com
//   npm run platform:admin -- list
// In production the compiled form is: node dist-server/platform-admin.js add ...

const [cmd, rawEmail, name = ''] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) { console.error('Set DATABASE_URL (it is in shared/.env on the server).'); process.exit(1); }
const email = (rawEmail ?? '').trim().toLowerCase();
const db = new Db(url, 1);
try {
  if (cmd === 'list') {
    const rows = await db.platform(q => q.many<{ email: string; name: string; totp_enabled_at: string | null; last_seen_at: string | null }>('select email, name, totp_enabled_at, last_seen_at from platform_admins order by email'));
    for (const r of rows) console.log(`${r.email}\t${r.name}\t2FA ${r.totp_enabled_at ? 'on' : 'not set up'}\tlast seen ${r.last_seen_at ?? 'never'}`);
  } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Usage: platform-admin add|remove|reset-2fa <email> ["Name"] or platform-admin list'); process.exitCode = 1;
  } else if (cmd === 'add') {
    await db.platform(q => q.exec('insert into platform_admins (email, name) values ($1, $2) on conflict (email) do update set name = excluded.name', [email, name]));
    console.log(`${email} can now sign in to the platform console. They'll set up an authenticator app at first sign-in.`);
  } else if (cmd === 'reset-2fa') {
    const n = await db.platform(async q => { await q.exec('delete from platform_sessions where admin_id = (select id from platform_admins where email = $1)', [email]); return q.exec('update platform_admins set totp_secret = null, totp_enabled_at = null where email = $1', [email]); });
    console.log(n ? `${email} will set up a new authenticator app at next sign-in.` : `No platform admin ${email}.`);
  } else if (cmd === 'remove') {
    const n = await db.platform(q => q.exec('delete from platform_admins where email = $1', [email]));
    console.log(n ? `Removed ${email}.` : `No platform admin ${email}.`);
  } else { console.error(`Unknown command ${cmd}.`); process.exitCode = 1; }
} finally { await db.close(); }
