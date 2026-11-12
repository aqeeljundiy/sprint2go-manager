# Customer app and client portal v2 (aqeel-admin-kit): the plan

Built 12 Nov 2026 from the why review's Part 2 (`admin-kit-reviews/sprint2go-manager.md`, verdict: tidy, with five
rearranges and the client portal fix urgent). The owner: "do everything from scratch ... on a /v2 ... So we still have a
backup ... I give you everything and all the permissions." Every decision below was delegated; each has its reason and
can be changed.

`/` (v1, the app) and `/admin`, `/admin/v2` are untouched. `/v2/...` is the new build. Same data and APIs: every v2 page
reads and writes the same synced collections as v1 (`src/store.ts`); the client portal uses v1's `clientActions` (the
server checks every change again). No server change, no schema change.

## Site character (top of `public/app-v2/app-theme.css`)
1. Small agencies and companies (owner and a team of 3 to 30) all day at a desk, on the phone between meetings; their clients (guests) a few times a week.
2. Bright, friendly, quick: one white page, the company's own colour as the only accent, Plus Jakarta Sans.
3. Hundreds of small actions a day (reply, tick off, file, approve), one at a time.
4. Text and people first (mail, chat, tasks, notes), some files, few numbers.
5. Must not look like the operator console, Continue, InTRIZ, Continue Lab, P&P or aqeelOS.

## Decisions (delegated, 12 Nov)

| Question | Answer used | Why |
|---|---|---|
| Share the console's theme or a variant? | **Its own theme file**, from the same source (`src/tokens.css`), not copied | Different people (customers vs operators), different route, own icon; the console's theme says it must not look like the app. compare-themes: ok against the console, Continue and InTRIZ |
| Accent colour | The company's colour (`--brand-ink`, set from Settings), sprint2go blue before a company is open | v1 does this (CLAUDE.md: company colour on create, primary, selected, links) |
| Layout choices | labels nav (Talk / Plan / Keep headings), flush sidebar, stat cards, underline tabs, open tables, dots loader; 12px cards, 6px controls, hairline shadow | Each from the character; at least two differ from every kept kit site. Controls are crisper than v1's 10px: the only change that kept both the console and InTRIZ apart (compare-themes) |
| Where is v2? | `/v2/...` for team members; guests get the portal at the same `/v2` addresses | The owner's words; one address per person, as v1 does at `/` |
| Navigation | Home · Talk (Mail, Chat, Meetings) · Plan (Tasks, Projects, Calendar) · Keep (Notes, Drive, Tables, Vault) · People · Settings | The review's proposal: labelled, grouped; 11 apps |
| "Meet" or "Meetings"? | **Meetings** everywhere | The page already said Meetings |
| Teams | Folded into **People** (a Teams view); Settings links there | Teams was an app of two cards and also lived in Chat, Tasks and Settings |
| "Unlimited" | The word customers see; v2 never says Whitelist | Matches the console's choice |
| Phone tab bar (team) | Home, Mail, Chat, Tasks, More | Frequency x urgency on a phone: mail and chat answer people waiting, tasks get ticked off between meetings |
| Portal places | Home, Work, Messages, Requests, Files, Meetings: the same names and order on phone and desktop | v1 said Work on desktop and Approvals on phones, and lost Meetings on phones |
| Portal phone tab bar | Home, Work, Messages, Requests, More | Work holds "Needs your approval" first; Files and Meetings are read now and then |
| Portal addresses | Each place has its own (`/v2/work`, `/v2/requests?open=<id>`) | v1's links all opened Home; Back and shared links now work |
| Settings | 30 sections in 4 groups (You, Email, Company, Plan and data), one list in one order on phone and desktop, search across every option; Developer last | Email was 7 sections in 2 groups; phone and desktop orders differed |
| Settings forms | Each row opens v1's form (`/settings/<id>`) for now | 30 forms (domains, DNS, billing, AI keys) are the riskiest to rebuild; the grouping is the fix the review asked for. Rebuilding them is the next batch |
| Writing tools | Mail compose and reply, the notes editor, uploads, the month calendar, the table grid, sending the notetaker and the Vault open v1's screen | v2 never sends an email, uploads to storage, unlocks encrypted logins or calls a meeting bot by itself; those screens are big and already reviewed "keep" |
| Brain dump | Not in v2 yet | It asks AI |
| Dark mode | Light only | The kit theme is light only (kit-requests.md) |
| App icon | Its own set from sprint2go's drawn mark (make-icons.mjs), manifest name "sprint2go", start and scope `/v2` | A must on every kit surface; the console has its own ("Operators") |

## What v2 does on each screen
- **Home:** three figures that open their rows; Needs you (late and due tasks, guest requests, asked-for changes), Today (calendar and meetings), Unread mail; setup last.
- **Mail:** folders as views (Inbox, Unread, Assigned to me, Starred, Archive) and one search; read in a side panel; star, archive (with Undo), mark read in bulk.
- **Chat:** channels and DMs, read and send in the side panel.
- **Meetings:** notes, decisions and actions; Upcoming as a view; Project as a column (v1 called them folders).
- **Tasks:** Today, Upcoming, All open, Done; one "New task"; done with Undo; bulk done.
- **Projects:** Active, Leads, Paused and ended; one state per project (a lead is "Lead", never also "On track").
- **Calendar:** agenda (Today, Next 7 days, Later, Past) with a calendar filter.
- **Notes:** opens on the latest note (v1 opened on "No note open").
- **Drive, Tables:** lists with search and views; star in Drive.
- **Vault:** one clear way in; no faded "Add a login".
- **People:** people and teams; join a team or ask to.
- **Client portal Home:** six cards that are readable at every width (the bug below), Needs you first.

## The v1 portal Home bug (cause)
`ClientApp.tsx` renders the cards in `<div className="home-grid cards">`. `round2.css` makes `.home-grid.cards` a
12-column grid for the team Home, whose cards say how many columns to span (`w3`, `w4`, `w8` classes and an inline
`grid-column`). The portal's cards have only `side-card home-card` (and `wide` for one), so each takes 1 of 12 columns:
37 to 93px. Under 767px every card is forced to full width, which is why phones were fine. **Tiny safe fix for v1:**
drop `cards` from that one `className` (line 403: `home-grid cards` to `home-grid`); the plain `.home-grid` is a
two-column grid and `.wide` spans both. Not applied: v1 is the backup.
