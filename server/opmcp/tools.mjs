// sprint2go operator console: the jobs an agent can do here, from the why review (admin-kit-reviews/sprint2go-manager.md):
// Today (what's broken, which tickets and money wait), Tickets (next to answer, take it, close the done ones),
// Companies and People (look one up, who pays, who's at risk, whose trial ends), Money, Server errors, Audit log.
// Reads first. Every change has optIn: true and an undo; nothing deletes, and nothing reaches a customer:
// replying to a ticket and sending invoices stay with a person (an agent can leave an internal note instead).
// Each tool reads the same data as the console's API (server/admin.ts), through the same functions.
import { z } from './ak-mcp.mjs';
import * as db from '../db.ts';
import * as platform from '../platform.ts';
import * as support from '../support.ts';
import * as billing from '../billing.ts';
import * as aiplan from '../aiplan.ts';
import { companyRows } from '../admin.ts';

const DAY = 864e5;
const now = () => new Date().toISOString();
const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(); };
const emailOf = (u) => String(u?.email ?? '').toLowerCase();
const has = (q, ...parts) => !q || parts.join(' ').toLowerCase().includes(String(q).toLowerCase());
// What the console's companyRows needs: AI spend in rupiah on the company's own keys (index.ts spendRp).
const ctx = { spendRp: (rows) => aiplan.costRp(rows.filter((r) => r.provider !== 'included')) };
const companies = () => companyRows(ctx);
const wsNames = () => new Map(db.allDocs('workspaces').map((w) => [w.id, w.name]));
const limitIn = (max = 200) => z.number().int().min(1).max(max).optional();

const STATUSES = ['new', 'open', 'waiting', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const isOpen = (t) => t.status === 'new' || t.status === 'open';
const breaching = (t) => !t.firstReplyAt && !!t.dueAt && t.dueAt < now() && isOpen(t);
const supportOps = () => platform.operators().filter((o) => !o.disabled && platform.permsOf(o.role).includes('support')).map((o) => o.email);

// What an agent gets about a ticket, a company, a person: enough for the job, no sign-in details (devices, addresses, codes).
const ticketCard = (t, names) => ({ id: t.id, number: t.number, subject: t.subject, status: t.status, priority: t.priority, channel: t.channel, requester: t.requester.email, requesterName: t.requester.name, company: t.workspaceId ? names.get(t.workspaceId) ?? null : null, companyId: t.workspaceId, assignee: t.assignee, tags: t.tags, createdAt: t.createdAt, updatedAt: t.updatedAt, replyDueAt: t.dueAt, firstReplyAt: t.firstReplyAt, pastReplyTarget: breaching(t) || undefined });
const companyCard = (c) => ({ id: c.id, name: c.name, state: c.state, plan: c.plan ? { tier: c.plan.tier, cycle: c.plan.cycle, trialEnds: c.plan.trialEnds, paused: c.plan.paused || undefined, unlimited: c.plan.unlimited || undefined } : null, monthlyRp: c.mrr, afterTrialRp: c.after ?? undefined, people: c.people, activeThisMonth: c.active, guests: c.guests, owner: c.owner ? { name: c.owner.name, email: c.owner.email } : null, lastActive: c.lastActive, since: c.since, health: { score: c.health.score, label: c.health.label }, openTickets: c.openTickets, overdueInvoices: c.overdue, suspended: c.suspended ? true : undefined, internal: c.internal || undefined, domains: c.domains });
const invoiceCard = (i, names) => ({ id: i.id, number: i.number, company: names.get(i.workspaceId) ?? '(deleted)', companyId: i.workspaceId, period: i.period, totalRp: i.total, status: i.status, overdue: i.status === 'sent' && i.dueAt < now() ? true : undefined, dueAt: i.dueAt, sentAt: i.sentAt, paidAt: i.paidAt, method: i.method });
const findTicket = (id) => {
  const t = support.ticket(String(id).replace(/^#/, ''));
  if (!t || t.mergedInto) throw new Error(t ? `That ticket was merged into another one (${t.mergedInto}).` : 'No ticket with that id or number. Use list_tickets first.');
  return t;
};

const COMPANY_VIEWS = {
  customers: (c) => !c.internal && !c.suspended && c.state !== 'unlimited',
  paying: (c) => c.state === 'paying',
  trial: (c) => c.state === 'trial',
  trial_ending: (c) => c.state === 'trial' && !!c.plan?.trialEnds && c.plan.trialEnds < new Date(Date.now() + 7 * DAY).toISOString(),
  at_risk: (c) => c.health.label === 'risk' && !c.suspended && (c.state === 'paying' || c.state === 'trial'),
  unlimited: (c) => c.state === 'unlimited',
  suspended: (c) => !!c.suspended,
  all: () => true,
};
const TICKET_VIEWS = {
  open: isOpen,
  past_target: breaching,
  nobody_on_it: (t) => isOpen(t) && !t.assignee,
  waiting: (t) => t.status === 'waiting',
  resolved: (t) => t.status === 'resolved' || t.status === 'closed',
  all: () => true,
};

export const tools = [
  {
    name: 'today_summary',
    title: 'What needs attention today',
    kind: 'read',
    description: 'The Today page: tickets past their reply target, open tickets nobody is on, overdue invoices, trials ending within 7 days, paying or trial companies at risk, open deletion requests, and the headline numbers (monthly revenue, companies, open tickets).',
    input: {},
    async run() {
      const rows = companies(), real = rows.filter((c) => !c.internal), names = wsNames();
      const tix = support.tickets().filter((t) => !t.mergedInto);
      const open = tix.filter(isOpen), late = open.filter(breaching);
      const stats = support.stats(new Date(Date.now() - 30 * DAY).toISOString());
      return {
        numbers: { monthlyRevenueRp: real.reduce((n, c) => n + c.mrr, 0), companies: real.filter((c) => !c.suspended && c.state !== 'unlimited').length, unlimited: real.filter((c) => c.state === 'unlimited').length, newThisMonth: real.filter((c) => c.since && c.since >= monthStart()).length, openTickets: open.length, medianFirstReplyMinutes30d: stats.medianFirstReplyMin, satisfaction30d: stats.satisfaction },
        pastReplyTarget: late.map((t) => ticketCard(t, names)),
        nobodyOnIt: open.filter((t) => !t.assignee && !late.includes(t)).map((t) => ticketCard(t, names)),
        overdueInvoices: platform.overdueInvoices().map((i) => invoiceCard(i, names)),
        trialsEnding: real.filter(COMPANY_VIEWS.trial_ending).map(companyCard),
        atRisk: real.filter(COMPANY_VIEWS.at_risk).map(companyCard),
        deletionRequests: platform.settings().dataRequests.filter((r) => !r.done && !r.cancelled).map((r) => ({ ...r, company: names.get(r.workspaceId) ?? null })),
      };
    },
  },
  {
    name: 'list_tickets',
    title: 'List support tickets',
    kind: 'read',
    description: 'Support tickets. Views: open (default: new or open), past_target (no first reply and past the reply target), nobody_on_it, waiting (on the customer), resolved, all. Sorted by reply due, oldest first, so the most urgent comes first. Filter by assignee email or any text (subject, requester, company, #number).',
    input: { view: z.enum(Object.keys(TICKET_VIEWS)).optional(), assignee: z.string().optional(), q: z.string().optional(), limit: limitIn() },
    async run({ view = 'open', assignee, q, limit = 50 }) {
      const names = wsNames();
      const rows = support.tickets().filter((t) => !t.mergedInto && TICKET_VIEWS[view](t) && (!assignee || t.assignee === assignee.toLowerCase()) && has(q, t.subject, t.requester.email, t.requester.name, `#${t.number}`, names.get(t.workspaceId)))
        .sort((a, b) => (a.dueAt ?? a.createdAt).localeCompare(b.dueAt ?? b.createdAt));
      return { count: rows.length, tickets: rows.slice(0, limit).map((t) => ticketCard(t, names)), operatorsWhoCanTakeTickets: supportOps() };
    },
  },
  {
    name: 'get_ticket',
    title: 'Read one ticket',
    kind: 'read',
    description: 'One ticket in full: the conversation (customer messages, replies, internal notes marked internal), the company (plan, money, health) and the person, and their other tickets. Takes the ticket id or its number.',
    input: { id: z.string() },
    async run({ id }) {
      const t = findTicket(id), names = wsNames();
      const c = t.workspaceId ? companies().find((x) => x.id === t.workspaceId) : null;
      const user = t.requester.userId ? db.getDoc('users', t.requester.userId) : db.allDocs('users').find((u) => emailOf(u) === t.requester.email);
      return {
        ticket: { ...ticketCard(t, names), rating: t.rating, ratingNote: t.ratingNote },
        messages: support.messagesForOperators(t, db.fileInfo).map((m) => ({ at: m.at, from: m.kind, author: m.authorName || m.author, internal: m.internal || undefined, body: m.body, attachments: m.attachments?.length ? m.attachments.map((a) => a.name) : undefined })),
        company: c ? companyCard(c) : null,
        person: user ? { id: user.id, name: user.name, email: user.email, lastSeen: db.lastSeen().get(user.id) ?? null } : null,
        otherTickets: support.ticketsOfUser(t.requester.userId ?? '', t.requester.email).filter((x) => x.id !== t.id).map((x) => ({ id: x.id, number: x.number, subject: x.subject, status: x.status, updatedAt: x.updatedAt })),
      };
    },
  },
  {
    name: 'list_companies',
    title: 'List companies',
    kind: 'read',
    description: 'Customer companies with plan, state (free, trial, paying, comp, paused, unlimited, suspended), monthly revenue in rupiah, people, last active, health (below 40 = at risk), open tickets and overdue invoices. Views: customers (default), paying, trial, trial_ending (within 7 days), at_risk, unlimited, suspended, all. Filter by name, domain or owner email.',
    input: { view: z.enum(Object.keys(COMPANY_VIEWS)).optional(), q: z.string().optional(), limit: limitIn(500) },
    async run({ view = 'customers', q, limit = 50 }) {
      const rows = companies().filter((c) => COMPANY_VIEWS[view](c) && has(q, c.name, c.id, ...(c.domains ?? []), c.owner?.email, c.owner?.name)).sort((a, b) => b.mrr - a.mrr || (b.lastActive ?? '').localeCompare(a.lastActive ?? ''));
      return { count: rows.length, companies: rows.slice(0, limit).map(companyCard) };
    },
  },
  {
    name: 'get_company',
    title: 'Read one company',
    kind: 'read',
    description: 'One company: plan and money, health with its parts, team members (name, email, role, last seen), the team\'s internal notes, open tickets, invoices and the recent timeline (what they and operators did).',
    input: { id: z.string() },
    async run({ id }) {
      const ws = db.getDoc('workspaces', id);
      const c = ws && companies().find((x) => x.id === id);
      if (!c) throw new Error('No company with that id. Use list_companies or search first.');
      const users = db.allDocs('users'), seen = db.lastSeen(), names = wsNames();
      return {
        company: { ...companyCard(c), health: { score: c.health.score, label: c.health.label, parts: c.health.parts.map((p) => ({ part: p.key, score: p.score, max: p.max })) }, industry: c.industry },
        members: (ws.members ?? []).map((m) => { const u = users.find((x) => x.id === m.userId); return u && !u.deletedAt ? { id: u.id, name: u.name, email: u.email, role: m.role, lastSeen: seen.get(u.id) ?? null, suspended: u.suspended ? true : undefined } : null; }).filter(Boolean),
        notes: platform.notesOf(id),
        openTickets: support.ticketsOfWorkspace(id).filter((t) => !t.mergedInto && t.status !== 'resolved' && t.status !== 'closed').map((t) => ticketCard(t, names)),
        invoices: platform.invoices(id).slice(0, 24).map((i) => invoiceCard(i, names)),
        timeline: [
          ...platform.eventsOf(id, 60).map((e) => ({ at: e.at, kind: 'company', what: e.type, detail: e.detail })),
          ...db.auditList(60, id).map((a) => ({ at: a.at, kind: 'operator', what: a.action, detail: a.detail, by: a.operator })),
        ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 60),
      };
    },
  },
  {
    name: 'search',
    title: 'Search companies, people, tickets, invoices',
    kind: 'read',
    description: 'One search over companies (name, domain), people (name, email), tickets (subject, requester, #number) and invoice numbers, like the console\'s search box. Returns up to 40 hits with their ids.',
    input: { q: z.string().min(2) },
    async run({ q }) {
      const out = [];
      for (const w of db.allDocs('workspaces')) if (has(q, w.name, ...(w.domains ?? []), w.id)) out.push({ kind: 'company', id: w.id, title: w.name });
      for (const u of db.allDocs('users')) if (!u.deletedAt && has(q, u.name, u.email)) out.push({ kind: 'person', id: u.id, title: u.name, email: u.email });
      for (const t of support.tickets()) if (!t.mergedInto && has(q, t.subject, t.requester.email, t.requester.name, `#${t.number}`)) out.push({ kind: 'ticket', id: t.id, title: `#${t.number} ${t.subject}`, status: t.status });
      for (const i of platform.invoices()) if (has(q, i.number)) out.push({ kind: 'invoice', id: i.id, title: i.number, status: i.status, totalRp: i.total });
      return { count: out.length, results: out.slice(0, 40) };
    },
  },
  {
    name: 'list_people',
    title: 'List people',
    kind: 'read',
    description: 'People with an account: companies they belong to (and their role there), whether they ever signed in, last seen, whether they are an operator or use a throwaway email domain. Newest activity first. Filter by name or email.',
    input: { q: z.string().optional(), limit: limitIn(500) },
    async run({ q, limit = 50 }) {
      const seen = db.lastSeen(), wss = db.allDocs('workspaces');
      const ops = new Map(platform.operators().filter((o) => !o.disabled).map((o) => [o.email, o.role]));
      const rows = db.allDocs('users').filter((u) => !u.deletedAt && has(q, u.name, u.email)).sort((a, b) => (seen.get(b.id) ?? '').localeCompare(seen.get(a.id) ?? ''));
      return {
        count: rows.length,
        people: rows.slice(0, limit).map((u) => ({ id: u.id, name: u.name, email: u.email, companies: wss.filter((w) => (w.members ?? []).some((m) => m.userId === u.id)).map((w) => ({ id: w.id, name: w.name, role: w.members.find((m) => m.userId === u.id).role })), guest: u.clientOf ? true : undefined, lastSeen: seen.get(u.id) ?? null, everSignedIn: db.hasLogin(u.id), operator: ops.get(emailOf(u)) ?? undefined, throwawayEmail: platform.isDisposable(emailOf(u)) || undefined, suspended: u.suspended ? true : undefined })),
      };
    },
  },
  {
    name: 'get_person',
    title: 'Read one person',
    kind: 'read',
    description: 'One person: companies and roles, trial history, two-step sign-in on or off, how many devices are signed in, last seen, and their support tickets.',
    input: { id: z.string() },
    async run({ id }) {
      const u = db.getDoc('users', id);
      if (!u) throw new Error('No person with that id. Use list_people or search first.');
      const wss = db.allDocs('workspaces');
      const twostep = await import('../twostep.ts');
      return {
        id: u.id, name: u.name, email: u.email, title: u.title, deleted: !!u.deletedAt || undefined, suspended: u.suspended ? true : undefined,
        everSignedIn: db.hasLogin(u.id), twoStepOn: twostep.isOn(u.id), trial: billing.trialsOf(u.id), lastSeen: db.lastSeen().get(u.id) ?? null,
        operator: platform.operator(emailOf(u))?.role ?? null, throwawayEmail: platform.isDisposable(emailOf(u)),
        guestOf: u.clientOf ? wss.find((w) => w.id === u.clientOf.workspaceId)?.name ?? null : null,
        companies: wss.filter((w) => (w.members ?? []).some((m) => m.userId === u.id)).map((w) => ({ id: w.id, name: w.name, role: w.members.find((m) => m.userId === u.id).role })),
        devicesSignedIn: platform.sessionsOf(u.id).length,
        tickets: support.ticketsOfUser(u.id, emailOf(u)).map((t) => ({ id: t.id, number: t.number, subject: t.subject, status: t.status, updatedAt: t.updatedAt })),
      };
    },
  },
  {
    name: 'money_summary',
    title: 'Revenue this month',
    kind: 'read',
    description: 'Money in rupiah: monthly revenue from plans (the same figure as Money › Revenue\'s card), paying companies, trials and what they would pay after, comped, unlimited and paused companies, revenue per plan, and this month\'s invoices (total, paid, overdue).',
    input: {},
    async run() {
      const rows = companies().filter((c) => !c.internal);
      const byPlan = {};
      for (const c of rows) {
        if (c.state === 'unlimited') continue;
        const key = c.plan ? `${c.plan.tier}${c.plan.cycle === 'yearly' ? ' (yearly)' : ''}` : 'free';
        byPlan[key] ??= { companies: 0, monthlyRp: 0 };
        byPlan[key].companies++;
        byPlan[key].monthlyRp += c.mrr;
      }
      const month = monthStart().slice(0, 7), inv = platform.invoices().filter((i) => i.period === month && i.status !== 'void');
      const trials = rows.filter((c) => c.state === 'trial');
      return {
        monthlyRevenueRp: rows.reduce((n, c) => n + c.mrr, 0),
        paying: rows.filter((c) => c.state === 'paying').length,
        trials: { count: trials.length, afterTrialRp: trials.reduce((n, c) => n + (c.after ?? 0), 0) },
        comped: rows.filter((c) => c.state === 'comp').length,
        unlimited: rows.filter((c) => c.state === 'unlimited').length,
        paused: rows.filter((c) => c.state === 'paused').length,
        discountsRp: rows.reduce((n, c) => n + (c.discount ?? 0), 0),
        byPlan,
        invoices: { month, totalRp: inv.reduce((n, i) => n + i.total, 0), paidRp: inv.filter((i) => i.status === 'paid').reduce((n, i) => n + i.total, 0), overdueRp: platform.overdueInvoices().reduce((n, i) => n + i.total, 0) },
        note: 'Counted from plans. Bank transfers are marked paid by hand.',
      };
    },
  },
  {
    name: 'list_invoices',
    title: 'List invoices',
    kind: 'read',
    description: 'Invoices, newest first. Filter by status (draft = not sent yet, sent, paid, void, overdue) or company id.',
    input: { status: z.enum(['draft', 'sent', 'paid', 'void', 'overdue']).optional(), companyId: z.string().optional(), limit: limitIn(500) },
    async run({ status, companyId, limit = 50 }) {
      const names = wsNames();
      const rows = platform.invoices(companyId).filter((i) => !status || (status === 'overdue' ? i.status === 'sent' && i.dueAt < now() : i.status === status));
      return { count: rows.length, invoices: rows.slice(0, limit).map((i) => invoiceCard(i, names)) };
    },
  },
  {
    name: 'list_errors',
    title: 'Server and app errors',
    kind: 'read',
    description: 'Errors the server and the app recorded, grouped (same message, same place): how often, first and last time, how many people and which companies were hit. Unresolved first.',
    input: { includeResolved: z.boolean().optional(), limit: limitIn(300) },
    async run({ includeResolved, limit = 30 }) {
      const names = wsNames();
      const rows = platform.errorGroups().filter((e) => includeResolved || !e.resolvedAt);
      return { count: rows.length, errors: rows.slice(0, limit).map((e) => ({ id: e.id, source: e.source, message: e.message, where: e.path, firstLine: (e.sample || '').split('\n').slice(0, 3).join('\n').slice(0, 400), count: e.count, firstAt: e.firstAt, lastAt: e.lastAt, people: e.users, companies: e.workspaces.slice(0, 10).map((id) => names.get(id) ?? id), resolvedAt: e.resolvedAt })) };
    },
  },
  {
    name: 'list_audit',
    title: 'Audit log',
    kind: 'read',
    description: 'What operators and agents did in the console, newest first (Team › Audit log). Filter by who (an operator email or "Agent: <name>") or a company/ticket/person id.',
    input: { who: z.string().optional(), target: z.string().optional(), limit: limitIn(1000) },
    async run({ who, target, limit = 50 }) {
      return db.auditList(Math.min(1000, who ? 1000 : limit), target).filter((a) => has(who, a.operator)).slice(0, limit).map(({ id: _id, ...a }) => a);
    },
  },

  // ---------- changes: off until the owner ticks them for a token. None of them reaches a customer. ----------
  {
    name: 'assign_ticket',
    title: 'Give a ticket to an operator',
    kind: 'write',
    optIn: true,
    description: 'Sets who is on a ticket (an operator email from list_tickets\' operatorsWhoCanTakeTickets), or nobody (empty). Nothing is sent to the customer.',
    undo: 'Change the assignee back on the ticket page; the previous one is in the answer and in the Audit log.',
    input: { id: z.string(), assignee: z.string() },
    async run({ id, assignee }) {
      const t = findTicket(id), to = assignee.trim().toLowerCase() || null;
      if (to && !supportOps().includes(to)) throw new Error(`${to} is not an operator who can take tickets. Pick one of: ${supportOps().join(', ')}`);
      const after = support.update(t.id, { assignee: to });
      return { id: t.id, number: t.number, from: t.assignee, to: after.assignee };
    },
  },
  {
    name: 'set_ticket_status',
    title: 'Change a ticket\'s status or priority',
    kind: 'write',
    optIn: true,
    description: 'Sets a ticket\'s status (new, open, waiting = on the customer, resolved, closed) and/or priority (low, normal, high, urgent). It does not reply and sends nothing to the customer.',
    undo: 'Set the status or priority back on the ticket page; the previous values are in the answer and in the Audit log.',
    input: { id: z.string(), status: z.enum(STATUSES).optional(), priority: z.enum(PRIORITIES).optional() },
    async run({ id, status, priority }) {
      const t = findTicket(id);
      if (!status && !priority) throw new Error('Give a status, a priority or both.');
      const after = support.update(t.id, { ...(status ? { status } : {}), ...(priority ? { priority } : {}) });
      return { id: t.id, number: t.number, from: { status: t.status, priority: t.priority }, to: { status: after.status, priority: after.priority } };
    },
  },
  {
    name: 'add_ticket_note',
    title: 'Add an internal note to a ticket',
    kind: 'write',
    optIn: true,
    description: 'Adds an internal note to a ticket (for example a summary, what was checked, or a suggested reply for a person to send), signed with the agent\'s name. Only operators see it; the customer never does and nothing is sent.',
    undo: 'Internal notes are operator-only history: correct one by adding a note after it on the ticket page.',
    input: { id: z.string(), note: z.string().min(1).max(4000) },
    async run({ id, note }, c) {
      const t = findTicket(id);
      support.addMessage(t.id, { kind: 'operator', author: c.who, authorName: c.who, body: note, internal: true });
      return { id: t.id, number: t.number, added: note.slice(0, 120) };
    },
  },
  {
    name: 'add_company_note',
    title: 'Add a note to a company',
    kind: 'write',
    optIn: true,
    description: 'Adds a note for the team to a company\'s Notes tab, signed with the agent\'s name. The company never sees it.',
    undo: 'Remove or edit the note in the company\'s Notes tab.',
    input: { companyId: z.string(), note: z.string().min(1).max(4000) },
    async run({ companyId, note }, c) {
      const ws = db.getDoc('workspaces', companyId);
      if (!ws) throw new Error('No company with that id.');
      const noteId = platform.addNote(companyId, c.who, note);
      return { companyId, company: ws.name, noteId, added: note.slice(0, 120) };
    },
  },
];
