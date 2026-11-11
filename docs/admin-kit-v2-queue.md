# Console v2 on aqeel-admin-kit: the queue

Branch `admin-kit-v2` (local only, never pushed by the builder). `/admin/v2` is rebuilt from scratch on aqeel-admin-kit 0.19.0;
`/admin` (v1) stays as it is, as the fallback. Same APIs and data; server changes only additive.
Plan and reasons: the why review (`admin-kit-reviews/sprint2go-manager.md`) and `docs/admin-kit-v2-plan.md`.

Status: `[x]` built and checked (commit), `[ ]` left.

## Theme step
- [x] Kit installed (`public/admin-v2/kit`), theme `public/admin-v2/admin-theme.css`, sample `/admin/v2/_kit`. compare-themes ok against Continue, InTRIZ, Continue Lab; compare-screens 0 to 3% shape alike.

## Operator console pages (sidebar = the review's proposed navigation)
- [ ] Today (`/admin/v2`)
- [ ] Support › Tickets list (urgent and oldest-waiting first) and one ticket
- [ ] Customers › Companies list (Unlimited view, deletion requests view, grace period for At risk) and one company
- [ ] Customers › People list and one person (Sign in as… in More, with a confirm)
- [ ] Business › Money (revenue defined once, invoices with a confirm before sending, prices and coupons with the save next to the fields)
- [ ] Business › Growth
- [ ] Business › Announcements
- [ ] System › Server (health, errors, backups, maintenance, feature switches)
- [ ] System › Mail
- [ ] System › AI setup (keys, models per job, model prices)
- [ ] Team (operators, roles, audit log)

## Customer app and client portal (`/v2/...`)
- [ ] Not started. See "Left for later" in the plan.

## Checks (run after every page)
- `node <kit>/scripts/check.mjs --dir src/admin/kit --theme public/admin-v2/admin-theme.css --kit public/admin-v2/kit`
- render-check at phone, tablet, desktop and wide against a production build (`npm run build`, server on 4538), signed in
  through the local test harness `admin-kit-reviews/sprint2go-manager/harness/authproxy.mjs` (dummy data, local logins only).
