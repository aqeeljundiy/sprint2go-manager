# Game plan: accounts, mail and workspaces

Written 15 Oct 2026 from Aqeel's questions. Each item says what is true today, what we build, and in what order.
Progress lives on the board at `/backlog`.

## 1. Mailbox status ("Not connected" while mail arrives)

**Today (fixed 15 Oct):** `Account.connected` was a flag saved by the last DNS check, and it only passed when the
sending records (SPF, DKIM) were in place. A mailbox on "Some of each" (Google keeps the domain, unknown addresses come
to us) received mail but still read "Not connected".

**Now:** one rule, `src/mailStatus.ts`, used by the sidebar, Settings and the phone screen:

| State | When | Shown |
|---|---|---|
| Working | mail arrives and SPF + DKIM pass (or the flag says so) | nothing in the sidebar, green badge in Settings |
| Receiving only | mail has arrived (or MX / routing check passed) but SPF or DKIM is missing | "Receiving only", hint: add SPF and DKIM |
| No mail arriving yet | sending records pass, nothing received, MX not pointed | hint: point MX or routing |
| Not set up | neither | hint: add the records |
| Sign in needed | Gmail / Outlook account not signed in | hint: its owner signs in |

**Next:** run the DNS check daily on the server (not only when an admin presses the button), and record the time of
the last received message per account on the server so the state doesn't depend on what the browser has loaded.

## 2. Inbox tabs (Primary, Promotions, Social, Updates, Forums)

**Today:** fixed rules in `server/mailSmart.ts` (what you taught, internal or known senders, social domains, list
headers, bulk headers plus keywords). Moving a message teaches its sender. Tabs can be switched off.

**Build:**
1. Settings, Mail & signature, **Sorting**: list of taught senders (change or remove), plus your own rules
   ("from @stripe.com goes to Updates", "subject has 'invoice' goes to Primary"). Rules run before the built-in ones.
2. A short line on each tab's empty state saying what goes there.

## 3. An "All mail" view

**Today:** no such view; `in:anywhere` search is the nearest.
**Build:** "All mail" as an inbox type next to Default, Important, Unread, Starred: every account and every tab, one
list, newest first, no grouping. Also reachable from the folder list.

## 4. One account, many workspaces (the Slack question)

**Today:** a login belongs to the person, not the company; one login can be in many workspaces. Removing you from
company A leaves your own workspace B alone. Risk: if you sign in with you@companyA.com and A closes that mailbox,
you can't receive codes or reset your password.

**Build:**
1. A **backup sign-in email** in Settings, Account (verified by code). Codes and resets can go to either.
2. A nudge when your only sign-in email is on a company domain you don't own.
3. Later: sign in with Google.

## 5. One company, several domains and brands (a group with three brands)

**Today:** a workspace has several verified domains but one name, logo and colour.

**Build: Brands inside a workspace** (preferred over one workspace per brand):
- Settings, **Brands**: name, logo, colour, signature, default sending domain.
- Mailboxes, projects, the client portal and system emails can be tagged with a brand; sending from a mailbox uses its
  brand's signature and domain.
- One team, one bill, one search. A separate workspace per brand stays possible when the brands must not see each
  other.

Same answer for one Google Workspace that holds several domains: add each domain to the sprint2go workspace, and give
each its brand.

## 6. Who can open a shared inbox

**Today:** `Account.users` already decides who opens it, and the server enforces it; admins can open every shared
inbox. The "Access" button in Settings edits the list.

**Build:**
1. Levels per person: **Read**, **Reply** (send as the inbox), **Manage** (settings and access).
2. Add a group (Sales, Support) instead of people one by one.
3. "Private inbox": hidden even from admins (HR, finance), with an audit log entry when access changes.

## 7. Signing up without an email yet

**Today:** signup sends a code to an email you already have. Domains can be hosted on our mail server once verified.
Buying a domain in the app is planned, not built.

**Build:** keep "any email or phone to start" as the personal sign-in. Onboarding step "Your email address":
"Use a domain I own" (records shown, checked live) or "Get a new domain" (buy in the app, records set for you). Then
create you@yourco.com and offer to make it a sign-in email too, keeping the first one as the backup (see 4).

## 8. Client side and owner side: one interface

**Today:** clients get `ClientApp`, a separate cut-down app.

**Build (larger):** one app for everyone; what you see depends on your role in that workspace. The workspace switcher
lists your workspaces and the ones you're a guest in ("Guest at Kopinara"). A client of yours who is also an agency
sees their own workspace and yours in the same switcher. Done in steps: the switcher first, then moving client screens
onto the shared screens one at a time.

## Order

1. Mailbox status (done), All mail view, sorting rules editor.
2. Shared inbox levels and groups.
3. Backup sign-in email.
4. Brands.
5. Domain step in onboarding (connect first, buy later).
6. One interface for guests and team.

Alongside this: four rounds of UI and UX audit, desktop and phone, each producing 15 to 20 items on `/backlog` that are
fixed before the next round. Fewer features done well beats many that break.
