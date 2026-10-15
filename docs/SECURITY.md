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

See the list below (filled in from the code review).
