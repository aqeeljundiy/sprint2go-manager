# Console v2 on aqeel-admin-kit: the queue

Branch `admin-kit-v2` (local only, never pushed by the builder). `/admin/v2` is rebuilt from scratch on aqeel-admin-kit 0.20.0;
`/admin` (v1) stays as it is, as the fallback. Same APIs and data; no server change.
Plan, reasons and the owner's delegated answers: `docs/admin-kit-v2-plan.md` (from the why review, `admin-kit-reviews/sprint2go-manager.md`).

Status: `[x]` built and checked (commit), `[ ]` left.

## Theme step
- [x] Kit installed (`public/admin-v2/kit`), theme `public/admin-v2/admin-theme.css`, sample `/admin/v2/_kit` (f2062b4). compare-themes ok against Continue, InTRIZ, Continue Lab; compare-screens 0 to 3% shape alike.
- [x] Kit 0.20.0 and the Operators app icon from sprint2go's mark, own manifest for /admin/v2 (5b11f1c). Head tags load from `/admin-v2/boot.js` (the server's CSP blocks inline scripts) (0b9eda4).

## Operator console pages (sidebar = the review's proposed navigation)
- [x] Today (`/admin/v2`) (e18cedc)
- [x] Support › Tickets list (due first on top) and one ticket (e18cedc); Support settings: reply targets and saved replies (5b11f1c)
- [x] Customers › Companies list (Unlimited view, 7-day grace before At risk) and one company (c8183ab)
- [x] Customers › People list and one person (Sign in as… in More, ticket number and confirm) (c8183ab)
- [x] Business › Money: revenue defined once, invoices ask before sending, prices with the save under the fields, AI margin, invoice settings (b05c515)
- [x] Business › Growth (0b9eda4)
- [x] Business › Announcements (0b9eda4)
- [x] System › Server: health, errors, backups, maintenance, feature switches (0b9eda4)
- [x] System › Mail (0b9eda4)
- [x] System › AI setup: keys, models per job, model prices (0b9eda4)
- [x] Team: operators, roles, audit log (5b11f1c)
- [x] Indonesian for every new word (i18n-check --strict)

## Customer app and client portal (`/v2/...`)
- [ ] Not started. See "Left for later" in the plan. The client portal Home bug is still on v1 (likely cause in the why review: the portal reuses `home-grid cards` with no column span).

## Checks
- `node <kit>/scripts/check.mjs --dir src/admin/kit --theme public/admin-v2/admin-theme.css --kit public/admin-v2/kit` and again with `--dir public/admin-v2`.
- render-check at phone, tablet, desktop and wide against a production build (`npm run build`, `PORT=4538 npm run server`), signed in
  through the local test harness `admin-kit-reviews/sprint2go-manager/harness/authproxy.mjs` (dummy data, local logins only).
- Repo tests: tsc (app and server), vite build, ui-tokens-check, check-demo-guards, i18n-check --strict pass. unit-tests: 3 fail,
  the same 3 as on main before this branch (Backups one-off rotation, two Demo company tests).
