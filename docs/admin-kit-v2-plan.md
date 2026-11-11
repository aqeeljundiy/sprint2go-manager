# Console v2 (aqeel-admin-kit): the plan

Built from the why review of 12 Nov 2026 (`admin-kit-reviews/sprint2go-manager.md`, verdict: tidy, start from v1).
`/admin` (v1) stays as it is, as the backup. `/admin/v2` is a new build on the kit; the old ui-gate A+B v2 is gone.

## Site character (top of `public/admin-v2/admin-theme.css`)
1. The founder plus one or two support or finance operators, at a desk; a phone for "is anything broken" and one quick ticket reply.
2. Calm, precise, friendly (white, one electric blue, rounded Plus Jakarta Sans).
3. Many small decisions every day, a few careful money tasks a month.
4. Shows text (tickets, names) and numbers (rupiah, health, counts); almost no pictures.
5. Must not look like the Continue admin, InTRIZ Studio, Continue Lab, P&P or aqeelOS backends, or the sprint2go app itself.

Look: sprint2go's own design tidied (tokens.css, the landing page, the v1 survey). Layout choices: labels nav, floating
sidebar, number cards, segmented tabs, lined tables, plain titles, ring loader.

## Sidebar (the review's proposal)
Today · Support (Tickets) · Customers (Companies, People) · Business (Money, Growth, Announcements) · System (Server, Mail, AI setup) · Team.
Phone tab bar: Today, Tickets, Companies, More.

## Owner's answers (delegated, 12 Nov)
The owner handed these decisions over ("I give you everything"). Each is the safest sensible answer; any can be changed.

| Question from the review | Answer used | Why |
|---|---|---|
| Who else uses the console, on a phone? | Built for the founder plus support and finance roles that already exist; phone = check and answer one ticket | Matches the roles in the code; nothing is lost if nobody else joins |
| "Whitelist" or "Unlimited"? | **Unlimited** everywhere; it is a view on Companies and "Make Unlimited" in a company's More menu | The word customers see in the app; one page, one word |
| "Sign in as a customer": one click? | Never one click: in More, asks for the ticket number, then a confirm naming what is logged | Riskiest action in the console |
| Which November revenue is right? | **The card: monthly revenue booked from plans today** (server `mrr`). The old chart's "Rp 118 rb" was the month's movement from its first daily snapshot, not revenue. v2 shows one figure, and the chart's current month is the same number | Revenue defined once (analytics playbook) |
| Do operator-made companies count in Growth? | Counted as before (the data cannot tell them apart without a server change); every funnel step now says what was lost, and a step with nobody before it says it was filled another way | No server change needed; nothing hidden |
| Where does the build go? | `/admin/v2`, replacing the old v2; v1 stays at `/admin` | The owner's words |
| Customer screens in scope? | Yes per the owner's 12 Nov message, but not built in this pass (see "Left for later") | Size: the customer app is the whole product |
| Phone tab bar | Today, Tickets, Companies, More | Frequency times urgency on a phone |
| GitHub description | Not changed (outside the console) | Not a console decision |
| Sidebar renames | All of the review's renames taken | See the sidebar above |

## Rules v2 adds on top of the data (display only, no server change)
- **Grace period:** a company younger than 7 days (`since`) is "Not started yet", never "At risk" (src/admin/kit/rules.ts).
- **Tickets:** sorted by when the next reply is due (target, else opened), oldest first; one word per state ("Not answered" for new).
- **Invoices:** sending asks first, naming each company with its amount and the total. Marking paid asks too.
- **Prices:** save sits under the fields, with a "these are live" warning and a confirm.
- **Maintenance mode** and owner emails ask first.

## Left for later
- Customer app and client portal `/v2/...` (the review's Part 2), including the client portal Home fix on `/v2`. Not started.
- AI keys for providers that need an address (several fields) are added from v1 for now.
- AI model prices are read-only in v2 (edit them in v1).
- Dark mode: the kit theme is light only (v1 has both).
- Company: health breakdown shown as plain numbers; "Reset data" and "Delete now" stay in v1 (only "Delete in 30 days" in v2).
