# Security review (16 Oct 2026)

Two parts: the Dokploy server (looked at read-only, nothing changed) and the sprint2go code.

## Dokploy (178.212.35.85)

Do these yourself; each is a setting on your account or server.

| # | What | Why | How |
|---|---|---|---|
| 1 | **Backups: none are set up** | Settings, Server says no S3 destination exists, so the 4 databases are not backed up anywhere. A failed disk or a bad deploy loses the data. | Settings, S3 Destinations: add one (Cloudflare R2, Backblaze B2 or AWS S3), then on each database: Backups, daily, keep 7 to 14. Test one restore. |
| 2 | **The dashboard is plain HTTP on port 3000** | Your Dokploy password and session travel unencrypted, and the panel that controls every app is open to the whole internet. | Settings, Server: add a domain (e.g. `panel.elkiya.com`), HTTPS with Let's Encrypt. Then close port 3000 in the firewall (Contabo panel or `ufw`) so only the HTTPS domain works. |
| 3 | **2FA is off for the owner account** | The only account controls every app and database. | Settings, Profile: Enable 2FA (or a passkey). |
| 4 | **The root password was shared in chat on 15 Oct** | It's in a chat transcript now. | SSH in and run `passwd`. Better: add an SSH key, then set `PasswordAuthentication no` and `PermitRootLogin prohibit-password` in `/etc/ssh/sshd_config`. |
| 5 | Dokploy v0.30.8 | Updates carry security fixes. | Settings, Server: Check for updates. |
| 6 | Env vars | Keep API keys (AI, Stripe, SES) in each app's Environment tab, never in the repository or the image. | Review each app's Environment tab; rotate any key that was ever committed. |

## sprint2go code

**Good news first:** no secrets reach the browser (the only client env value is `VITE_AI_URL`, an address). Every
`/api` route checks the session and the company; SQL is parameterised; email HTML is sanitised and shown in a sandboxed
frame; uploads that could run code download instead of opening; CSP, frame, HSTS and nosniff headers are set; the
mail server is not an open relay; stored keys are encrypted with AES-GCM.

### Fixed tonight

| | Problem | Fix |
|---|---|---|
| Critical | One malformed address (`/%E0%A4%A`) crashed the whole server, mail included | Every request is caught: a bad one answers 400 or 500, the server keeps running (checked) |
| High | Table webhooks could reach internal services (Dokploy, cloud metadata, other containers) and show the reply | The address is resolved and refused when private; redirects aren't followed |
| High | Rate limits trusted a client-supplied IP header, so signup and reset limits could be skipped | Only the address the proxy added counts; resets also limited per email (5 an hour) |
| Medium | `/backlog/data.json` was readable without signing in | Every `/backlog` path is signed-in only (checked: 404 when signed out) |
| Medium | Sign-in and reset codes were written to the logs in production when email failed | Logged only outside production |
| Medium | Operator console 2FA had no limit on wrong codes | 5 wrong codes, then a 15-minute wait |
| Low | A local `.env` could end up in the Docker image | `.dockerignore` excludes `.env` and `.env.*` |
| Low | `/brand-icon` could serve an SVG logo | PNG, JPG, GIF and WebP only |

### Still to do (decide or schedule)

- **Password hashing cost** (`server/db.ts:65`): scrypt at defaults (N=16384). Raise to N=131072 with the parameters
  stored in the hash so old hashes upgrade on next sign-in. Needs a small migration; worth doing with care, not at night.
- **Custom AI endpoint check** (`server/llm.ts:270`): checks the host name, not the address it resolves to. Route through
  the same resolve-and-check as webhooks.
- **Dependencies:** `npm audit` shows 2 high in `node-forge` via `acme-client` (low real risk here). Update
  `acme-client` and re-test certificate issuing.
- **Signup says whether an email has an account** (409). Login and reset don't. Optional: always "check your email".
- **Invite tokens stored in plain text** (`server/db.ts:156`); session tokens are hashed. Hash them the same way.
- **The container runs as root.** Add `USER node` in the Dockerfile; port 25 then needs `NET_BIND_SERVICE` or a mapping.

### In Dokploy for sprint2go itself

- `PUBLIC_URL=https://…` (without it cookies aren't marked Secure and HSTS is off), `NODE_ENV=production`, and
  `S2G_DEMO` not set.
- Set `S2G_SECRET` and keep it out of the volume backup; otherwise the master key sits next to the database in
  `/app/data/secret.key`, and a copy of the backup decrypts every stored key.
- Publish only 80/443 (Traefik), 25, and 993/465/587 if mail apps are on. Never publish 8787 directly.
- Back up `/app/data` daily (see Dokploy item 1) and test a restore.
