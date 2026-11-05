# Deploying Going Concern to the VPS

One-time setup for the Liquid Web cPanel VPS, Cloudflare, Brevo and GitHub, then how deploys, rollbacks and backups
work day to day. `your-domain.co.uk` stands for the production domain and `your-staging.co.uk` for a second, cheap
domain used only for staging.

```
Browser ──https──▶ Cloudflare (DNS, wildcard TLS, protection) ──https──▶ Apache (cPanel) ──▶ Node app ×2 (PM2) ──▶ PostgreSQL
                                                                                    127.0.0.1:3100
```

| Host | What it is |
| --- | --- |
| `your-domain.co.uk` | Public site: company machine, CEO mode, live company, `/universities`, `/sign-in` (find your university) |
| `admin.your-domain.co.uk` | Platform console (you): provision and manage universities |
| `<slug>.your-domain.co.uk` | A university's portal, e.g. `strathclyde.your-domain.co.uk` |
| `*.your-staging.co.uk` | The same, for staging |

Adding a university never needs a DNS change: the wildcard record and certificate already cover every subdomain.

---

## 1. Cloudflare (about 20 minutes)

1. Add `your-domain.co.uk` to Cloudflare (free plan) and change the nameservers at your registrar to the two Cloudflare gives you.
2. **DNS**, all **Proxied** (orange cloud):
   - `A  @  <VPS IP>`
   - `A  *  <VPS IP>` (every university, and `admin`)
   - `CNAME  www  your-domain.co.uk`
3. **SSL/TLS → Overview**: set the mode to **Full (strict)**.
4. **SSL/TLS → Origin Server → Create certificate**: hostnames `your-domain.co.uk` and `*.your-domain.co.uk`, 15 years. Keep the certificate and private key for step 2.6.
5. **SSL/TLS → Edge Certificates**: turn on **Always Use HTTPS**, and set the minimum TLS version to 1.2.
6. **Speed → Optimization**: turn **Rocket Loader off**. **Scrape Shield**: turn **Email Address Obfuscation off**. Both inject scripts that the site's security policy blocks.
7. Repeat steps 1–6 for `your-staging.co.uk`.

## 2. The server (WHM as root)

1. **Account.** WHM → Create a New Account for `your-domain.co.uk`, username `gcm`. Then WHM → Manage Shell Access → give `gcm` a **normal shell**.
2. **Staging domain.** cPanel (as `gcm`) → Domains → add `your-staging.co.uk`.
3. **Wildcard subdomains.** cPanel → Domains → create `*.your-domain.co.uk` and `*.your-staging.co.uk`. Their document roots don't matter: Apache sends everything to Node.
4. **Node 22.** WHM → EasyApache 4 → Customize → Additional Packages → `ea-nodejs22` → Provision. Node is then at `/opt/cpanel/ea-nodejs22/bin`.
5. **PostgreSQL.** As root, `su - postgres -c psql`, then:
   ```sql
   create role gcm login password '<strong password 1>' nosuperuser nocreatedb nocreaterole;
   create database gcm_production owner gcm;
   create role gcm_staging login password '<strong password 2>' nosuperuser nocreatedb nocreaterole;
   create database gcm_staging owner gcm_staging;
   -- Backups only: read-only, and allowed past row-level security (the app's own roles are not).
   create role gcm_backup login password '<strong password 3>' bypassrls nosuperuser;
   grant pg_read_all_data to gcm_backup;
   ```
   The app roles must **not** be superusers: superusers skip row-level security, the database's own guarantee that one university never sees another's rows. PostgreSQL must listen on localhost only (the default).
6. **Certificates.** WHM → SSL/TLS → Install an SSL Certificate on a Domain: install the Cloudflare origin certificate and key for `your-domain.co.uk` **and** for `*.your-domain.co.uk`. Do the same for staging with its own origin certificate. AutoSSL leaves a valid certificate it didn't issue alone.
7. **Proxy to Node.** Copy [`deploy/apache/proxy.conf`](../deploy/apache/proxy.conf) to each of these paths, using port `3100` for production and `3101` for staging:
   ```
   /etc/apache2/conf.d/userdata/ssl/2_4/gcm/your-domain.co.uk/gcm-proxy.conf
   /etc/apache2/conf.d/userdata/ssl/2_4/gcm/_wildcard_.your-domain.co.uk/gcm-proxy.conf
   /etc/apache2/conf.d/userdata/ssl/2_4/gcm/your-staging.co.uk/gcm-proxy.conf            (port 3101)
   /etc/apache2/conf.d/userdata/ssl/2_4/gcm/_wildcard_.your-staging.co.uk/gcm-proxy.conf (port 3101)
   ```
   Then `/scripts/rebuildhttpdconf && /scripts/restartsrv_httpd`.
8. **Firewall.** Only Cloudflare should reach ports 80 and 443. The app trusts Cloudflare's visitor-IP header for rate limits, so a direct connection could spoof it. In CSF, remove 80 and 443 from `TCP_IN` in `/etc/csf/csf.conf`, then allow Cloudflare's ranges:
   ```bash
   for ip in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
     echo "tcp|in|d=80|s=$ip"; echo "tcp|in|d=443|s=$ip"; done >> /etc/csf/csf.allow
   csf -r
   ```
   Also: SSH by key only (`PasswordAuthentication no`), cPHulk on, and WHM's automatic updates on.
9. **PM2 at boot** (as `gcm`, then the one root command it prints):
   ```bash
   export PATH=/opt/cpanel/ea-nodejs22/bin:$HOME/.npm-global/bin:$PATH
   echo 'export PATH=/opt/cpanel/ea-nodejs22/bin:$HOME/.npm-global/bin:$PATH' >> ~/.bashrc
   npm config set prefix ~/.npm-global && npm install -g pm2@5
   pm2 startup     # prints a sudo/root command: run it as root
   pm2 install pm2-logrotate
   ```
10. **App folders and settings** (as `gcm`):
    ```bash
    mkdir -p ~/app/shared ~/app-staging/shared
    cp .env.example ~/app/shared/.env && chmod 600 ~/app/shared/.env   # from the repo; fill it in
    ```
    Fill in `~/app/shared/.env` (production: `PORT=3100`, `ENVIRONMENT_NAME=production`, `BASE_DOMAIN=your-domain.co.uk`, the `gcm` and `gcm_backup` database URLs, a new `SESSION_SECRET` from `openssl rand -base64 48`, `BREVO_API_KEY`, and `EMAIL_FROM` from section 3). Do the same in `~/app-staging/shared/.env` with `PORT=3101`, `ENVIRONMENT_NAME=staging`, the staging domain and database, and a **different** `SESSION_SECRET`.
11. **Deploy key.** On your own computer: `ssh-keygen -t ed25519 -f gcm-deploy -C github-deploy`. Append `gcm-deploy.pub` to `/home/gcm/.ssh/authorized_keys`. The private key goes to GitHub in section 4.

## 3. Brevo (sign-in emails)

1. Brevo → Senders, Domains & Dedicated IPs → **Domains** → add `mail.your-domain.co.uk` (a subdomain keeps sending reputation separate). Brevo shows a code TXT record, a DKIM record and a DMARC record: add each in Cloudflare DNS **exactly as shown, DNS only (grey cloud)**, then press Authenticate in Brevo.
2. If Brevo asks for SPF, add `TXT mail  v=spf1 include:spf.brevo.com ~all`.
3. Senders → add `sign-in@mail.your-domain.co.uk`, named "Going Concern".
4. SMTP & API → API Keys → create a key for the server, and put it in `BREVO_API_KEY` (production and staging).
5. Set `EMAIL_FROM=sign-in@mail.your-domain.co.uk`. Give each university's IT team this address to allow (the university admin's Settings page shows the note to send).

## 4. GitHub (CI/CD)

Settings → Environments → create **staging** and **production**. In each, add:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `SSH_KEY` | the private key `gcm-deploy` |
| Secret | `SSH_KNOWN_HOSTS` | output of `ssh-keyscan -p <port> <server IP>` |
| Secret | `SSH_HOST` | the server's IP or hostname |
| Secret | `SSH_USER` | `gcm` |
| Secret | `SSH_PORT` | only if SSH isn't on 22 |
| Variable | `APP_DIR` | `/home/gcm/app-staging` (staging) or `/home/gcm/app` (production) |
| Variable | `SITE_URL` | `https://admin.your-staging.co.uk` or `https://admin.your-domain.co.uk` |

On **production**: tick **Required reviewers** and add yourself, and limit deployment branches to `main`.

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) then:

1. **Every pull request:** typecheck, unit tests, server tests against a real PostgreSQL (as a non-superuser, so isolation is really tested), and a build.
2. **Every merge to `main`:** the same checks, then one release tarball.
3. **Staging, automatically.** [`deploy/ship.sh`](../deploy/ship.sh) copies the release over SSH and runs [`deploy/remote-deploy.sh`](../deploy/remote-deploy.sh) on the server. That script unpacks the release into `releases/<id>`, installs packages, takes a `pg_dump`, migrates, switches the `current` symlink, reloads PM2 one worker at a time, and waits for `/healthz` to report the new release. **If the release isn't healthy, it switches back by itself** and the job fails.
4. **Production:** the same release, once you approve it in the Actions tab.

The weekly SEC data job triggers the same pipeline, so new company data reaches staging straight away and production when you approve it.

Once the domain is live, disable the old GitHub Pages workflow (Actions → "Build and deploy Pages" → Disable) and point the Pages site at the new domain.

## 5. First run

1. Merge to `main`. Watch Actions: staging deploys; approve production.
2. Create your platform admin account (as `gcm`):
   ```bash
   cd ~/app/current && node --env-file=../shared/.env dist-server/platform-admin.js add you@your-email "Your Name"
   ```
3. Open `https://admin.your-domain.co.uk`, sign in with the emailed code, and scan the QR code with an authenticator app.
4. **Provision a university:** type its name, check the email domains with its IT team, and enter the admin's email. The admin gets an invite, signs in and accepts the terms. They invite lecturers; students just sign in with their university email.

## 6. Scheduled jobs (cPanel → Cron Jobs, as `gcm`)

```
15 2 * * *  /home/gcm/app/current/deploy/backup.sh /home/gcm/app >> /home/gcm/app/shared/logs/backup.log 2>&1
40 2 * * *  cd /home/gcm/app/current && /opt/cpanel/ea-nodejs22/bin/node --env-file=../shared/.env dist-server/maintenance.js >> ../shared/logs/maintenance.log 2>&1
```

- **Backups:** 14 nightly dumps on the server. Set `RESTIC_REPOSITORY` and its credentials in `shared/.env` (for example a Backblaze B2 bucket in the EU) and they also go off-site, encrypted, kept 30 daily and 12 monthly. **Restore one each term** to prove it works:
  ```bash
  createdb -O gcm gcm_restore_check && pg_restore --no-owner --role=gcm -d gcm_restore_check shared/backups/<file>.dump && dropdb gcm_restore_check
  ```
- **Maintenance:** deletes sign-in codes and expired sessions after 90 days, and student work once a university's retention period has passed after each course's due date, as the privacy notice promises. Try it with `--dry-run` first.

## 7. Day to day

| Task | How |
| --- | --- |
| Is it up? | `https://your-domain.co.uk/healthz`. Point an uptime monitor (Better Stack or UptimeRobot) at it and at `admin.` |
| What's deployed, backups, deadlines | Platform console → System |
| Roll back | `~/app/current/deploy/rollback.sh ~/app` (previous release) or `… ~/app <release-id>` |
| Logs | `pm2 logs gcm-production`, or `~/app/shared/logs/` |
| Lost authenticator | `node --env-file=../shared/.env dist-server/platform-admin.js reset-2fa you@your-email` |
| Another platform admin | `platform-admin.js add …`, `list`, `remove …` |

**Migrations only ever add.** A column is removed in a later release, once no running code reads it. That way rolling back the code never needs a database rollback. Avoid deploying in the hour before a big deadline: the System page lists them.
