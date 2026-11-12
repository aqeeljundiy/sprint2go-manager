# v1 checklist: what /v2 must keep, and what it adds

13 Nov 2026. The owner, after the kit-built /v2: "The first version has my vibe and identity, but the UI is just not clean
enough and the features are just not on the level I want, and the UI consistency." So /v2 is now **v1's own screens and
components** (same code, same look) with a layer on top, and nothing v1 has may go missing.

How /v2 is built (one switch, no copies):
- `src/surface.ts` says which surface a page is (`teamV2` for /v2, `adminV2` for /admin/v2) and puts `html.s2v2` on v2.
- `/v2` renders v1's `App` and `ClientApp` (src/Root.tsx); the app's routes live under /v2 (`routeBase`, src/tryOut.ts).
- `src/v2.css`: the tidy scale and the motion, all under `html.s2v2`. Words and small behaviour changes check `teamV2`.
- v1 at `/` and `/admin` renders exactly as before (checked by screenshot, `v1-first/check-v1-after-1440.png`).

Evidence: `admin-kit-reviews/sprint2go-manager/v1-first/` (`v1-*` = v1, `kitv2-*` = the kit /v2 it replaces, `new-*` =
the new /v2) and the older full set in `admin-kit-reviews/sprint2go-manager/` (`app-v1-*`, `admin-v1-*`).

Columns: **Kept** = present at /v2 (v1's code). **v2** = the v2 layer (tidy + motion + fixes) is done for it. Where = the
code it lives in.

Build order (owner's rule, 13 Nov): one page first, approved, then the rest. **Page 1: team app Home (done, waiting for
the owner's yes).** Then Mail, Tasks, Calendar, guest portal Home, then the operator console (/admin/v2, still the kit
build until then).

---

## 1. Team app shell (every screen)

| Kept | v2 | What (v1) | Evidence | Where |
|---|---|---|---|---|
| [x] | [x] | Slim icon rail on the left, company logo at the top (the orange mark in the demo) | v1-home-1440 | components/AppRail.tsx |
| [x] | [x] | Rail icons, no labels, active app on a raised white tile | v1-home-1440 | AppRail.tsx, apps.css `.rail-app.on` |
| [x] | [x] | Badges on rail icons (Mail 1, Tasks 1); v2: they pop in (zoomIn) | v1-home-1440 | apps.css `.rail-icon i`; v2.css |
| [x] | [x] | Press feedback on rail icons and tools (v2: 0.92 press) | - | v2.css |
| [x] | [ ] | Separator between pinned and other apps; drag to reorder apps; hidden apps under "+" | app-v1-home-1440 | AppRail.tsx |
| [x] | [ ] | Rail foot: Search (⌘K), Ask AI (sparkle, ⌘J), Notifications with dot, your avatar and account menu | v1-home-1440 | AppRail.tsx, AccountMenu.tsx |
| [x] | [ ] | ⌘K command palette: projects, tasks, people, files, "ask anything" | - | CommandPalette.tsx |
| [x] | [ ] | Ask AI docked panel (shrinks to a pill) | - | Assistant.tsx |
| [x] | [ ] | Each app's own sidebar with a big create button in the company colour, resizable, collapsible | v1-mail-1440 | Sidebar.tsx and app sidebars |
| [x] | [ ] | Phones: launcher with the greeting, Needs you (3 + See all), Apps grid with coloured tiles and badges, Edit, the + button | v1-home-375 | mobile/Launcher.tsx |
| [x] | [x] | Phones: launcher tiles answer a tap (v2: same 0.94 as long-press) | v1-home-375 | v2.css |
| [x] | [ ] | Phones: each app's own bottom bar (icons), top bar with title menu | v1-mail-375, v1-calendar-375 | mobile/ |
| [x] | [ ] | Light and dark, English and Indonesian | - | settings, i18n |
| [x] | [x] | Digits in Google Sans Flex, text in Plus Jakarta Sans | new-home-1440 | boot.js, v2.css `--font` |

## 2. Team app Home (page 1, done)

### Desktop (v1-home-1440 next to new-home-1440)
| Kept | v2 | What (v1) | Where |
|---|---|---|---|
| [x] | [x] | The date line ("Thursday 12 November") | HomeView.tsx `.home-date` |
| [x] | [x] | Big greeting by time of day: Good morning / afternoon / evening / Working late, {name}. | HomeView.tsx `greeting` |
| [x] | [x] | v2 adds: one line under it, what needs you and what's next ("4 things need you. Next up: …"), the phone's words | HomeView.tsx `.home-sum` |
| [x] | [x] | Customise (top right), level with the greeting | HomeView.tsx, v2.css |
| [x] | [ ] | Customise mode: start from a template (Founder, Team lead, Designer, Account manager, Finance), add a card, Reset, drag cards, resize by the right edge, width ¼ to Full, height Fit/Short/Tall | HomeView.tsx (v1 behaviour, untouched) |
| [x] | [x] | Jump-to-anything search bar with ⌘K; v2: rises in, hover glow, press tint | `.home-search`, v2.css |
| [x] | [x] | News and warnings from sprint2go, dismissible (slides out) | `newsCards` |
| [x] | [x] | Demo company "Try this" list on top (demo only) | `p.top` |
| [x] | [x] | Finish setting up strip (admins), each row with Set up | `setupCard` |
| [x] | [x] | Meeting strip (meeting about to start, send the notetaker, bot joins on/off) and live huddles with Join | home/HomeParts.tsx |
| [x] | [x] | Needs you: icon per kind (review tick, late clock, mail), title and why, one action (Approve in company colour, Remind, Reply, Start, Assign, Reschedule); swipe on phones; rows fold away when done | HomeParts.tsx `NeedsList` |
| [x] | [x] | "You're clear for now" with the next thing when nothing needs you | HomeView.tsx |
| [x] | [x] | Today block: tasks due today (round tick, project dot) and meetings later today | HomeParts.tsx `TodayBlock` |
| [x] | [x] | Cards grid (12 columns): My tasks (round tick, title, project chip, due chip, All tasks →) | `cards.mytasks` |
| [x] | [x] | Workload: coloured avatars, first name or "You", bar per person (warn colour when late), "4 open, 4 this week"; row opens their tasks, avatar opens their card | `cards.workload` |
| [x] | [x] | Meetings card with Calendar →; v2 name "Meetings today" (v1 had two "Today"s side by side), friendlier empty line | `cards.today`, i18n/id/home.ts |
| [x] | [x] | Other cards when chosen: Briefing, Brain dump, Company numbers, Projects at risk, Teams, Waiting on you, Team queue (assign), Briefs (progress bar, x/y), Unread mail, For you (swipe Seen), From meetings, Projects tiles, Wins this week (kudos 🙌) | `cards.*` |

### Phone (v1-homepage-375 next to new-homepage-375; launcher in v1-home-375 / new-home-375)
| Kept | v2 | What (v1) | Where |
|---|---|---|---|
| [x] | [x] | Greeting in the top bar (name moves to the line below when it doesn't fit), date and "4 things need you." | `GreetingTitle` |
| [x] | [x] | Launcher icon (grid) and search in the top bar | TopBar |
| [x] | [x] | Needs you list with actions as coloured words (Approve, Remind, Reply) | NeedsList |
| [x] | [x] | Today with round tick (v2: a true circle; v1 drew it 22 by 24) | v2.css |
| [x] | [x] | Updates (3, then All notifications), Finish setting up row (sheet), Try the demo row (sheet), All notifications row | HomeView.tsx phone branch |
| [x] | [x] | The + button: New (Brain dump first when AI is on) | `useCreateAction` |

### Motion on Home (v2)
- [x] Greeting, date and summary rise in (viewIn), the search bar 100 ms later.
- [x] Needs you and Today, then the cards, settle in a beat apart (cardIn, 60 to 240 ms).
- [x] Rows inside Needs you, Today and the cards come in one after another (40 ms steps).
- [x] Workload bars fill to their value on open and move when numbers change (width transition, `@starting-style`).
- [x] Hover on a card: its edge and shadow lift (no transform: cards hold pickers that open fixed).
- [x] Buttons answer a press (Approve, Remind, Reply, Customise: 0.96); "All tasks →" arrow nudges on hover.
- [x] Reduced motion: everything appears with a 150 ms fade, no movement.
- [x] Kept from v1: rows that fold away when done (Needs you), news cards sliding out, SmoothHeight on Customise.

### Tidy on Home (rendered survey, desktop 1440, `domsurvey.mjs`)
| | v1 | new /v2 |
|---|---|---|
| Text sizes | 7 (12, 12.5, 13, 14, 15, 36 and the avatar's 9.88) | 6 (12, 13, 14, 15, 36, avatar) |
| Weights | 5 (400, 500, 600, 650, 700) | 3 (400, 600, 700) |
| Corner sizes | 9 (4, 6, 8, 10, 12, 16, 50%, 999, 9999) | 4 kinds: 10, 16, pill, round |
| Card inner edge | 16 px (Needs you) vs 18 px (cards) | 16 px everywhere |
| Card headings | 15/700 and 14/650 | 15/700 |
| Task ticks | square (cards) and round (Today) | round everywhere |
| Chips | due 14 px / 20 high, project 12 px / 17 high | both 12/600, 22 high |
| Long task title | cut mid-letter by the chips ("Nii") | ends in "…"; on narrow cards chips move under the title |
| Fonts | Plus Jakarta Sans | Jakarta for text, Google Sans Flex for digits |

## 3. Team app, the other screens (kept at /v2 as v1; v2 layer next)

| Kept | v2 | Screen: what v1 has | Evidence |
|---|---|---|---|
| [x] | [ ] | **Mail**: Compose (C), All inboxes switcher with unread, folders with icons and counts (Inbox, Starred, Sent, Drafts, Archive, All mail, Spam, Trash, Snoozed, Scheduled, Assigned to me, More), Labels with colours and nesting, search with / and filters, chips (Unread, Needs reply, Assigned to me, Attachments), category tabs (Primary, Promotions, Social, Updates) with sliding highlight, rows with avatar, unread dot, assignee, comment count, labels, Updated time and refresh; phone: Inbox title menu, search pill, star, Compose button, bottom bar | v1-mail-1440, v1-mail-375 |
| [x] | [ ] | **Chat**: channels and DMs, sections, huddles, threads, materials, copy link | app-v1-chat-* |
| [x] | [ ] | **Tasks**: Add task, Brain dump, Today/Upcoming/My tasks/More views, Teams with colours and counts, list/board switch, filters, New task (N), search, Plan my day, rows with ring, due, team, project, assignee; Mark done follows the task's own stages (setTaskStatus) | v1-tasks-1440, v1-tasks-375 |
| [x] | [ ] | **Projects**: views, cards with status, people, pulse | app-v1-projects-* |
| [x] | [ ] | **Teams**: team cards, join | app-v1-teams-* |
| [x] | [ ] | **Tables**: grid, views, automations | app-v1-tables-* |
| [x] | [ ] | **Calendar**: schedule with week groups, month, day, holidays, ring tasks, events with colour bar, plan your tasks drag, + | v1-calendar-1440, v1-calendar-375 |
| [x] | [ ] | **Notes**, **Drive**, **Meet** (notetaker), **Vault**, **Settings** (30+ sections, search) | app-v1-* |

## 4. Guest portal (kept at /v2 as v1; v2 layer next)

| Kept | v2 | What v1 has | Evidence |
|---|---|---|---|
| [x] | [ ] | Rail with labels (Home, Requests, Messages, Work with badge, Files, Meetings), bell, avatar | v1-portal-home-1440 |
| [x] | [ ] | Big greeting with the date; six cards two per row (Needs you, Your requests + New request, Work in progress with progress, Latest meeting with summary, Recent files, From the team); "Made with sprint2go" | v1-portal-home-1440 |
| [x] | [ ] | Phone: one column, bottom bar | v1-portal-home-375 |
| [ ] | [ ] | To tidy: the Work in progress row starts left of the card's edge; card bodies at three different inner edges | v1-portal-home-1440 |

## 5. Operator console /admin/v2 (still the kit build; rebuilt from v1 after Home is approved)

| Kept | v2 | What v1 has | Evidence |
|---|---|---|---|
| [ ] | [ ] | sprint2go wordmark + Operator chip; Search everything ⌘K; menu groups with an icon on every item (Today, Tickets with count, Companies, People, Whitelist→"Unlimited", Money, AI, Growth, Product, Platform, Team & settings); resizable menu; user card at the bottom (theme, language, back to app, sign out) | admin-v1-today-1440 |
| [ ] | [ ] | Today: Good morning greeting, "N things need you", 4 stat tiles, red "Broken right now", ticket rows with icons, At risk rows with trend icons (v2: 7-day grace), overdue invoices (v2: reminder asks first) | v1-admin-today-*, admin-v1-today-* |
| [ ] | [ ] | Tickets, Ticket (Sign in as… behind a reason and confirm), Companies (health, At risk grace), Company, People (column truncation fix), Person, Money (one revenue figure; price confirm says paying companies pay the new price), AI, Growth, Product, Platform, Team | v1-admin-*, admin-v1-* |

## 6. Goals on top

### (1) Clean and consistent
Code survey (kit `survey.mjs`, `src` without the kit builds), the long tail to fold, page by page, into v1's own scale
(tokens.css: type 24/17/15/13/12 + 36 greeting, weights 400/600/700, radii 10/16/pill/round, 4/8 spacing):
- Before: 62 text sizes, 12 weights, 42 corner sizes, 19 control heights, 12 page widths, 51 durations, 114 colours.
- Home done (numbers above). Every next page gets the same rendered survey before and after.

### (2) Feature level (from the why review, in v1's style)
- [x] Home: desktop says what needs you under the greeting (the phone already did).
- [ ] Tasks: one name for create ("New task"); Notes opens the latest note; Vault hides the faded "Add a login"; Meet called Meetings; labels on rail hover.
- [ ] Portal: same places and names on phone and desktop, its own address per place.
- [ ] Console: tickets sorted by reply due, fewer view tabs, invoice Send asks first with count and total, Change plan as the company's main action, Sign in as… in More.

### (3) Motion
- [x] Home (above). Next pages: page and panel transitions, rows entering, number count-up on the console's stat tiles, skeletons while loading.
