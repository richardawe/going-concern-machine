# Going Concern Lab: setting up production, step by step

The click-by-click version of [DEPLOYMENT.md](DEPLOYMENT.md), for getting **goingconcernlab.com** live on the Liquid
Web cPanel VPS. Work through the parts in order and tick each box as you go. Staging is left out for now: see
DEPLOYMENT.md section 8 for when a second university signs.

> **Status, 6 November 2026:** Parts 1–4 are done. Claude ran them through the Cloudflare, Brevo and GitHub APIs and
> a temporary root SSH key. Where production differs from the steps below:
> - The server's own PostgreSQL is version 13 and other sites use it, so Going Concern has its own PostgreSQL 16
>   (service `postgresql-16-gcm`, `127.0.0.1:5433`). See DEPLOYMENT.md 2.4.
> - On this cPanel version the wildcard proxy folder is `wildcard_safe.goingconcernlab.com`, not `_wildcard_…`.
> - Namecheap's email-forwarding MX and SPF records were copied into Cloudflare, so mail to the domain still forwards.
> - Brevo's DKIM records were added both under `mail.` and at the root, because Brevo's host names are ambiguous for a
>   subdomain. Brevo shows the domain as authenticated.

**Who does what**

| Part | Who | Status |
| --- | --- | --- |
| 1. Cloudflare | Done (Claude) | ☑ |
| 2. WHM (the server) | Done (Claude) | ☑ |
| 3. GitHub secrets and the production environment | Done (Claude) | ☑ |
| 4. Brevo (sign-in emails) | Done (Claude) | ☑ |
| 5. Setup check, first deploy, your console account, nightly jobs | Done (Claude) | ☑ |
| 6. Firewall | Done (Claude) | ☑ |
| 7. Provision the first university | You, in the console | ☐ |

Claude can't log in to the server directly: its sessions can't make SSH connections. It operates the server through
the **Server task** workflow in GitHub Actions instead, which runs one operation at a time from a fixed menu.

**Keep these somewhere safe** (a password manager, never in the repository or an email):
- Cloudflare origin certificate and private key (Part 1.7)
- The `gcm` cPanel password (Part 2.1)
- The two database passwords (Part 2.4)
- `SESSION_SECRET` (Part 2.8)
- The deploy private key, until it's in GitHub (Part 2.9)
- The Brevo API key (Part 4)

---

## Part 1 — Cloudflare

### 1.1 Add the domain ☐
1. Go to **dash.cloudflare.com** and sign up or log in.
2. Click **Add a domain** (it may say "Onboard a domain"). Enter `goingconcernlab.com` and keep **Quick scan for DNS records**. Continue.
3. Choose the **Free** plan.

### 1.2 Clean up the scanned records ☐
The scan may import your registrar's "parking" records, usually an `A` record for `goingconcernlab.com` and a `CNAME` for `www`. **Delete them all.** You'll add the right ones next.

### 1.3 Find your server's IP address ☐
WHM shows it at the top of the home page and under "Server Information". It's also in the Liquid Web portal under your server.

### 1.4 Add three DNS records ☐
Go to **DNS → Records → Add record**. For each one, make sure the proxy status shows the **orange cloud (Proxied)**.

| Type | Name | Content |
| --- | --- | --- |
| A | `@` | your server IP |
| A | `*` | your server IP |
| CNAME | `www` | `goingconcernlab.com` |

The `*` record covers `admin.goingconcernlab.com` and every university, such as `strathclyde.goingconcernlab.com`. You never add DNS records for a new university.

### 1.5 Point the domain at Cloudflare ☐
1. Cloudflare shows two nameservers, like `ada.ns.cloudflare.com` and `bob.ns.cloudflare.com`.
2. At the registrar where you bought the domain, open the domain's **Nameservers** setting and choose **Custom**. Replace whatever is there with the two Cloudflare names. If **DNSSEC** is on at the registrar, turn it off first.
3. Back in Cloudflare, click **Check nameservers**. Activation takes minutes to a few hours, and Cloudflare emails you when it's active.

### 1.6 Encryption mode ☐
**SSL/TLS → Overview** → set **Full (strict)**.

### 1.7 Origin certificate (for your server) ☐
1. Go to **SSL/TLS → Origin Server → Create Certificate**.
2. Keep "Generate private key and CSR with Cloudflare" and choose key type **RSA (2048)**.
3. Hostnames should already list `goingconcernlab.com` and `*.goingconcernlab.com`. Keep validity at **15 years**. Click **Create**.
4. Copy **Origin Certificate** into a text file called `origin-cert.pem`, and **Private Key** into `origin-key.pem`.
   **The private key is shown only once.** Keep both safe, and don't email them or put them in the repository.

### 1.8 Edge settings ☐
1. **SSL/TLS → Edge Certificates**: turn **Always Use HTTPS** on, and set **Minimum TLS Version** to 1.2.
2. Use the dashboard search to find **Rocket Loader** and **Email Address Obfuscation**, and make sure both are **off**. They inject scripts the site's security policy blocks.

---

## Part 2 — WHM (the server)

Log in as root at `https://<server IP>:2087`. For terminal steps, use **WHM → Server Configuration → Terminal**, which is a root shell in the browser.

### 2.1 Create the account ☐
**Account Functions → Create a New Account**:
- Domain: `goingconcernlab.com`
- Username: `gcm`
- Password: use the generator and save it
- Email: yours
- Leave the rest as default and click **Create**.

Then go to **Account Functions → Manage Shell Access** and set `gcm` to **Normal Shell**.

### 2.2 Wildcard subdomain ☐
1. **Account Information → List Accounts**, then click the **cPanel** icon next to `gcm`.
2. In cPanel, go to **Domains → Domains → Create A New Domain**.
3. Domain: `*.goingconcernlab.com`. Untick "Share document root". Submit.

### 2.3 Node 22 and Apache modules ☐
1. **WHM → Software → EasyApache 4 → Customize** (on the "Currently Installed Packages" profile).
2. **Apache Modules:** make sure `mod_proxy`, `mod_proxy_http` and `mod_headers` are on.
3. **Additional Packages:** turn on `ea-nodejs22`.
4. **Review → Provision**. Wait for it to finish.

### 2.4 PostgreSQL accounts ☐
In the Terminal, first make three strong passwords and save them:
```bash
for i in 1 2 3; do openssl rand -base64 24 | tr -d '/+='; done
```
Then open PostgreSQL:
```bash
su - postgres -c psql
```
Paste these, replacing `PASSWORD_1` and `PASSWORD_2` with two of the passwords above:
```sql
select version();
create role gcm login password 'PASSWORD_1' nosuperuser nocreatedb nocreaterole;
create database gcm_production owner gcm;
create role gcm_backup login password 'PASSWORD_2' bypassrls nosuperuser;
grant pg_read_all_data to gcm_backup;
\q
```
- `gcm` is the app's account. It must **not** be a superuser: superusers skip row-level security, the database's own guarantee that one university never sees another's data.
- `gcm_backup` is read-only and used only for backups.
- `select version()` must show **14 or newer**. If it's older and other sites use it, don't upgrade it: run a separate
  PostgreSQL 16 for Going Concern on port 5433 instead (DEPLOYMENT.md 2.4), and use port 5433 below and in the `.env`.

Test that the app's account can log in:
```bash
psql "postgres://gcm:PASSWORD_1@127.0.0.1:5432/gcm_production" -c "select current_user"
```
**If you see `ident` or `peer authentication failed`:**
1. Run `su - postgres -c "psql -tc 'show hba_file'"` to find the file.
2. Open it with `nano` and add this line **above** the other `host` lines:
   ```
   host  all  gcm,gcm_backup  127.0.0.1/32  scram-sha-256
   ```
3. Run `systemctl reload postgresql` (on some servers the service has a version number, e.g. `postgresql-16`).
4. Test again.

### 2.5 Install the certificate ☐
1. Open cPanel for `gcm` → **Security → SSL/TLS → Manage SSL sites**.
2. Domain: `goingconcernlab.com`. Paste `origin-cert.pem` into Certificate and `origin-key.pem` into Private Key. If it asks for a CA bundle, paste Cloudflare's "Origin CA RSA root" (search "Cloudflare origin CA root certificate"). **Install**.
3. Repeat with the domain set to `*.goingconcernlab.com`, using the same certificate and key.
4. Then in **WHM → SSL/TLS → Manage AutoSSL → Manage Users**: **disable AutoSSL for `gcm`**. It can't work behind Cloudflare and would only send warnings.

### 2.6 Proxy file ☐
In the Terminal, paste all of this:
```bash
for v in goingconcernlab.com wildcard_safe.goingconcernlab.com; do
  mkdir -p /etc/apache2/conf.d/userdata/ssl/2_4/gcm/$v
  cat > /etc/apache2/conf.d/userdata/ssl/2_4/gcm/$v/gcm-proxy.conf <<'EOF'
ProxyPreserveHost On
ProxyRequests Off
ProxyTimeout 60
RequestHeader set X-Forwarded-Proto "https"
ProxyPass /.well-known/ !
ProxyPass / http://127.0.0.1:3100/ retry=0
ProxyPassReverse / http://127.0.0.1:3100/
EOF
done
/scripts/rebuildhttpdconf && /scripts/restartsrv_httpd && echo "Apache OK"
```

### 2.7 Node tools for `gcm` ☐
In the Terminal:
```bash
su - gcm
export PATH=/opt/cpanel/ea-nodejs22/bin:$HOME/.npm-global/bin:$PATH
echo 'export PATH=/opt/cpanel/ea-nodejs22/bin:$HOME/.npm-global/bin:$PATH' >> ~/.bashrc
node -v                                   # should start with v22
npm config set prefix ~/.npm-global && npm install -g pm2@5
pm2 startup                               # copy the command it prints
exit                                      # back to root
```
Paste the command `pm2 startup` printed, **as root, without `sudo`**. Then go back to `gcm`:
```bash
su - gcm
pm2 install pm2-logrotate
```

### 2.8 The settings file ☐
Still as `gcm`:
```bash
mkdir -p ~/app/shared/logs ~/app/shared/backups
openssl rand -base64 48                   # copy this: it's your SESSION_SECRET
nano ~/app/shared/.env
```
Paste the following, filling in the bracketed parts. Brevo is Part 4, so you can fill in `BREVO_API_KEY` then, but **the app won't start without it**.
```
ENVIRONMENT_NAME=production
PORT=3100
WORKERS=2
BASE_DOMAIN=goingconcernlab.com
DATABASE_URL=postgres://gcm:[PASSWORD_1]@127.0.0.1:5432/gcm_production
BACKUP_DATABASE_URL=postgres://gcm_backup:[PASSWORD_2]@127.0.0.1:5432/gcm_production
SESSION_SECRET=[the openssl output]
EMAIL_MODE=brevo
BREVO_API_KEY=[from Brevo]
EMAIL_FROM=sign-in@mail.goingconcernlab.com
EMAIL_FROM_NAME="Going Concern"
STATIC_DIR=dist
SECURE_COOKIES=true
TRUST_CLOUDFLARE=true
GRADER=on
BACKUP_DIR=/home/gcm/app/shared/backups
```
Save with **Ctrl+O, Enter, Ctrl+X**, then run:
```bash
chmod 600 ~/app/shared/.env
```

### 2.9 Deploy key (lets GitHub log in as `gcm`) ☐
Still as `gcm`:
```bash
ssh-keygen -t ed25519 -N "" -C github-deploy -f ~/gcm-deploy
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cat ~/gcm-deploy.pub >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
cat ~/gcm-deploy                              # copy ALL of it, BEGIN to END lines: this is SSH_KEY
ssh-keyscan -p 22 [server IP] 2>/dev/null     # copy all lines: this is SSH_KNOWN_HOSTS
grep -i '^Port' /etc/ssh/sshd_config          # if this shows a port other than 22, note it
```
Once both are saved in GitHub (Part 3), delete the private key from the server:
```bash
rm ~/gcm-deploy ~/gcm-deploy.pub
```
SSH must stay reachable from the internet, because GitHub's runners don't have fixed addresses. Key-only login keeps that safe.

---

## Part 3 — GitHub

On **github.com/richardawe/going-concern-machine**:

### 3.1 Open the settings ☐
Go to **Settings → Secrets and variables → Actions**.

### 3.2 Secrets ☐
On the **Secrets** tab, click **New repository secret** once for each row:

| Name | Value |
| --- | --- |
| `SSH_KEY` | the private key from 2.9 |
| `SSH_KNOWN_HOSTS` | the `ssh-keyscan` lines from 2.9 |
| `SSH_HOST` | your server IP |
| `SSH_USER` | `gcm` |
| `SSH_PORT` | only if 2.9 showed a port other than 22 |

### 3.3 Variables ☐
On the **Variables** tab, click **New repository variable**:

| Name | Value |
| --- | --- |
| `APP_DIR` | `/home/gcm/app` |
| `SITE_URL` | `https://admin.goingconcernlab.com` |

Deploys stay switched off until `APP_DIR` is set, so nothing reaches the server before you're ready.

### 3.4 Production environment ☐
1. **Settings → Environments → New environment**, named `production`.
2. Tick **Required reviewers**, add yourself, and leave "Prevent self-review" off. **Save protection rules.**
3. Under **Deployment branches and tags**, choose **Selected branches and tags**, then **Add rule** with `main`.

If you'd rather deploys go live without approval, skip step 2. Keeping approval is recommended while a paying university is live.

### 3.5 Phone notifications ☐
Install the **GitHub mobile app** and turn on notifications. Approving a deploy then becomes one tap.

---

## Part 4 — Brevo (sign-in emails)

1. **Senders, Domains & Dedicated IPs → Domains** → add `mail.goingconcernlab.com`. Brevo shows a code record, a DKIM record and a DMARC record. Add each in Cloudflare DNS **exactly as shown, with the grey cloud (DNS only)**, then click **Authenticate** in Brevo. ☐
2. If Brevo asks for SPF, add `TXT  mail  v=spf1 include:spf.brevo.com ~all` in Cloudflare. ☐
3. **Senders** → add `sign-in@mail.goingconcernlab.com`, named "Going Concern". ☐
4. **SMTP & API → API Keys** → create one, and put it in `BREVO_API_KEY` in `~/app/shared/.env` (Part 2.8). ☐

---

## Part 5 — Setup check and first deploy (Claude, through GitHub Actions)

Tell Claude when Parts 1–4 are done. Claude runs these in the repository's **Server task** workflow, and you can run any of them yourself from **Actions → Server task → Run workflow**:

1. **`preflight`** checks every step above (Node, PM2, the settings file, both database roles, the Brevo key, the certificate, the Apache proxy, Cloudflare, disk space). It says exactly what still needs fixing. Repeat until it passes. ☑
2. **First deploy:** Claude starts the deploy workflow, and **you tap Approve** in GitHub. The server takes a backup, sets up the database, starts the app and checks it's healthy. If the release isn't healthy, the server switches back to the previous one by itself. ☑
3. **`add-admin`** with your email and name creates your platform console account. ☑
4. **`install-cron`** sets up the nightly backup (02:15) and data clean-up (02:40). ☑
5. **`status`** confirms the release, both app workers, backups and cron. ☑

---

## Part 6 — Firewall (done 6 November 2026)

Only Cloudflare should reach the site directly: the app trusts Cloudflare's visitor-address header for rate limiting,
so direct connections could get around it.

This server hosts other sites, so ports 80 and 443 are **not** closed in CSF: that would cut off sites that aren't behind
Cloudflare. And cPanel's NGINX sits in front of Apache, so Apache sees every request as coming from `127.0.0.1` and
can't do the check. The check is in NGINX instead, and applies only to the `gcm` account:

- `/etc/nginx/conf.d/gcm-cloudflare-geo.conf` lists Cloudflare's ranges (and the server itself), matched against
  the address that actually connected (`$realip_remote_addr`), not the rewritten visitor address.
- `/etc/nginx/conf.d/users/gcm/cloudflare-only.conf` returns 403 to anything else.
- NGINX caching is **off** for `gcm` (`/usr/local/cpanel/scripts/ea-nginx cache gcm --enabled=0`), so it can never
  serve one user's page to another. Cloudflare still caches the static files.

Cloudflare rarely changes its ranges. If it does, rebuild the geo file from cloudflare.com/ips and run
`nginx -t && systemctl reload nginx` as root. Keep SSH open: GitHub deploys need it.
---

## Part 7 — The first university

1. Open **https://admin.goingconcernlab.com** and sign in with your email. You'll get a 6-digit code. ☐
2. Scan the QR code with an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password…) and enter its code. ☐
3. **Provision a university:** type its name (e.g. "Strathclyde"), confirm the email domains with the university's IT team, enter the university admin's email and the number of student places, then click Provision. ☐
4. The admin gets an invite, signs in, and accepts the terms. They invite lecturers; students just sign in with their university email. ☐
5. Send the university's IT team the note on the admin's **Settings** page, so sign-in emails from `sign-in@mail.goingconcernlab.com` aren't filtered. ☐

**Before the first class:** have the privacy notice and accessibility statement reviewed and their placeholders filled in (`src/portal/Legal.tsx`), and choose off-site backup storage (DEPLOYMENT.md section 6).

---

## If something doesn't match

Liquid Web's panels vary a little between servers. If a screen doesn't look like these steps, take a screenshot and send it to Claude.

| Problem | Where to look |
| --- | --- |
| The site shows a Cloudflare 521 or 522 error | Apache isn't running, or the firewall blocks Cloudflare |
| The site shows a Cloudflare 525 or 526 error | The origin certificate isn't installed on that domain (2.5) |
| You see the cPanel default page instead of the app | The proxy file is missing for that domain (2.6) |
| Anything else | Run **Server task → `recent-errors`** |
