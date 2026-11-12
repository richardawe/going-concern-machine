import nodemailer from 'nodemailer';
import type { Config } from './config';

// Transactional email through Brevo's API or any SMTP server. In development the message is printed; in tests it is
// kept in memory.

export interface Mail { to: string; subject: string; text: string; html: string; tag: string; replyTo?: { email: string; name?: string } }
export interface Mailer { send(m: Mail): Promise<void>; outbox: Mail[] }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function createMailer(c: Config): Mailer {
  const outbox: Mail[] = [];
  const smtp = c.EMAIL_MODE === 'smtp' ? nodemailer.createTransport({
    host: c.SMTP_HOST, port: c.SMTP_PORT, secure: c.SMTP_SECURE,
    // A remote server must upgrade to TLS before the password is sent; the host's own relay on localhost needn't.
    requireTLS: !c.SMTP_SECURE && !/^(localhost|127\.0\.0\.1|::1)$/.test(c.SMTP_HOST ?? ''),
    auth: c.SMTP_USER ? { user: c.SMTP_USER, pass: c.SMTP_PASS ?? '' } : undefined,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  }) : null;
  return {
    outbox,
    async send(m) {
      if (c.EMAIL_MODE === 'memory') { outbox.push(m); return; }
      if (c.EMAIL_MODE === 'log') { console.log(`\n✉  To ${m.to}: ${m.subject}\n${m.text}\n`); return; }
      if (smtp) {
        await smtp.sendMail({
          from: { name: c.EMAIL_FROM_NAME, address: c.EMAIL_FROM }, to: m.to, subject: m.subject, text: m.text, html: m.html,
          ...(m.replyTo ? { replyTo: m.replyTo.name ? { name: m.replyTo.name, address: m.replyTo.email } : m.replyTo.email } : {}),
          headers: { 'X-GCM-Tag': m.tag },
        });
        return;
      }
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': c.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { email: c.EMAIL_FROM, name: c.EMAIL_FROM_NAME }, to: [{ email: m.to }], ...(m.replyTo ? { replyTo: m.replyTo } : {}), subject: m.subject, textContent: m.text, htmlContent: m.html, tags: [m.tag] }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Brevo refused the email (${res.status}): ${(await res.text()).slice(0, 300)}`);
    },
  };
}

// Templates. Plain, short, and the same shape every time so university filters learn them.
function layout(title: string, lines: string[], footer: string) {
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f5;font:15px/1.55 Arial,sans-serif;color:#373c43">
<div style="max-width:520px;margin:0 auto;padding:32px 20px"><div style="background:#fbfbfb;border-radius:12px;padding:28px;border:1px solid #dee0e3">
<p style="font:12px monospace;letter-spacing:.08em;color:#737d8c;margin:0 0 14px">GOING CONCERN LAB</p>
<h1 style="font-size:20px;color:#17191c;margin:0 0 14px">${esc(title)}</h1>${lines.join('')}</div>
<p style="font-size:12px;color:#737d8c;margin:16px 4px">${esc(footer)}</p></div></body></html>`;
  return html;
}
const p = (s: string) => `<p style="margin:0 0 12px">${esc(s)}</p>`;
const big = (s: string) => `<p style="font:600 30px monospace;letter-spacing:.2em;color:#17191c;margin:6px 0 18px">${esc(s)}</p>`;
const button = (href: string, label: string) => `<p style="margin:6px 0 18px"><a href="${esc(href)}" style="background:#17191c;color:#fbfbfb;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">${esc(label)}</a></p>`;

export function codeMail(to: string, code: string, place: string): Mail {
  const footer = `You asked to sign in to ${place}. If you didn't, ignore this email: nobody can sign in without the code.`;
  return {
    to, tag: 'sign-in-code', subject: `${code} is your Going Concern Lab sign-in code`,
    text: `Your sign-in code for ${place} is ${code}\n\nIt works for 10 minutes.\n\n${footer}`,
    html: layout('Your sign-in code', [p(`Enter this code to sign in to ${place}.`), big(code), p('It works for 10 minutes.')], footer),
  };
}
export function inviteMail(to: string, role: string, university: string, url: string, by: string): Mail {
  const what = role === 'admin' ? 'an administrator' : role === 'lecturer' ? 'a lecturer' : 'a member';
  const footer = `Sent by Going Concern Lab on behalf of ${university}.`;
  return {
    to, tag: 'invite', subject: `You're invited to ${university} on Going Concern Lab`,
    text: `${by} has added you to ${university} on Going Concern Lab as ${what}.\n\nSign in with this email address at ${url}\n\nThere is no password: we'll email you a code each time.\n\n${footer}`,
    html: layout(`Join ${university} on Going Concern Lab`, [p(`${by} has added you as ${what}.`), button(url, 'Sign in'), p(`Sign in with this email address at ${url}. There is no password: we'll email you a code each time.`)], footer),
  };
}
export function receiptMail(to: string, r: { course: string; code: string; when: string; late: boolean; url: string; university: string }): Mail {
  const footer = `Sent by Going Concern Lab on behalf of ${r.university}.`;
  return {
    to, tag: 'receipt', subject: `Handed in: ${r.course}`,
    text: `Your work for ${r.course} was handed in at ${r.when}${r.late ? ' (after the due date)' : ''}.\n\nVerification code: ${r.code}\n\nYour lecturer can see it now. Download the PDF at ${r.url}\n\n${footer}`,
    html: layout(`Handed in: ${r.course}`, [p(`Handed in at ${r.when}${r.late ? ', after the due date' : ''}. Your lecturer can see it now.`), p('Verification code'), big(r.code), button(r.url, 'Open your receipt')], footer),
  };
}
export function contactMail(to: string, m: { name: string; email: string; university: string; role: string; message: string }): Mail {
  const footer = 'Sent from the contact form on goingconcernlab.com/universities. Reply to this email to answer them.';
  const rows: [string, string][] = [['Name', m.name], ['Email', m.email], ['University', m.university], ['Role', m.role]];
  return {
    to, tag: 'contact', replyTo: { email: m.email, name: m.name }, subject: `Pilot enquiry: ${m.university} (${m.name})`,
    text: `${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${m.message}\n\n${footer}`,
    html: layout(`Pilot enquiry from ${m.university}`, [...rows.map(([k, v]) => p(`${k}: ${v}`)), ...m.message.split(/\n{2,}/).map(p)], footer),
  };
}
