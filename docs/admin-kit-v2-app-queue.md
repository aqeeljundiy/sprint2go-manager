# Customer app and client portal v2 on aqeel-admin-kit: the queue

Branch `admin-kit-v2-app` (local only, never pushed by the builder), cut from `admin-kit-v2`. `/v2/...` is built from
scratch on aqeel-admin-kit 0.20.0; `/` (v1) stays as it is, as the backup. Same data and APIs; no server change.
Plan, reasons and the delegated answers: `docs/admin-kit-v2-app-plan.md`.

Status: `[x]` built and checked (commit), `[ ]` left, `[~]` built in v2 with its writing tool still in v1.

## Theme step
- [x] Kit installed (`public/app-v2/kit`), own theme `public/app-v2/app-theme.css` (not the console's), app icon set from sprint2go's mark with its own manifest (start and scope `/v2`), loaded by `/admin-v2/boot.js` only on `/v2` (ac15b9c)

## Team app (`/v2`)
- [x] Shell: labelled sidebar Talk / Plan / Keep, People and Settings, phone tab bar Home, Mail, Chat, Tasks (e80acf9)
- [x] Home: work first, setup last, the same on phone and desktop (e80acf9)
- [x] Tasks: one "New task", Today first, done with Undo (2b90af2)
- [x] Projects: one state per project (2b90af2)
- [~] Calendar: agenda in v2; month view and editing in v1 (2b90af2)
- [~] Mail: folders as views, read, star, archive with Undo; writing and replying in v1 (b7a4e68)
- [x] Chat: read and send in channels and DMs (b7a4e68)
- [~] Meetings (was "Meet"): notes, decisions, actions; sending the notetaker in v1 (never a real bot from v2) (b7a4e68)
- [~] Notes: opens on the latest note; the editor in v1 (6ae1d47)
- [~] Drive: list, views, star; upload in v1 (6ae1d47)
- [~] Tables: list with row counts; the grid in v1 (6ae1d47)
- [~] Vault: one clear way in; unlocking in v1 (encrypted on the device) (6ae1d47)
- [x] People: people and teams in one place (Teams is no longer an app) (6ae1d47)
- [~] Settings: 30 sections regrouped in 4 groups, one order on phone and desktop, email in one group, search; each form opens v1's (6ae1d47)

## Client portal (`/v2` for guests)
- [x] Home readable at every width (auto-fill grid, not v1's unspanned 12 columns); Needs you first (65d6c0b)
- [x] Work (Needs your approval first; approve, ask for changes, comment), Requests (new request, comment), Messages (read, send), Files, Meetings: one name each, own addresses, same on phone and desktop (65d6c0b)

## Left (next batches)
- [ ] Settings forms on the kit, group by group (You, Email, Company, Plan and data). Billing, domains and AI keys last, with confirms.
- [ ] Mail composer and reply on the kit (must keep v1's Undo-send window and never send from a test run).
- [ ] Notes editor on `<ak-editor>`; Drive upload on `<ak-upload>`; month and week calendar; the table grid.
- [ ] Brain dump (asks AI), Ask AI panel, notifications panel, the guest's own account page (photo, password, language).
- [ ] Sign-in at `/v2/signin` (v1's sign-in shows today; its two underlined links are a review finding).
- [ ] Dark mode (kit gap, kit-requests.md).

## Checks
- `node <kit>/scripts/check.mjs --dir src/app-v2 --theme public/app-v2/app-theme.css --kit public/app-v2/kit`, and with `--dir public/app-v2`.
- `compare-themes.mjs --theme public/app-v2/app-theme.css` (and `--against public/admin-v2/admin-theme.css`): ok.
- render-check at phone, tablet, desktop and wide against a production build (`npm run build`, `PORT=4570 npm run server`
  in this worktree, with a copy of the local dummy database in `data/`), signed in with local logins only:
  team `sophie@demo.sprint2go.com` (an admin; emma has no mailbox), guest `laura@kopinara.example` (password `sprint2go-local-demo`, local database only).
  Reports and screenshots: `admin-kit-reviews/sprint2go-manager/app-v2/`.
- Repo tests: tsc, vite build, ui-tokens-check, check-demo-guards, i18n-check --strict (Indonesian: a938260).

## Last run (12 Nov, after rebasing onto origin/main 6b7e0e2)
- check.mjs: passed (src/app-v2, public/app-v2). compare-themes: ok against the console, Continue and InTRIZ.
- render-check: team app 13 pages x 4 widths passed; client portal 6 pages x 4 widths passed (fixes: 67b6b32, 9ae2619).
- tsc, vite build, ui-tokens-check, check-demo-guards, i18n-check --strict: pass. unit-tests: the same 3 fail as before this branch (Backups one-off rotation, two Demo company tests).
