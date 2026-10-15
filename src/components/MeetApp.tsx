import { TabBar } from './ui/TabBar';
import { PersonName, usePersonCard } from './ui/PersonCard';
import { ProjectBadge } from './ProjectBadge';
import { MEETING_LANGUAGES, languageLabel, languagesLabel } from '../data/languages';
import { t, tn, tx, mark } from '../i18n';
import { fmtDate, fmtList, fmtNumber, fmtTime, fmtDay } from '../i18n/format';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ProjectPicker } from './ProjectPicker';
import { SmoothHeight, TabPane } from './ui/Smooth';
import { term } from '../terms';
import {
  Bot,
  CalendarClock,
  CheckSquare,
  Copy,
  Download,
  Eye,
  FileText,
  Folder,
  Inbox,
  Link2,
  ListChecks,
  Lock,
  Menu,
  MoreHorizontal,
  Mic,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Check,
  ClipboardPaste,
  Share2,
  Sparkles,
  Square,
  Trash2,
  Video,
  X,
  EllipsisVertical,
  Tag,
  Users,
  CircleCheck,
  Languages,
  ChevronRight,
  FolderInput,
  Settings,
  Search,
  ChevronUp,
  ChevronDown,
  Mail,
  MessageSquare,
  PenLine,
} from 'lucide-react';
import type { CalEvent, Client, Meeting, MeetingSettings, MeetingType, Role, Todo, User, Workspace } from '../types';
import { relative, fullDate } from '../utils';
import { JOIN_MODES, MEETING_NAME, joinsByRule, meetingLinkOf, notetakerJoins, type MeetingKind } from '../meetingLinks';
import { isMine } from '../identity';
import { Avatar } from './Avatar';
import { Select } from './ui/Select';
import { Popover } from './ui/Popover';
import './meetExtras.css';

export type MeetPage = { kind: 'list' } | { kind: 'folders' } | { kind: 'unfiled' } | { kind: 'upcoming' } | { kind: 'tasks' } | { kind: 'folder'; clientId: string } | { kind: 'meeting'; id: string; q?: string };

/** A meeting's status. Show it with t(). */
export const STATUS_LABEL: Record<NonNullable<Meeting['status']>, string> = {
  queued: mark('Queued'),
  joining: mark('Joining'),
  waiting_room: mark('Waiting to be let in'),
  recording: mark('Recording'),
  stopping: mark('Stopping'),
  processing: mark('Writing notes'),
  done: mark('Done'),
  failed: mark('Failed'),
  stopped: mark('Stopped'),
};
export const LIVE = new Set(['queued', 'joining', 'waiting_room', 'recording', 'stopping', 'processing']);
// Getters: the words come in the language on screen when they're read.
export const TYPE_LABEL: Record<MeetingType, string> = {
  get sales() { return t('Sales'); },
  get client() { return term.One; },
  get internal() { return t('Internal'); },
  get hiring() { return t('Hiring'); },
  get partner() { return t('Partner'); },
  one_on_one: '1:1',
  get other() { return t('Other'); },
};
// Video is a company choice (Beta); a meeting only shows video when the bot actually recorded it.
const KEEP_LABEL = { video: mark('Video, audio and notes'), audio: mark('Audio and notes'), notes: mark('Notes and transcript only') } as const;
export const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
const sizeOf = (mb: number) => (mb >= 1000 ? `${fmtNumber(mb / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB` : mb < 1 ? t('Under 1 MB') : `${fmtNumber(Math.round(mb))} MB`);
/** A log line's time with seconds: "14:30:05" / "14.30.05". */
const logTime = (at: string) => fmtDate(at, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
/** "45 min", "1 h 20 min" / "45 menit", "1 jam 20 menit". */
const hoursOf = (min: number) => {
  const all = Math.round(min);
  const h = Math.floor(all / 60);
  const m = all % 60;
  return h ? (m ? t('{h} h {m} min', { h, m }) : tn(h, '{n} h', '{n} h')) : tn(all, '{n} min', '{n} min');
};

/* ---------------- Sidebar ---------------- */

export function MeetSidebar({ page, meetings, clients, canSend, onPage, onSend, onSettings }: {
  page: MeetPage;
  meetings: Meeting[];
  clients: Client[];
  canSend: boolean;
  onPage: (p: MeetPage) => void;
  onSend: () => void;
  onAsk: () => void; // kept for callers: Ask AI across meetings is the app's own Ask AI (the rail's sparkle), not a nav item
  onSettings: () => void;
}) {
  const is = (k: MeetPage['kind'], id?: string) => page.kind === k && (!id || ('clientId' in page && page.clientId === id));
  const live = meetings.filter((m) => LIVE.has(m.status ?? 'done')).length;
  const unfiled = meetings.filter((m) => !m.clientId).length;
  return (
    <>
      {canSend && (
        <button className="compose-btn" onClick={onSend} title={t('Send notetaker')}>
          <Bot size={16} />
          <span className="sb-label">{t('Send notetaker')}</span>
        </button>
      )}
      <nav className="nav">
        <button className={`nav-item ${is('list') ? 'active' : ''}`} onClick={() => onPage({ kind: 'list' })} title={tx('meet', 'Meetings')}>
          <Video size={17} />
          <span className="sb-label">{tx('meet', 'Meetings')}</span>
          {live ? <span className="count live-count">{tn(live, '{n} live', '{n} live')}</span> : null}
        </button>
        <button className={`nav-item ${is('upcoming') ? 'active' : ''}`} onClick={() => onPage({ kind: 'upcoming' })} title={t('Upcoming')}>
          <CalendarClock size={17} />
          <span className="sb-label">{t('Upcoming')}</span>
        </button>
        <button className={`nav-item ${is('tasks') ? 'active' : ''}`} onClick={() => onPage({ kind: 'tasks' })} title={t('Tasks from meetings')}>
          <ListChecks size={17} />
          <span className="sb-label">{t('Tasks from meetings')}</span>
        </button>
      </nav>
      <div className="nav-heading sb-label">{t('Folders')}</div>
      <nav className="nav">
        {clients.map((c) => {
          return (
            <button key={c.id} className={`nav-item ${is('folder', c.id) ? 'active' : ''}`} onClick={() => onPage({ kind: 'folder', clientId: c.id })} title={c.name}>
              <ProjectBadge p={c} kind="client-dot" />
              <span className="sb-label">{c.name}</span>
            </button>
          );
        })}
        <button className={`nav-item ${is('unfiled') ? 'active' : ''}`} onClick={() => onPage({ kind: 'unfiled' })} title={t('Unfiled')}>
          <Inbox size={16} />
          <span className="sb-label">{t('Unfiled')}</span>
          {unfiled ? <span className="count" title={t('Meetings to file')}>{unfiled}</span> : null}
        </button>
      </nav>
      {/* Settings sits apart from the folders: it isn't one. */}
      <nav className="nav m-nav-settings">
        <button className="nav-item" onClick={onSettings} title={t('Meet settings')}>
          <Settings size={16} />
          <span className="sb-label">{t('Meet settings')}</span>
        </button>
      </nav>
    </>
  );
}

/* ---------------- Main ---------------- */

export interface MeetProps {
  page: MeetPage;
  meetings: Meeting[];
  clients: Client[];
  tasks: Todo[];
  users: User[];
  me: string;
  myRole: Role;
  events: CalEvent[];
  settings: MeetingSettings;
  overrides: Record<string, boolean>;
  sentEvents: Record<string, string>; // event id -> meeting id
  onPage: (p: MeetPage) => void;
  onStop: (id: string) => void;
  onRegenerate: (id: string) => void;
  onTranscribeAgain?: (id: string, language?: string) => void; // real recordings: transcribe the audio again, then rewrite the notes
  onDelete: (id: string) => void;
  onFolder: (id: string, clientId: string | null, remember: boolean) => void;
  onPatch: (id: string, p: Partial<Meeting>) => void;
  onShare: (id: string) => void;
  onToggleTask: (id: string) => void;
  onPatchTask: (id: string, p: Partial<Todo>) => void;
  onBulk: (ids: string[], action: 'done' | 'reopen' | 'delete') => void;
  onAddTask: (t: { title: string; userId: string; meetingId?: string; due?: string; clientId?: string }) => void;
  onOpenTask: (id: string) => void;
  onOpenClient: (id: string) => void;
  onWriteOverview: (clientId: string) => Promise<void>;
  onJoinMode: (m: NonNullable<MeetingSettings['joinMode']>) => void;
  onOverride: (eventId: string, join: boolean | null) => void;
  onSendNow: (e: CalEvent) => void;
  /** The notetaker joining by itself: live (the recorder answers), the demo's switches, or not available here. */
  autoJoin: 'live' | 'demo' | 'off';
  demo?: boolean; // the demo: events that only say "Zoom" or "Google Meet" count as having a link
  calendarsSyncedAt?: string; // when the outside calendars were last read
  onSyncCalendars?: () => void;
  onAsk: (scope: AskScope) => void;
  onSend: () => void;
  canSendBot?: boolean; // the notetaker works here (else Meet has no create button on phones)
  onMenu: () => void;
  toast: (t: string, undo?: () => void) => void; // with Undo when it can be undone
  /** Phones: the company at the top of Meet's drawer, Meet's settings pages, and opening a calendar event. */
  company?: Pick<Workspace, 'name' | 'logo' | 'color'>;
  appSettings?: { id: string; label: string; hint?: string; run: () => void }[];
  onOpenEvent?: (id: string) => void;
  /** Send recap: a prefilled Mail draft to the attendees, and a post in the project's team channel. */
  onRecapEmail?: (subject: string, body: string, to: { name: string; email: string }[]) => void;
  recapChannel?: (m: Meeting) => { id: string; name: string } | undefined;
  onRecapPost?: (channelId: string, text: string) => void;
}

export type { AskScope } from './Assistant';
import type { AskScope } from './Assistant';
import { personOption } from './ui/PeopleList';
import { EmptyState } from './ui/EmptyState';
import { DatePicker } from './ui/DatePicker';
import { useCreateAction, useFocusedScreen } from '../mobile/chrome';
import { useActionMenu } from './ui/ActionSheet';
import { usePhone } from '../mobile/media';
import { TopBar, TopBarBack, TopBarButton } from '../mobile/TopBar';
import { CallMark, callOf, MeetComing, MeetFolders, MeetHome, MeetSettingsScreen, MeetUpcomingScreen } from './MeetPhone';
import { Sheet } from './ui/Sheet';
import { SwipeRow } from './ui/SwipeRow';
import { ConfirmSheet } from './chat/Sheets';

export function MeetView(p: MeetProps & { part?: 'meetings' | 'notes'; embedded?: boolean }) {
  const pg = p.page;
  const phone = usePhone();
  // Phones: Google Meet's "Take notes" (send the notetaker to a call). Embedded (Calendar's Meetings) leaves Calendar's own.
  useCreateAction(p.embedded ? 'calendar' : 'meet', p.canSendBot !== false && { label: t('Send notetaker'), icon: Bot, run: p.onSend });
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Calendar's Meetings section: the same list as Meet's Meetings.
  if (p.embedded) return <MeetComing {...p} />;
  // Phones: Meetings, Notes and Folders are the app's own bar (App's useAppSections); a folder is a sub-screen.
  const sub = phone && (pg.kind === 'folder' || pg.kind === 'unfiled' || pg.kind === 'tasks');
  const phoneChrome = phone && pg.kind !== 'meeting' && (
    <TopBar
      app="meet"
      lead={sub ? <TopBarBack onClick={() => p.onPage({ kind: 'folders' })} /> : undefined}
      // Past and Unfiled have their own search pill: one search entry per screen.
      search={!(pg.kind === 'unfiled' || ((pg.kind === 'list' || pg.kind === 'upcoming') && p.part === 'notes'))}
      actions={pg.kind === 'folder' ? <TopBarButton icon={Sparkles} label={t('Ask AI')} onClick={() => p.onAsk({ kind: 'client', id: pg.clientId })} /> : undefined}
      title={
        <h1 className={`mt-title plain${sub ? ' small' : ''}`}>
          <span className="mt-title-text">{pg.kind === 'folder' ? (p.clients.find((c) => c.id === pg.clientId)?.name ?? t('Folder')) : pg.kind === 'unfiled' ? t('Unfiled') : pg.kind === 'tasks' ? t('Tasks from meetings') : t('Meet')}</span>
        </h1>
      }
    />
  );
  if (phone && (pg.kind === 'list' || pg.kind === 'upcoming'))
    return (
      <>
        {phoneChrome}
        {p.part === 'notes' ? <MeetHome {...p} notesOnly /> : <MeetComing {...p} />}
        {pg.kind === 'upcoming' && <MeetUpcomingScreen {...p} onBack={() => p.onPage({ kind: 'list' })} />}
      </>
    );
  if (phone && pg.kind === 'folders')
    return (
      <>
        {phoneChrome}
        <MeetFolders clients={p.clients} meetings={p.meetings} onPage={p.onPage} onSettings={() => setSettingsOpen(true)} />
        {settingsOpen && <MeetSettingsScreen settings={p.settings} rows={p.appSettings ?? []} myRole={p.myRole} autoJoin={p.autoJoin} onJoinMode={p.onJoinMode} onBack={() => setSettingsOpen(false)} />}
      </>
    );
  if (phone && pg.kind === 'unfiled')
    return (
      <>
        {phoneChrome}
        <MeetHome {...p} unfiled />
      </>
    );
  if (phone && pg.kind !== 'meeting')
    return (
      <>
        {phoneChrome}
        {pg.kind === 'tasks' ? <MeetTasks {...p} /> : pg.kind === 'folder' ? <FolderPage {...p} clientId={pg.clientId} /> : null}
      </>
    );
  if (pg.kind === 'meeting') {
    const m = p.meetings.find((x) => x.id === pg.id);
    if (!m)
      return (
        <section className="meet-pane meet-empty view-enter">
          <EmptyState
            title={t('Not found')}
            text={t('This meeting doesn’t exist in this workspace.')}
            action={
              <button className="ghost-btn" onClick={() => p.onPage({ kind: 'list' })}>
                {t('Back to meetings')}
              </button>
            }
          />
        </section>
      );
    return <MeetingPage {...p} m={m} />;
  }
  if (pg.kind === 'upcoming') return <Upcoming {...p} />;
  if (pg.kind === 'tasks') return <MeetTasks {...p} />;
  if (pg.kind === 'folder') return <FolderPage {...p} clientId={pg.clientId} />;
  return <MeetingList {...p} unfiled={pg.kind === 'unfiled'} />;
}

function Head({ title, sub, onMenu, children }: { title: React.ReactNode; sub?: React.ReactNode; onMenu: () => void; children?: React.ReactNode }) {
  return (
    <header className="tracking-head">
      <button className="icon-btn menu-btn" onClick={onMenu} aria-label={t('Open menu')}>
        <Menu size={18} />
      </button>
      <div className="th-text">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </header>
  );
}

function StatusPill({ m }: { m: Meeting }) {
  const s = m.status ?? 'done';
  return <span className={`m-status s-${s}`}>{LIVE.has(s) && <i />}{t(STATUS_LABEL[s])}</span>;
}

function MeetingRows({ list, clients, tasks, onOpen, onFile, showStatusDone = false }: { list: Meeting[]; clients: Client[]; tasks: Todo[]; onOpen: (id: string) => void; onFile?: (id: string, clientId: string) => void; showStatusDone?: boolean }) {
  // Right-click a meeting (or "File…" on an unfiled one): open it, or file it under a project. Filing used to be a
  // dropdown inside every unfiled row, a box inside a box that made the list noisy.
  const [hit, setHit] = useState<Meeting | null>(null);
  const fileBtn = useRef<HTMLElement | null>(null);
  const menu = useActionMenu(() =>
    !hit
      ? []
      : [
          { label: t('Open'), icon: ChevronRight, run: () => onOpen(hit.id) },
          ...(onFile && (!hit.status || hit.status === 'done')
            ? clients.filter((x) => x.id !== hit.clientId).slice(0, 8).map((x) => ({ label: t('File under {project}', { project: x.name }), icon: FolderInput, group: 'file', run: () => onFile(hit.id, x.id) }))
            : []),
        ],
    { title: hit?.title },
  );
  return (
    <div className="m-rows">
      {list.map((m) => {
        const c = clients.find((x) => x.id === m.clientId);
        const open = tasks.filter((tk) => tk.meetingId === m.id && !tk.done).length;
        return (
          <div key={m.id} className="m-row" role="button" tabIndex={0} onClick={(e) => !(e.target as HTMLElement).closest('.sel, .pop, .m-file') && onOpen(m.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(m.id)} {...menu.bind} onContextMenu={(e) => (setHit(m), menu.bind.onContextMenu(e))} onPointerDown={(e) => (setHit(m), menu.bind.onPointerDown?.(e))}>
            <CallMark kind={m.platform ?? 'meet'} size={28} />
            <span className="m-main">
              <strong>{m.title}</strong>
              <small>
                {fullDate(m.at)}
                {m.type ? ` · ${TYPE_LABEL[m.type]}` : ''}
                {open ? ` · ${tn(open, '{n} open task', '{n} open tasks')}` : ''}
                {m.error && <span className="m-err"> · {t(m.error)}</span>}
              </small>
            </span>
            {c && (
              <span className="client-chip" style={{ ['--c' as string]: c.color }}>
                {c.name}
              </span>
            )}
            {!c && onFile && (!m.status || m.status === 'done') && clients.length > 0 && (
              <button type="button" className="link-btn m-file" onClick={(e) => (e.stopPropagation(), setHit(m), (fileBtn.current = e.currentTarget), menu.openFrom(fileBtn))}>
                {t('File…')}
              </button>
            )}
            {(showStatusDone || m.status !== 'done') && m.status && <StatusPill m={m} />}
          </div>
        );
      })}
      {menu.menu}
    </div>
  );
}

function useFilter(list: Meeting[]) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<string>('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter(
      (m) =>
        (!type || m.type === type) &&
        (!s || m.title.toLowerCase().includes(s) || m.summary.toLowerCase().includes(s) || (m.transcript ?? []).some((l) => l.text.toLowerCase().includes(s))),
    );
  }, [list, q, type]);
  const bar = (placeholder: string) => (
    <div className="m-filters">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      <Select value={type} onChange={setType} label={t('Type')} options={[{ value: '', label: t('All types') }, ...Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))]} />
    </div>
  );
  return { shown, bar, q: q.trim(), filtering: !!(q || type), clear: () => (setQ(''), setType('')) };
}

function MeetingList(p: MeetProps & { unfiled: boolean }) {
  const list = [...p.meetings].filter((m) => !p.unfiled || !m.clientId).sort((a, b) => b.at.localeCompare(a.at));
  const { shown, bar, filtering, q } = useFilter(list);
  return (
    <section className="meet-pane view-enter">
      {/* "Send notetaker" is the sidebar's button; not repeated here (one primary per screen). */}
      <Head title={p.unfiled ? t('Unfiled') : t('Meetings')} sub={p.unfiled ? t('Meetings that didn’t fit a {project} yet.', { project: term.one }) : undefined} onMenu={p.onMenu} />
      <div className="tracking-scroll">
        {!p.unfiled && !filtering && <NextCalls {...p} />}
        {bar(t('Search titles, notes and transcripts'))}
        <MeetingRows list={shown} clients={p.clients} tasks={p.tasks} onOpen={(id) => p.onPage({ kind: 'meeting', id, ...(q ? { q } : {}) })} onFile={(id, cid) => p.onFolder(id, cid, false)} />
        {shown.length === 0 && <EmptyState compact text={filtering ? t('Nothing matches.') : t('No meetings here yet. Use “{send}”.', { send: t('Send notetaker') })} />}
      </div>
    </section>
  );
}

/** Meetings on desktop and tablets: the next three calls with a link above the past ones, so the next call is in view. */
function NextCalls(p: MeetProps) {
  const now = Date.now();
  const next = p.events
    .filter((e) => !e.allDay && linkOf(e, p.demo) && new Date(e.end).getTime() > now && new Date(e.start).getTime() < now + 7 * 86_400_000)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 3);
  if (!next.length) return null;
  return (
    <div className="m-next">
      <div className="d-heading m-next-head">
        <span>{t('Upcoming')}</span>
        <button type="button" className="link-btn" onClick={() => p.onPage({ kind: 'upcoming' })}>
          {t('See all')}
        </button>
      </div>
      <div className="m-rows">
        {next.map((e) => (
          <div key={e.id} className="m-row" role="button" tabIndex={0} onClick={() => p.onPage({ kind: 'upcoming' })} onKeyDown={(ev) => ev.key === 'Enter' && p.onPage({ kind: 'upcoming' })}>
            <CallMark kind={linkOf(e, p.demo)} size={28} />
            <span className="m-main">
              <strong>{e.title}</strong>
              <small>{[fmtDay(e.start), fmtTime(e.start)].join(' · ')}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="d-heading">{tx('meet', 'Meetings')}</div>
    </div>
  );
}

/* ---------------- Meeting page ---------------- */

function MeetingPage(p: MeetProps & { m: Meeting }) {
  const { m } = p;
  // A search from the meetings list comes along: the transcript opens on its first match.
  const carried = p.page.kind === 'meeting' && p.page.q ? p.page.q : '';
  const carriedHit = !!carried && (m.transcript ?? []).some((l) => l.text.toLowerCase().includes(carried.toLowerCase()));
  const [tab, setTab] = useState<'summary' | 'tasks' | 'transcript' | 'log'>(carriedHit ? 'transcript' : 'summary');
  const [find, setFind] = useState(carriedHit ? carried : '');
  const [hit, setHit] = useState(0);
  const [only, setOnly] = useState<string | null>(null); // the transcript shows one speaker's lines
  const [renaming, setRenaming] = useState<string | null>(null); // "Who is this?" for a speaker label
  const [recapOpen, setRecapOpen] = useState(false);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [askRemember, setAskRemember] = useState<string | null>(null);
  const [newTask, setNewTask] = useState('');
  const [addOpen, setAddOpen] = useState(false); // phones: the add-task sheet
  const [accessOpen, setAccessOpen] = useState(false);
  const accessBtn = useRef<HTMLButtonElement>(null);
  const tEnd = useRef<HTMLDivElement>(null);
  const status = m.status ?? 'done';
  const live = LIVE.has(status);
  const client = p.clients.find((c) => c.id === m.clientId);
  const mTasks = p.tasks.filter((tk) => tk.meetingId === m.id);
  const doneN = mTasks.filter((tk) => tk.done).length;
  const speakers = [...new Set((m.transcript ?? []).map((l) => l.speaker))];
  const rawKeep = m.recording?.keep ?? (status === 'done' ? p.settings.keep : undefined);
  const keep = rawKeep === 'video' && !m.recording?.videoUrl ? 'audio' : rawKeep; // demo and older meetings have no real video
  // A real recording from the bot plays through <audio> or <video>; demo meetings run the same controls on a timer.
  const audio = useRef<HTMLMediaElement>(null);
  const real = (keep === 'audio' || keep === 'video') && !!m.recording?.url;
  const isVideo = keep === 'video' && !!m.recording?.videoUrl;
  const duration = real && m.recording?.seconds ? m.recording.seconds * 1000 : (m.minutes || 1) * 60_000;

  useEffect(() => {
    if (real) {
      const a = audio.current;
      if (a) void (playing ? a.play().catch(() => setPlaying(false)) : a.pause());
      return;
    }
    if (!playing) return;
    const timer = setInterval(() => setTime((x) => (x + 1000 >= duration ? (setPlaying(false), duration) : x + 1000)), 250);
    return () => clearInterval(timer);
  }, [playing, duration, real]);
  useEffect(() => {
    if (tab === 'transcript' && live) tEnd.current?.scrollIntoView({ block: 'end' });
  }, [m.transcript?.length, tab, live]);

  const seek = (ms: number) => {
    setTime(ms);
    if (real && audio.current) audio.current.currentTime = ms / 1000;
    if (keep !== 'notes') setPlaying(true);
  };

  const copy = async () => {
    const section = (h: string, list?: string[]) => ['', t(h), ...(list?.length ? list.map((x) => `- ${x}`) : [`- ${t('None')}`])];
    const taskLine = (tk: Todo) => {
      const who = tk.userId ? p.users.find((u) => u.id === tk.userId)?.name : undefined;
      const task = who ? `${tk.title} (${who})` : tk.title;
      return `[${tk.done ? 'x' : ' '}] ${tk.due ? t('{task}, due {due}', { task, due: fmtDay(tk.due) }) : task}`;
    };
    const lines =
      tab === 'summary'
        ? [m.title, '', m.summary, ...section(mark('Key points'), m.keyPoints), ...section(mark('Decisions'), m.decisions), ...section(mark('Open questions'), m.openQuestions)]
        : tab === 'tasks'
          ? mTasks.map(taskLine)
          : tab === 'transcript'
            ? (m.transcript ?? []).map((l) => `[${mmss(l.at)}] ${l.speaker}: ${l.text}`)
            : (m.log ?? []).map((l) => `${logTime(l.at)}  ${l.message}`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      p.toast(tab === 'summary' ? t('Summary copied') : tab === 'tasks' ? t('Tasks copied') : tab === 'transcript' ? t('Transcript copied') : t('Notetaker log copied'));
    } catch {
      p.toast(t('Copying isn’t allowed here'));
    }
  };
  const downloadTxt = () => {
    const blob = new Blob([(m.transcript ?? []).map((l) => `[${mmss(l.at)}] ${l.speaker}: ${l.text}`).join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `transcript-${m.id}.txt`;
    a.click();
  };

  const nameFor = (tk: Todo) => p.users.find((u) => u.id === tk.userId);
  const actionOwner = (tk: Todo) => m.actions.find((a) => a.taskId === tk.id)?.owner;

  // Phones: the meeting takes the whole screen with Back to the list, and its actions sit in one "…" menu so the
  // header stays one row (the desktop keeps its buttons).
  const phone = usePhone();
  useFocusedScreen(true, phone ? undefined : () => p.onPage({ kind: 'list' }));
  const moreBtn = useRef<HTMLButtonElement>(null);
  // The app's own confirm (a sheet on phones, a centred panel on desktop) for what can't be taken back.
  const [ask, setAsk] = useState<{ title: string; text: string; yes: string; safe?: boolean; run: () => void } | null>(null);
  const canRegen = !live && (m.transcript?.length ?? 0) > 0;
  const regenerate = () => setAsk({ title: t('Regenerate notes?'), text: t('Regenerate the summary and tasks from the transcript? Tasks you edited are kept.'), yes: t('Regenerate'), safe: true, run: () => p.onRegenerate(m.id) });
  // Delete goes straight away: the toast's Undo brings it back.
  const remove = () => p.onDelete(m.id);
  const hasVideo = !!m.recording?.url && !!m.recording?.videoUrl;
  const dropTo = (v: 'audio' | 'notes') =>
    m.recording?.url
      ? setAsk({
          title: v === 'notes' ? t('Delete the recording?') : t('Delete the video?'),
          text: v === 'notes' ? t('Delete the recording for good? This can’t be undone.') : t('Delete the video (the audio stays) for good? This can’t be undone.'),
          yes: t('Delete'),
          run: () => p.onPatch(m.id, { recording: { ...m.recording!, keep: v } }),
        })
      : p.onPatch(m.id, { recording: { ...m.recording, keep: v, sizeMb: v === 'audio' ? (m.minutes || 30) * 0.5 : 0.4 } } as Partial<Meeting>);
  const more = useActionMenu(
    () => [
      // Share isn't here: it's always its own button next to ⋮. On desktop, Ask AI is in "At a glance" and Ask the
      // notetaker to leave is a header button.
      ...(phone ? [{ label: t('Ask about this meeting'), icon: Sparkles, run: () => p.onAsk({ kind: 'meeting', id: m.id }) }] : []),
      ...(phone && live && status !== 'stopping' && status !== 'processing' ? [{ label: t('Ask notetaker to leave'), icon: Square, run: () => p.onStop(m.id) }] : []),
      ...(canRegen ? [{ label: t('Regenerate notes'), hint: t('From the transcript'), icon: RefreshCw, run: regenerate }] : []),
      ...(status === 'done' ? [{ label: t('Who can see this'), icon: Lock, run: () => setAccessOpen(true) }] : []),
      { label: t('Notetaker log'), hint: t('What the notetaker did, step by step'), icon: FileText, run: () => setTab('log') },
      ...(status === 'done' && keep === 'video' && hasVideo ? [{ label: t('Delete the video'), hint: t('The audio stays'), icon: Trash2, danger: true, group: 'end', run: () => dropTo('audio') }] : []),
      ...(status === 'done' && (keep === 'video' || keep === 'audio') ? [{ label: t('Delete recording'), hint: t('Notes and transcript stay'), icon: Trash2, danger: true, group: 'end', run: () => dropTo('notes') }] : []),
      { label: t('Delete meeting'), icon: Trash2, danger: true, group: 'end', run: remove },
    ],
    { title: m.title },
  );
  /* ---- Talk time, the speaker filter, find in transcript, speaker labels, moments, recap ---- */
  const lines = useMemo(() => m.transcript ?? [], [m.transcript]);
  const userOf = (name: string) => (name ? (p.users.find((u) => u.name === name) ?? p.users.find((u) => u.name.split(' ')[0] === name.split(' ')[0])) : undefined);
  // Each line lasts until the next one starts, but no longer than its words take to say (about 150 a minute), so
  // a silence or a gap in the transcript doesn't count as talking.
  const talk = useMemo(() => {
    const per = new Map<string, number>();
    lines.forEach((l, i) => {
      const next = lines[i + 1]?.at;
      const said = Math.max(2000, l.text.split(/\s+/).filter(Boolean).length * 400);
      const ms = next !== undefined && next > l.at ? Math.min(next - l.at, said) : said;
      per.set(l.speaker, (per.get(l.speaker) ?? 0) + ms);
    });
    const total = [...per.values()].reduce((a, b) => a + b, 0);
    return [...per].map(([name, ms]) => ({ name, ms, pct: total ? Math.round((ms / total) * 100) : 0 })).sort((a, b) => b.ms - a.ms);
  }, [lines]);
  const shownLines = useMemo(() => lines.map((l, i) => ({ l, i })).filter(({ l }) => only === null || l.speaker === only), [lines, only]);
  const needle = find.trim().toLowerCase();
  const hits = useMemo(() => (needle ? shownLines.filter(({ l }) => l.text.toLowerCase().includes(needle)).map(({ i }) => i) : []), [shownLines, needle]);
  const hitAt = hits.length ? hits[Math.min(hit, hits.length - 1)] : -1;
  const trBox = useRef<HTMLDivElement>(null);
  // Moves the playhead without playing, so finding a line doesn't start the sound.
  const cue = (ms: number) => {
    setTime(ms);
    if (real && audio.current) audio.current.currentTime = ms / 1000;
  };
  useEffect(() => setHit(0), [needle, only]);
  useEffect(() => {
    if (hitAt < 0 || tab !== 'transcript') return;
    cue(lines[hitAt].at);
    trBox.current?.querySelector(`[data-line="${hitAt}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitAt, tab]);
  const step = (d: 1 | -1) => hits.length && setHit((h) => (Math.min(h, hits.length - 1) + d + hits.length) % hits.length);
  const marked = (text: string, on: boolean) => {
    if (!needle || !on) return text;
    const out: React.ReactNode[] = [];
    let from = 0;
    const low = text.toLowerCase();
    for (let at = low.indexOf(needle); at >= 0; at = low.indexOf(needle, from)) {
      out.push(text.slice(from, at), <mark key={at}>{text.slice(at, at + needle.length)}</mark>);
      from = at + needle.length;
    }
    out.push(text.slice(from));
    return out;
  };

  // When a key point or decision was said: the transcript line that shares the most words with it.
  const momentOf = useMemo(() => {
    const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
    const lw = lines.map((l) => words(l.text));
    const cache = new Map<string, number | undefined>();
    return (text: string) => {
      if (cache.has(text)) return cache.get(text);
      const want = [...words(text)];
      let best = -1;
      let score = 0;
      lw.forEach((w, i) => {
        const n = want.filter((x) => w.has(x)).length;
        if (n > score) (score = n), (best = i);
      });
      const at = best >= 0 && score >= Math.max(2, Math.ceil(want.length * 0.3)) ? lines[best].at : undefined;
      cache.set(text, at);
      return at;
    };
  }, [lines]);
  const jump = (ms: number) => {
    if (keep === 'notes' || !keep) {
      const i = lines.findIndex((l) => l.at === ms);
      setOnly(null);
      setTab('transcript');
      setTimeout(() => trBox.current?.querySelector(`[data-line="${i}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 260);
      setTime(ms);
    } else seek(ms);
  };

  // A speaker's name: tap opens their profile card (teammates), long-press or right-click opens what you can do.
  const card = usePersonCard();
  const [spk, setSpk] = useState('');
  const spkEl = useRef<HTMLElement | null>(null);
  const spkMenu = useActionMenu(
    () => {
      const u = userOf(spk);
      const share = talk.find((x) => x.name === spk)?.pct ?? 0;
      return [
        ...(u && card ? [{ label: t('Profile'), icon: Users, run: () => card.open(u.id, spkEl.current) }] : []),
        only === spk
          ? { label: t('Show everyone'), icon: Users, run: () => setOnly(null) }
          : { label: t('Show only their lines'), hint: t('Spoke {pct}%', { pct: share }), icon: Search, run: () => (setOnly(spk), setTab('transcript')) },
        ...(!live ? [{ label: t('Who is this?'), hint: t('Rename on every line'), icon: PenLine, run: () => setRenaming(spk) }] : []),
      ];
    },
    { title: spk || t('Unknown') },
  );
  const speakerProps = (name: string) => ({
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': t('{name}: profile and options', { name: name || t('Unknown') }),
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.stopPropagation();
      setSpk(name);
      spkEl.current = e.currentTarget;
      spkMenu.bind.onPointerDown(e);
    },
    onPointerMove: spkMenu.bind.onPointerMove,
    onPointerUp: spkMenu.bind.onPointerUp,
    onPointerCancel: spkMenu.bind.onPointerCancel,
    onClickCapture: spkMenu.bind.onClickCapture,
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      setSpk(name);
      spkEl.current = e.currentTarget;
      spkMenu.bind.onContextMenu(e);
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      setSpk(name);
      spkEl.current = e.currentTarget;
      const u = userOf(name);
      if (u && card) card.open(u.id, e.currentTarget);
      else spkMenu.openAt(e.clientX, e.clientY);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      setSpk(name);
      const r = e.currentTarget.getBoundingClientRect();
      spkMenu.openAt(r.left, r.bottom);
    },
  });

  // "Who is this?": one name on every line, the action items' owners, and unassigned tasks they promised.
  const rename = (from: string, to: string, user?: User) => {
    const name = to.trim();
    if (!name || name === from) return setRenaming(null);
    const before = { transcript: m.transcript, actions: m.actions, attendees: m.attendees };
    const firstOf = (s: string) => s.split(' ')[0].toLowerCase();
    const relink = mTasks.filter((tk) => !tk.userId && !!user && (actionOwner(tk) === from || (!!from && !!actionOwner(tk) && firstOf(actionOwner(tk)!) === firstOf(from))));
    p.onPatch(m.id, {
      transcript: lines.map((l) => (l.speaker === from ? { ...l, speaker: name } : l)),
      actions: m.actions.map((a) => (a.owner === from || (!!from && !!a.owner && firstOf(a.owner) === firstOf(from)) ? { ...a, owner: name } : a)),
      attendees: m.attendees.map((a) => (a === from ? name : a)),
    });
    relink.forEach((tk) => p.onPatchTask(tk.id, { userId: user!.id }));
    if (only === from) setOnly(name);
    setRenaming(null);
    p.toast(t('{from} is now {to}', { from: from || t('Unknown'), to: name }), () => {
      p.onPatch(m.id, before);
      relink.forEach((tk) => p.onPatchTask(tk.id, { userId: '' }));
    });
  };

  // The recap: what was decided and who does what, ready for Mail or the project's chat.
  const recapText = () => {
    const list = (h: string, xs?: string[]) => (xs?.length ? ['', t(h), ...xs.map((x) => `- ${x}`)] : []);
    const taskLines = mTasks.length
      ? mTasks.map((tk) => {
          const who = nameFor(tk)?.name ?? actionOwner(tk);
          return `- ${who ? `${tk.title} (${who})` : tk.title}${tk.due ? `, ${t('due {due}', { due: fmtDay(tk.due) })}` : ''}`;
        })
      : m.actions.map((a) => `- ${a.owner ? `${a.title} (${a.owner})` : a.title}`);
    return [m.title, fullDate(m.at), '', m.summary, ...list(mark('Decisions'), m.decisions), ...(taskLines.length ? ['', t('Action items'), ...taskLines] : []), ...list(mark('Open questions'), m.openQuestions)].join('\n');
  };
  const recapTo = (m.attendees.length ? m.attendees : speakers)
    .map((a) => userOf(a))
    .filter((u): u is User => !!u && u.id !== p.me)
    .filter((u, i, all) => all.findIndex((x) => x.id === u.id) === i)
    .map((u) => ({ name: u.name, email: u.email }));
  const recapChan = p.recapChannel?.(m);
  const canRecap = status === 'done' && !!m.summary && (!!p.onRecapEmail || !!recapChan);

  // Phones: Google's details page: Back, then Share and ⋮ at the top right.
  const phoneBar = phone && (
    <TopBar
      app="meet"
      lead={<TopBarBack onClick={() => p.onPage({ kind: 'list' })} />}
      title={<span className="mt-empty-title" />}
      search={false}
      actions={
        <>
          <TopBarButton icon={Share2} label={m.share ? t('Shared') : t('Share')} onClick={() => p.onShare(m.id)} />
          <button ref={moreBtn} type="button" className="icon-btn mt-btn" aria-label={t('More for this meeting')} onClick={() => more.openFrom(moreBtn)}>
            <EllipsisVertical size={22} />
          </button>
        </>
      }
    />
  );

  return (
    <section className="meet-pane meet-page view-enter">
      {phoneBar}
      <header className="tracking-head m-head">
        <button className="icon-btn menu-btn" onClick={p.onMenu} aria-label={t('Open menu')}>
          <Menu size={18} />
        </button>
        <button className="link-btn" onClick={() => p.onPage({ kind: 'list' })}>
          {t('Meetings')}
        </button>
        <StatusPill m={m} />
        <span className="spacer" />
        {live && status !== 'stopping' && status !== 'processing' && (
          <button className="ghost-btn sm" onClick={() => p.onStop(m.id)}>
            <Square size={13} /> {t('Ask notetaker to leave')}
          </button>
        )}
        {/* Regenerate and Delete live in ⋮, so the header stays one row on tablets. */}
        {canRecap && !phone && (
          <button className="primary-btn sm" onClick={() => setRecapOpen(true)}>
            <Send size={13} /> {t('Send recap')}
          </button>
        )}
        <button className="ghost-btn sm" onClick={() => p.onShare(m.id)}>
          <Share2 size={13} /> {m.share ? t('Shared') : t('Share')}
        </button>
        {!phone && (
          <button ref={moreBtn} className="icon-btn m-more" aria-label={t('More for this meeting')} onClick={() => more.openFrom(moreBtn)}>
            <MoreHorizontal size={20} />
          </button>
        )}
        {more.menu}
      </header>

      <div className="tracking-scroll">
        {askRemember && (
          <div className="remember">
            {t('Always file meetings with {people} under {project}?', { people: fmtList(speakers.filter((s) => !p.users.some((u) => u.name.split(' ')[0] === s.split(' ')[0]) && s !== 'You')), project: p.clients.find((c) => c.id === askRemember)?.name ?? '' })}
            <span className="spacer" />
            <button className="ghost-btn sm" onClick={() => setAskRemember(null)}>
              {t('No')}
            </button>
            <button className="primary-btn sm" onClick={() => (p.onFolder(m.id, askRemember, true), setAskRemember(null))}>
              {t('Yes, always')}
            </button>
          </div>
        )}
        <h2 className="m-title">{m.title}</h2>
        <p className="m-sub">
          {fullDate(m.at)} · {m.platform === 'zoom' ? 'Zoom' : 'Google Meet'}
          {m.error && <span className="m-err"> · {t(m.error)}</span>}
          {m.attendees.length ? ` · ${tn(m.attendees.length, '{n} invited', '{n} invited')}` : ''}
          {m.tags?.map((tag) => (
            <span key={tag} className="m-tag">
              #{tag}
            </span>
          ))}
        </p>
        {live && phone && (
          <p className="m-live">
            <i /> {t(STATUS_LABEL[status])}
          </p>
        )}
        {phone && (
          // Phones: the meeting's facts as rows (Calendar's details), where the desktop has "At a glance".
          <div className="m-facts">
            <div className="dr-row">
              <span className="dr-icon">
                <Folder size={20} />
              </span>
              <ProjectPicker
                value={m.clientId ?? ''}
                onChange={(v) => {
                  const outsiders = speakers.filter((s) => !p.users.some((u) => u.name.split(' ')[0] === s.split(' ')[0]) && s !== 'You' && s !== `${term.One}`);
                  if (v && outsiders.length && m.clientId !== v) setAskRemember(v);
                  p.onFolder(m.id, v || null, false);
                }}
                projects={p.clients}
                none={t('Unfiled')}
                label={t('Folder')}
                className="er-sel"
              />
              <ChevronRight size={20} className="m-fact-chev" aria-hidden="true" />
            </div>
            <div className="dr-row">
              <span className="dr-icon">
                <Tag size={20} />
              </span>
              <Select value={m.type ?? null} onChange={(v) => p.onPatch(m.id, { type: v as MeetingType })} placeholder={t('Meeting type')} label={t('Meeting type')} className={`er-sel${m.type ? '' : ' er-empty'}`} options={Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: t('{type} meeting', { type: l }) }))} />
              <ChevronRight size={20} className="m-fact-chev" aria-hidden="true" />
            </div>
            {(m.attendees.length > 0 || speakers.length > 0) && (
              <div className="dr-row">
                <span className="dr-icon">
                  <Users size={20} />
                </span>
                <span className="dr-text">{fmtList(m.attendees.length ? m.attendees : speakers)}</span>
              </div>
            )}
            <button type="button" className="dr-row dr-main" onClick={() => setTab('tasks')}>
              <span className="dr-icon">
                <CircleCheck size={20} />
              </span>
              <span className="dr-text">{t('{done} of {total} done', { done: doneN, total: mTasks.length })}</span>
              <ChevronRight size={20} className="m-fact-chev" aria-hidden="true" />
            </button>
          </div>
        )}
        {phone && canRecap && (
          <button type="button" className="primary-btn m-recap-btn" onClick={() => setRecapOpen(true)}>
            <Send size={16} /> {t('Send recap')}
          </button>
        )}

        <div className="m-top">
          <div className="m-video">
            {keep === 'notes' ? (
              <div className="m-novideo">
                <FileText size={22} />
                <strong>{t('Notes and transcript only')}</strong>
                <span>{t('The recording wasn’t kept for this meeting, to save space.')}</span>
              </div>
            ) : !keep ? (
              <div className="m-novideo">
                {status === 'recording' ? <span className="rec-dot big" /> : <Video size={22} />}
                <strong>{t('No recording')}</strong>
                <span>{status === 'recording' ? t('Recording in progress. It appears here when the meeting ends.') : status === 'failed' || status === 'stopped' ? t('There is no recording for this meeting.') : t('The recording appears here after the meeting.')}</span>
              </div>
            ) : (
              <div className={`m-player ${keep}${playing ? ' is-playing' : ''}`}>
                {isVideo ? (
                  <video ref={audio as React.RefObject<HTMLVideoElement>} className="m-video-el" src={m.recording!.videoUrl} preload="metadata" playsInline onClick={() => setPlaying((x) => !x)} onTimeUpdate={(e) => setTime(e.currentTarget.currentTime * 1000)} onEnded={() => setPlaying(false)} />
                ) : (
                  real && <audio ref={audio as React.RefObject<HTMLAudioElement>} src={m.recording!.url} preload="metadata" onTimeUpdate={(e) => setTime(e.currentTarget.currentTime * 1000)} onEnded={() => setPlaying(false)} />
                )}
                {keep === 'audio' && (
                  <span className="voice-wave playing-static">
                    {Array.from({ length: 48 }, (_, i) => (
                      <i key={i} style={{ height: 8 + Math.abs(Math.sin(i * 1.3)) * 30 }} />
                    ))}
                  </span>
                )}
                <button className="m-play" onClick={() => setPlaying((x) => !x)} aria-label={playing ? t('Pause') : t('Play')}>
                  {playing ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <div className="m-bar" onClick={(e) => seek(((e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.clientWidth) * duration)}>
                  <span style={{ width: `${(time / duration) * 100}%` }} />
                </div>
                <span className="m-time">
                  {mmss(time)} / {mmss(duration)}
                </span>
              </div>
            )}
            {status === 'done' && (
              <div className="keep-row">
                {/* What's kept, as text: deleting the recording is a danger action in ⋮ that asks first. */}
                <span className="muted small">
                  {t('Kept: {what}', { what: t(KEEP_LABEL[keep ?? p.settings.keep]) })}
                  {keep !== 'notes' && m.recording ? ` · ${t('{size} of team storage', { size: sizeOf(m.recording.sizeMb + (keep === 'video' ? m.recording.videoMb ?? 0 : 0)) })}` : ''}
                </span>
                <button ref={accessBtn} className="link-btn small" onClick={() => setAccessOpen(true)}>
                  <Lock size={12} /> {t('Who can see this')}
                </button>
              </div>
            )}
          </div>

          <div className="m-glance side-card">
            <h3>{t('At a glance')}</h3>
            <dl>
              {!phone && (
                <>
                  <dt>{t('Folder')}</dt>
                  <dd>
                    <ProjectPicker
                      value={m.clientId ?? ''}
                      onChange={(v) => {
                        const outsiders = speakers.filter((s) => !p.users.some((u) => u.name.split(' ')[0] === s.split(' ')[0]) && s !== 'You' && s !== `${term.One}`);
                        if (v && outsiders.length && m.clientId !== v) setAskRemember(v);
                        p.onFolder(m.id, v || null, false);
                      }}
                      projects={p.clients}
                      none={t('Unfiled')}
                      label={t('Folder')}
                      className="sel-flat"
                    />
                    {m.filedBy && m.filedBy !== 'user' && <span className="muted small m-filed">{m.filedBy === 'ai' ? t('auto-filed') : t('filed by rule')}</span>}
                  </dd>
                  <dt>{t('Type')}</dt>
                  <dd>
                    <Select value={m.type ?? null} onChange={(v) => p.onPatch(m.id, { type: v as MeetingType })} placeholder={t('Type…')} label={t('Type')} className="sel-flat" options={Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
                  </dd>
                </>
              )}
              <dt>{t('Tasks')}</dt>
              <dd>
                {t('{done}/{total} done', { done: doneN, total: mTasks.length })}
                <span className="bar wide">
                  <span style={{ width: `${mTasks.length ? (doneN / mTasks.length) * 100 : 0}%` }} />
                </span>
              </dd>
              <dt>{t('Length')}</dt>
              <dd>{m.minutes ? hoursOf(m.minutes) : t('not set')}</dd>
              <dt>{t('Speakers')}</dt>
              <dd>{speakers.length}</dd>
              <dt>{tx('meet', 'People')}</dt>
              <dd className="chips">
                {(m.attendees.length ? m.attendees : speakers).map((a) => {
                  const u = p.users.find((x) => x.name === a) ?? p.users.find((x) => x.name.split(' ')[0] === a.split(' ')[0]);
                  return (
                    <span key={a} className="m-person">
                      {u ? <PersonName who={u.id}>{a}</PersonName> : speakers.includes(a) ? <span className="person-link" {...speakerProps(a)}>{a}</span> : a}
                    </span>
                  );
                })}
              </dd>
              {client && (
                <>
                  <dt>{term.One}</dt>
                  <dd>
                    <button className="link-btn" onClick={() => p.onOpenClient(client.id)}>
                      {client.name}
                    </button>
                    {m.sharedWithClient && <span className="ap-tag approved">{t('notes visible to {whos}', { whos: term.whos })}</span>}
                  </dd>
                </>
              )}
            </dl>
            <button className="ghost-btn sm" onClick={() => p.onAsk({ kind: 'meeting', id: m.id })}>
              <Sparkles size={13} /> {t('Ask about this meeting')}
            </button>
          </div>
        </div>

        <TabBar
          storageKey="meeting-tabs"
          className="client-tabs m-tabs"
          value={tab}
          onSelect={(id) => setTab(id as typeof tab)}
          fixed={['summary']}
          items={(
            [
              ['summary', t('Summary'), t('Summary')],
              ['tasks', t('Action items {n}', { n: mTasks.filter((tk) => !tk.done).length }), t('Action items')],
              ['transcript', t('Transcript'), t('Transcript')],
              ['log', t('Notetaker log'), t('Notetaker log')],
            ] as const
          )
            // The bot log is for checking what went wrong, not reading (Read AI keeps diagnostics out of sight): a tab
            // only when the recording failed, else in ⋮.
            .filter(([id]) => id !== 'log' || tab === 'log' || (!phone && m.status === 'failed'))
            .map(([id, label, name]) => ({ id, label, name }))}
          trailing={
            <>
              <span className="spacer" />
              {tab === 'transcript' && (m.transcript?.length ?? 0) > 0 && (
                <button className="m-tab-act" onClick={downloadTxt} title={t('Download .txt')}>
                  <Download size={13} /> <span className="lbl">{t('Download .txt')}</span>
                </button>
              )}
              <button className="m-tab-act" onClick={copy} title={t('Copy')}>
                <Copy size={13} /> <span className="lbl">{t('Copy')}</span>
              </button>
            </>
          }
        />

        <TabPane key={tab}>
        {tab === 'summary' &&
          (m.summary ? (
            <div className="m-notes">
              <p className="m-lead">{m.summary}</p>
              {(
                [
                  [mark('Key points'), m.keyPoints],
                  [mark('Decisions'), m.decisions],
                  [mark('Open questions'), m.openQuestions],
                ] as const
              ).map(([h, list]) => (
                <div key={h}>
                  <h4>{t(h)}</h4>
                  {list?.length ? (
                    <ul>
                      {list.map((x) => {
                        const at = momentOf(x);
                        return (
                          <li key={x}>
                            {x}
                            {at !== undefined && (
                              <button type="button" className="m-at" onClick={() => jump(at)} title={t('Jump to when it was said')} aria-label={t('Jump to {time}', { time: mmss(at) })}>
                                <Play size={12} /> {mmss(at)}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="muted small">{t('None')}</p>
                  )}
                </div>
              ))}
              {!!m.topics?.length && (
                <div>
                  <h4>{t('Topics')}</h4>
                  <div className="topic-chips">
                    {m.topics.map((tp) => (
                      <button key={tp.name + tp.at} onClick={() => seek(tp.at)}>
                        <b>{mmss(tp.at)}</b> {tp.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              compact
              text={live ? t('Notes appear here when the meeting ends.') : t('No notes for this meeting.')}
              action={
                canRegen ? (
                  <button type="button" className="ghost-btn" onClick={regenerate}>
                    <RefreshCw size={16} /> {t('Regenerate notes')}
                  </button>
                ) : undefined
              }
            />
          ))}

        {tab === 'tasks' && (
          <TaskList
            {...p}
            list={mTasks}
            meetingFor={() => m}
            ownerName={actionOwner}
            nameFor={nameFor}
            extra={
              mTasks.length > 0 && (
                <button className="ghost-btn sm" onClick={() => p.onBulk(mTasks.map((tk) => tk.id), 'delete')}>
                  {t('Clear all tasks')}
                </button>
              )
            }
            empty={
              m.actions.some((a) => !a.taskId) ? (
                <div className="te-empty">
                  {t('No tasks yet. Action items mentioned in the meeting:')}
                  <ul>
                    {m.actions.map((a) => (
                      <li key={a.title}>
                        {a.title}
                        {a.owner ? ` · ${a.owner}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <EmptyState compact text={t('No action items.')} />
              )
            }
            footer={
              phone ? (
                <button type="button" className="mt-add-row" onClick={() => setAddOpen(true)}>
                  <Plus size={20} />
                  {t('Add a task')}
                </button>
              ) : (
              <div className="todo-add task-add">
                <Plus size={16} />
                <input value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newTask.trim() && (p.onAddTask({ title: newTask.trim(), userId: p.me, meetingId: m.id, clientId: m.clientId }), setNewTask(''))} placeholder={t('Add a task from this meeting…')} />
                <button className="primary-btn sm" disabled={!newTask.trim()} onClick={() => (p.onAddTask({ title: newTask.trim(), userId: p.me, meetingId: m.id, clientId: m.clientId }), setNewTask(''))}>
                  {t('Add')}
                </button>
              </div>
              )
            }
            onSeek={(ms) => (setTab('summary'), seek(ms))}
          />
        )}

        {tab === 'transcript' && (
          <div className="m-transcript">
            {!live && m.bot && m.recording?.url && p.onTranscribeAgain && (
              <div className="tr-again">
                <span className="muted small">{t('Spoken in {languages}. Wrong language or messy?', { languages: m.language ? languageLabel(m.language) : languagesLabel(p.settings.languages) })}</span>
                <Select<string>
                  value={null}
                  onChange={(v) => p.onTranscribeAgain!(m.id, v === 'company' ? undefined : v)}
                  placeholder={t('Transcribe again in…')}
                  label={t('Transcribe again in')}
                  className="sel-flat"
                  width={260}
                  options={[{ value: 'company', label: languagesLabel(p.settings.languages), hint: t('Your company’s meeting languages') }, ...MEETING_LANGUAGES.map((l) => ({ value: l.code, label: t(l.label), hint: m.language === l.code ? t('Used last time') : undefined }))]}
                />
              </div>
            )}
            {lines.length > 0 && (
              <>
                {/* Who talked how much; tap a speaker to read only their lines. */}
                {talk.length > 1 && (
                  <div className="m-talk" role="group" aria-label={t('Talk time')}>
                    {talk.map((s) => (
                      <button key={s.name} type="button" className={`m-talk-row${only === s.name ? ' on' : ''}`} aria-pressed={only === s.name} onClick={() => setOnly(only === s.name ? null : s.name)}>
                        <span className="m-talk-name">{s.name || t('Unknown')}</span>
                        <span className="m-talk-bar" aria-hidden="true">
                          <span style={{ width: `${s.pct}%` }} />
                        </span>
                        <span className="m-talk-pct">{s.pct}%</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="m-find">
                  <Search size={16} aria-hidden="true" />
                  <input value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), step(e.shiftKey ? -1 : 1))} placeholder={t('Find in transcript')} aria-label={t('Find in transcript')} enterKeyHint="search" />
                  {needle && <span className="m-find-n">{hits.length ? t('{n} of {total}', { n: Math.min(hit, hits.length - 1) + 1, total: hits.length }) : t('No matches')}</span>}
                  <button type="button" className="icon-btn" disabled={!hits.length} onClick={() => step(-1)} aria-label={t('Previous match')}>
                    <ChevronUp size={18} />
                  </button>
                  <button type="button" className="icon-btn" disabled={!hits.length} onClick={() => step(1)} aria-label={t('Next match')}>
                    <ChevronDown size={18} />
                  </button>
                  {find && (
                    <button type="button" className="icon-btn" onClick={() => setFind('')} aria-label={t('Clear')}>
                      <X size={18} />
                    </button>
                  )}
                </div>
                {only !== null && (
                  <div className="m-only">
                    <span>{t('Only {name}’s lines', { name: only || t('Unknown') })}</span>
                    <button type="button" className="link-btn" onClick={() => setOnly(null)}>
                      {t('Show everyone')}
                    </button>
                  </div>
                )}
              </>
            )}
            <div ref={trBox} className="m-tl-list">
            {shownLines.map(({ l, i }) => (
              <button key={i} data-line={i} className={`tl ${time >= l.at && time < (lines[i + 1]?.at ?? Infinity) && playing ? 'now' : ''}${i === hitAt ? ' hit' : ''}`} onClick={() => seek(l.at)}>
                {/* Phones: the speaker's face, name and time on one line, the words under the name. */}
                {phone && <Avatar person={userOf(l.speaker) ?? { name: l.speaker || t('Unknown'), email: '' }} size={32} />}
                <time>{mmss(l.at)}</time>
                <b className="tl-who" {...speakerProps(l.speaker)}>{l.speaker || t('Unknown')}</b>
                <span>{marked(l.text, hits.includes(i))}</span>
              </button>
            ))}
            </div>
            {!m.transcript?.length && <EmptyState compact text={live ? t('Waiting for people to talk.') : t('No transcript.')} />}
            <div ref={tEnd} />
          </div>
        )}

        {tab === 'log' && (
          <pre className="m-log">{(m.log ?? []).map((l) => `${logTime(l.at)}  ${l.message}`).join('\n') || t('Nothing logged yet.')}</pre>
        )}
        </TabPane>
      </div>

      <Popover anchor={accessBtn} open={accessOpen} onClose={() => setAccessOpen(false)} width={320} title={t('Who can see this meeting')}>
        <div className="access-pop">
          <label>{t('Who can watch the recording')}</label>
          <Select
            value={m.access?.watch ?? 'everyone'}
            onChange={(v) => p.onPatch(m.id, { access: { watch: v, download: m.access?.download ?? false, transcript: m.access?.transcript ?? 'everyone' } })}
            label={t('Who can watch')}
            options={[
              { value: 'everyone', label: t('Everyone in the company') },
              { value: 'attendees', label: t('Only people who were in the meeting') },
              { value: 'admins', label: t('Only admins') },
            ]}
          />
          <label>{t('Who sees the transcript')}</label>
          <Select
            value={m.access?.transcript ?? 'everyone'}
            onChange={(v) => p.onPatch(m.id, { access: { watch: m.access?.watch ?? 'everyone', download: m.access?.download ?? false, transcript: v } })}
            label={t('Transcript')}
            options={[
              { value: 'everyone', label: t('Everyone in the company') },
              { value: 'attendees', label: t('Only people who were in the meeting') },
            ]}
          />
          <div className="set-row m-access-switch">
            <span>{t('Allow downloading the recording')}</span>
            <button type="button" role="switch" aria-checked={m.access?.download ?? false} aria-label={t('Allow downloading the recording')} className={`switch ${m.access?.download ? 'on' : ''}`} onClick={() => p.onPatch(m.id, { access: { watch: m.access?.watch ?? 'everyone', transcript: m.access?.transcript ?? 'everyone', download: !m.access?.download } })}>
              <span />
            </button>
          </div>
          {client && (
            <div className="set-row m-access-switch">
              <span>{t('{name} sees the notes in their portal', { name: client.name })}</span>
              <button type="button" role="switch" aria-checked={!!m.sharedWithClient} aria-label={t('{name} sees the notes in their portal', { name: client.name })} className={`switch ${m.sharedWithClient ? 'on' : ''}`} onClick={() => p.onPatch(m.id, { sharedWithClient: !m.sharedWithClient })}>
                <span />
              </button>
            </div>
          )}
          <p className="muted small">{t('Recordings never go to the shared space. Use Share for a read-only link.')}</p>
        </div>
      </Popover>
      {ask && <ConfirmSheet title={ask.title} text={ask.text} yes={ask.yes} safe={ask.safe} onYes={ask.run} onClose={() => setAsk(null)} />}
      {spkMenu.menu}
      {renaming !== null && <WhoIsThis from={renaming} users={p.users} onPick={(name, u) => rename(renaming, name, u)} onClose={() => setRenaming(null)} />}
      {recapOpen && (
        <RecapSheet
          title={t('Recap: {title}', { title: m.title })}
          text={recapText()}
          to={recapTo}
          channel={recapChan}
          onEmail={p.onRecapEmail ? (body) => (p.onRecapEmail!(t('Recap: {title}', { title: m.title }), body, recapTo), setRecapOpen(false)) : undefined}
          onPost={recapChan && p.onRecapPost ? (body) => (p.onRecapPost!(recapChan.id, body), setRecapOpen(false)) : undefined}
          onClose={() => setRecapOpen(false)}
        />
      )}
      {addOpen && (
        <Sheet
          title={t('New task')}
          onClose={() => setAddOpen(false)}
          className="mt-quick"
          footer={
            <button type="button" className="primary-btn" disabled={!newTask.trim()} onClick={() => (p.onAddTask({ title: newTask.trim(), userId: p.me, meetingId: m.id, clientId: m.clientId }), setNewTask(''), setAddOpen(false))}>
              {t('Add task')}
            </button>
          }
        >
          <input className="mt-quick-title" autoFocus value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newTask.trim() && (p.onAddTask({ title: newTask.trim(), userId: p.me, meetingId: m.id, clientId: m.clientId }), setNewTask(''), setAddOpen(false))} placeholder={t('What needs doing?')} aria-label={t('Task')} />
        </Sheet>
      )}
    </section>
  );
}

/** "Who is this?": pick a teammate or type a name; it applies to every line of that speaker. */
function WhoIsThis({ from, users, onPick, onClose }: { from: string; users: User[]; onPick: (name: string, u?: User) => void; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const s = typed.trim().toLowerCase();
  const list = users.filter((u) => !u.deletedAt && (!s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)));
  return (
    <Sheet
      title={t('Who is {name}?', { name: from || t('Unknown') })}
      onClose={onClose}
      footer={
        <button type="button" className="primary-btn" disabled={!typed.trim()} onClick={() => onPick(typed.trim())}>
          {t('Use “{name}”', { name: typed.trim() || '…' })}
        </button>
      }
    >
      <p className="m-recap-to">{t('Changes the name on every line they said, and on their action items.')}</p>
      <input className="m-who-type" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && typed.trim() && onPick(typed.trim())} placeholder={t('Search people or type a name')} aria-label={t('Name')} />
      <div className="m-who-list">
        {list.map((u) => (
          <button key={u.id} type="button" className={`m-who-row${u.name === from ? ' on' : ''}`} onClick={() => onPick(u.name, u)}>
            <Avatar person={u} size={32} />
            <span>{u.name}</span>
            <small>{u.title ?? u.email}</small>
          </button>
        ))}
        {!list.length && <EmptyState compact text={t('No teammate by that name. Use the button to keep the name you typed.')} />}
      </div>
    </Sheet>
  );
}

/** Send recap: the notes as an editable message, then Mail to the attendees or a post in the project's chat. */
function RecapSheet({ title, text, to, channel, onEmail, onPost, onClose }: { title: string; text: string; to: { name: string; email: string }[]; channel?: { id: string; name: string }; onEmail?: (body: string) => void; onPost?: (body: string) => void; onClose: () => void }) {
  const [body, setBody] = useState(text);
  return (
    <Sheet
      title={title}
      onClose={onClose}
      size="tall"
      footer={
        <div className="m-recap-foot">
          {onPost && channel && (
            <button type="button" className={onEmail ? 'ghost-btn' : 'primary-btn'} disabled={!body.trim()} onClick={() => onPost(body)}>
              <MessageSquare size={16} /> {t('Post in #{channel}', { channel: channel.name })}
            </button>
          )}
          {onEmail && (
            <button type="button" className="primary-btn" disabled={!body.trim()} onClick={() => onEmail(body)}>
              <Mail size={16} /> {to.length ? t('Email attendees') : t('Write email')}
            </button>
          )}
        </div>
      }
    >
      <p className="m-recap-to">{to.length ? t('To {people}', { people: fmtList(to.map((x) => x.name)) }) : t('No attendee emails found. Add who it goes to in the draft.')}</p>
      <textarea className="m-recap-text" value={body} onChange={(e) => setBody(e.target.value)} aria-label={t('Recap')} />
    </Sheet>
  );
}

/* ---------------- Tasks (shared) ---------------- */

function TaskList(p: MeetProps & { list: Todo[]; meetingFor: (t: Todo) => Meeting | undefined; ownerName?: (t: Todo) => string | undefined; nameFor: (t: Todo) => User | undefined; extra?: React.ReactNode; empty?: React.ReactNode; footer?: React.ReactNode; onSeek?: (ms: number, t: Todo) => void; grouped?: boolean }) {
  const phone = usePhone();
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSel((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));
  const bulk = (a: 'done' | 'reopen' | 'delete') => {
    p.onBulk([...sel], a);
    // Delete's toast (with Undo) comes from the app.
    if (a !== 'delete') p.toast(a === 'done' ? tn(sel.size, '{n} task marked done', '{n} tasks marked done') : tn(sel.size, '{n} task reopened', '{n} tasks reopened'));
    setSel(new Set());
    setSelecting(false);
  };
  const groups: [string, Todo[]][] = p.grouped
    ? [...p.list.reduce((map, t) => map.set(t.meetingId ?? '', [...(map.get(t.meetingId ?? '') ?? []), t]), new Map<string, Todo[]>()).entries()]
    : [['', p.list]];
  return (
    <div className="m-tasks">
      {/* Nothing to select over an empty list. */}
      {(selecting || p.list.length > 0 || !!p.extra) && (
      <div className="bulk-bar">
        {selecting ? (
          <>
            <label className="check-row">
              <input type="checkbox" checked={sel.size === p.list.length && p.list.length > 0} ref={(el) => {
                if (el) el.indeterminate = sel.size > 0 && sel.size < p.list.length;
              }} onChange={() => setSel(sel.size === p.list.length ? new Set() : new Set(p.list.map((tk) => tk.id)))} /> {t('All')}
            </label>
            <span className="muted small">{tn(sel.size, '{n} selected', '{n} selected')}</span>
            <button className="ghost-btn sm" disabled={!sel.size} onClick={() => bulk('done')}>
              {t('Mark done')}
            </button>
            <button className="ghost-btn sm" disabled={!sel.size} onClick={() => bulk('reopen')}>
              {t('Reopen')}
            </button>
            <button className="ghost-btn sm danger-text" disabled={!sel.size} onClick={() => bulk('delete')}>
              {t('Delete')}
            </button>
            <button className="link-btn" onClick={() => (setSelecting(false), setSel(new Set()))}>
              {t('Cancel')}
            </button>
          </>
        ) : (
          <button className="ghost-btn sm" disabled={!p.list.length} onClick={() => setSelecting(true)}>
            <CheckSquare size={13} /> {t('Select')}
          </button>
        )}
        <span className="spacer" />
        {p.extra}
      </div>
      )}
      {p.list.length === 0 && p.empty}
      {groups.map(([mid, list]) => {
        const mt = mid ? p.meetings.find((x) => x.id === mid) : undefined;
        return (
          <div key={mid || 'none'} className="todo-group">
            {p.grouped &&
              (phone ? (
                // Phones: the meeting as a section header in sentence case, its date and project on a quiet line.
                <button className="m-group-phone" onClick={() => mt && p.onPage({ kind: 'meeting', id: mt.id })}>
                  <strong>{mt ? mt.title : t('Added by hand')}</strong>
                  {mt && <small>{[fmtDay(mt.at), mt.clientId ? p.clients.find((c) => c.id === mt.clientId)?.name : ''].filter(Boolean).join(' · ')}</small>}
                </button>
              ) : (
                <button className="d-heading m-group" onClick={() => mt && p.onPage({ kind: 'meeting', id: mt.id })}>
                  {mt ? `${mt.title} · ${fullDate(mt.at)}${mt.clientId ? ` · ${p.clients.find((c) => c.id === mt.clientId)?.name}` : ''}` : t('Added by hand')}
                </button>
              ))}
            {list.map((tk) => {
              const owner = p.ownerName?.(tk);
              const m = p.meetingFor(tk);
              if (phone && !selecting) {
                const person = p.nameFor(tk);
                const who = person?.name ?? owner;
                // Swipe right to tick it off (or reopen it), with Undo; the owner's face on the row.
                return (
                  <SwipeRow key={tk.id} start={[{ id: 'done', label: tk.done ? t('Reopen') : t('Mark done'), icon: CircleCheck, tone: 'ok', run: () => (p.onToggleTask(tk.id), () => p.onToggleTask(tk.id)) }]}>
                  <div className={`m-task-phone${tk.done ? ' done' : ''}`}>
                    <button type="button" className="todo-check" onClick={() => p.onToggleTask(tk.id)} aria-label={tk.done ? t('Reopen') : t('Mark done')} aria-pressed={tk.done}>
                      {tk.done ? <CircleCheck size={20} /> : <span className="mtp-ring" />}
                    </button>
                    <button type="button" className="mtp-main" onClick={() => p.onOpenTask(tk.id)}>
                      <span className="mtp-title">{tk.title}</span>
                      <small className="mtp-meta">
                        {person && <Avatar person={person} size={24} />}
                        {[who ?? t('Unassigned'), tk.due ? fmtDay(tk.due) : ''].filter(Boolean).join(' · ')}
                      </small>
                    </button>
                  </div>
                  </SwipeRow>
                );
              }
              return (
                <div key={tk.id} className={`task m-task ${tk.done ? 'done' : ''}`} onClick={() => selecting && toggle(tk.id)} role="button" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), selecting && toggle(tk.id))}>
                  {selecting && <input type="checkbox" checked={sel.has(tk.id)} onChange={() => toggle(tk.id)} onClick={(e) => e.stopPropagation()} />}
                  <button className="todo-check" onClick={(e) => (e.stopPropagation(), p.onToggleTask(tk.id))} aria-label={tk.done ? t('Reopen') : t('Mark done')} aria-pressed={tk.done}>
                    {tk.done && <span>✓</span>}
                  </button>
                  <input className="task-title" value={tk.title} onChange={(e) => p.onPatchTask(tk.id, { title: e.target.value })} onClick={(e) => e.stopPropagation()} aria-label={t('Task')} />
                  <Select
                    value={tk.userId}
                    onChange={(v) => p.onPatchTask(tk.id, { userId: v })}
                    label={t('Assignee')}
                    className="sel-flat"
                    options={[
                      { value: '', label: owner && !p.users.some((u) => u.name.split(' ')[0] === owner) ? t('{name} (not a member)', { name: owner }) : t('Unassigned') },
                      ...p.users.map((u) => ({ ...personOption(u), label: u.name, icon: <Avatar person={u} size={18} /> })),
                    ]}
                  />
                  <span className="due-pick" onClick={(e) => e.stopPropagation()}>
                    <DatePicker value={tk.due ?? ''} onChange={(v) => p.onPatchTask(tk.id, { due: v || undefined })} label={t('Due')} placeholder={t('No due date')} className="sel-flat" />
                  </span>
                  {tk.saidAt !== undefined && m && (
                    <button className="jump" onClick={(e) => (e.stopPropagation(), p.onSeek ? p.onSeek(tk.saidAt!, tk) : p.onPage({ kind: 'meeting', id: m.id }))} title={t('Jump to when it was said')}>
                      ▶ {mmss(tk.saidAt)}
                    </button>
                  )}
                  <button className="icon-btn sm" onClick={(e) => (e.stopPropagation(), p.onBulk([tk.id], 'delete'))} aria-label={t('Delete task')}>
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
      {p.footer}
    </div>
  );
}

function MeetTasks(p: MeetProps) {
  const phone = usePhone();
  const [tab, setTab] = useState<'open' | 'mine' | 'done' | 'all'>('open');
  const [title, setTitle] = useState('');
  const [who, setWho] = useState('');
  const [due, setDue] = useState('');
  const [adding, setAdding] = useState(false); // phones: the quick add sheet
  const add = () => (p.onAddTask({ title: title.trim(), userId: who, due: due || undefined }), setTitle(''), setDue(''), setAdding(false));
  const whoField = <Select value={who} onChange={setWho} label={t('Assignee')} className="sel-flat" options={[{ value: '', label: t('Unassigned') }, ...p.users.map((u) => ({ ...personOption(u), label: u.name }))]} />;
  const dueField = <DatePicker value={due} onChange={setDue} label={t('Due')} placeholder={t('No due date')} className="sel-flat" />;
  const all = p.tasks.filter((tk) => tk.meetingId || tk.source === 'meeting');
  const list = all.filter((tk) => (tab === 'open' ? !tk.done : tab === 'mine' ? !tk.done && tk.userId === p.me : tab === 'done' ? tk.done : true));
  return (
    <section className="meet-pane view-enter">
      <Head title={t('Tasks from meetings')} sub={t('Action items from every meeting, plus your own.')} onMenu={p.onMenu} />
      <div className="tracking-scroll">
        <div className="client-tabs flat">
          {(['open', 'mine', 'done', 'all'] as const).map((k) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {k === 'open' ? tx('meet', 'Open') : k === 'mine' ? t('Mine') : k === 'done' ? t('Done') : t('All')}
            </button>
          ))}
        </div>
        {phone ? (
          <button type="button" className="mt-add-row" onClick={() => setAdding(true)}>
            <Plus size={20} />
            {t('Add a task')}
          </button>
        ) : (
          <div className="mt-add-wrap">
            <div className="todo-add task-add">
              <Plus size={16} />
              <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && add()} placeholder={t('Add a task…')} />
              {whoField}
              {dueField}
              <button className="primary-btn sm" disabled={!title.trim()} onClick={add}>
                {t('Add')}
              </button>
            </div>
          </div>
        )}
        {adding && (
          <Sheet
            title={t('New task')}
            onClose={() => setAdding(false)}
            className="mt-quick"
            footer={
              <button type="button" className="primary-btn" disabled={!title.trim()} onClick={add}>
                {t('Add task')}
              </button>
            }
          >
            <input className="mt-quick-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && add()} placeholder={t('What needs doing?')} aria-label={t('Task')} />
            <div className="mt-quick-chips">
              {whoField}
              {dueField}
            </div>
          </Sheet>
        )}
        <TaskList
          {...p}
          list={list}
          grouped
          meetingFor={(tk) => p.meetings.find((m) => m.id === tk.meetingId)}
          ownerName={(tk) => p.meetings.find((m) => m.id === tk.meetingId)?.actions.find((a) => a.taskId === tk.id)?.owner}
          nameFor={(tk) => p.users.find((u) => u.id === tk.userId)}
          empty={
          <EmptyState
            compact={!phone}
            icon={phone ? <ListChecks size={28} /> : undefined}
            title={phone ? (tab === 'done' ? t('Nothing finished yet') : t('No open tasks')) : undefined}
            text={tab === 'done' ? t('Tasks you tick off show up here.') : t('Action items from your meetings land here.')}
            action={
              phone && tab !== 'done' ? (
                <button type="button" className="ghost-btn" onClick={() => setAdding(true)}>
                  <Plus size={18} /> {t('Add task')}
                </button>
              ) : undefined
            }
          />
        }
        />
      </div>
    </section>
  );
}

/* ---------------- Folder (client) ---------------- */

function FolderPage(p: MeetProps & { clientId: string }) {
  const c = p.clients.find((x) => x.id === p.clientId);
  const [tab, setTab] = useState<'meetings' | 'tasks'>('meetings');
  const list = p.meetings.filter((m) => m.clientId === p.clientId).sort((a, b) => b.at.localeCompare(a.at));
  const { shown, bar, filtering, clear } = useFilter(list);
  const tasks = p.tasks.filter((tk) => tk.meetingId && list.some((m) => m.id === tk.meetingId));
  const phone = usePhone();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  if (!c) return null;
  const addTask = () => (p.onAddTask({ title: title.trim(), userId: p.me, clientId: c.id }), setTitle(''), setAdding(false));
  const clearBtn = (
    <button type="button" className="ghost-btn" onClick={clear}>
      {t('Clear filters')}
    </button>
  );
  return (
    <section className="meet-pane view-enter">
      <Head
        title={
          <>
            <ProjectBadge p={c} kind="client-dot sm" />{' '}
            {c.name}
          </>
        }
        sub={t('{Project} folder', { project: term.one })}
        onMenu={p.onMenu}
      >
        {/* Phones: Ask AI is in the top bar and the project page is a row below. */}
        {!phone && (
          <>
            <button className="ghost-btn sm" onClick={() => p.onOpenClient(c.id)}>
              {t('{Project} page: overview, mail, files', { project: term.one })}
            </button>
            <button className="ghost-btn sm" onClick={() => p.onAsk({ kind: 'client', id: c.id })}>
              <Sparkles size={13} /> {t('Ask AI')}
            </button>
          </>
        )}
      </Head>
      {phone && (
        <button type="button" className="mf-page" onClick={() => p.onOpenClient(c.id)}>
          <span className="mf-page-text">
            <strong>{t('{Project} page', { project: term.one })}</strong>
            <small>{t('Overview, mail and files')}</small>
          </span>
          <ChevronRight size={20} className="mf-page-chev" />
        </button>
      )}
      <div className="client-tabs">
        {(
          [
            ['meetings', t('Meetings')],
            ['tasks', t('Tasks')],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="tracking-scroll">
        <TabPane key={tab}>
        {tab === 'meetings' && (
          <>
            {list.length > 0 && bar(t('Search this {project}’s meetings', { project: term.one }))}
            <MeetingRows list={shown} clients={p.clients} tasks={p.tasks} onOpen={(id) => p.onPage({ kind: 'meeting', id })} />
            {!shown.length &&
              (filtering ? (
                <EmptyState compact={!phone} title={t('Nothing matches')} text={t('Try another word or show all meetings.')} action={clearBtn} />
              ) : (
                <EmptyState
                  compact={!phone}
                  icon={<Video size={28} />}
                  title={t('No meetings yet')}
                  text={t('Meetings filed under {project} show up here.', { project: c.name })}
                  action={
                    p.canSendBot !== false ? (
                      <button type="button" className="primary-btn" onClick={p.onSend}>
                        <Bot size={18} /> {t('Send notetaker')}
                      </button>
                    ) : undefined
                  }
                />
              ))}
          </>
        )}
        {tab === 'tasks' && (
          <TaskList
            {...p}
            list={tasks}
            grouped
            meetingFor={(tk) => p.meetings.find((m) => m.id === tk.meetingId)}
            nameFor={(tk) => p.users.find((u) => u.id === tk.userId)}
            empty={
              <EmptyState
                compact={!phone}
                icon={<ListChecks size={28} />}
                title={t('No tasks yet')}
                text={t('Promises made in a meeting become tasks here.')}
                action={
                  <button type="button" className="ghost-btn" onClick={() => setAdding(true)}>
                    <Plus size={18} /> {t('Add task')}
                  </button>
                }
              />
            }
          />
        )}
        </TabPane>
      </div>
      {adding && (
        <Sheet
          title={t('New task')}
          onClose={() => setAdding(false)}
          className="mt-quick"
          footer={
            <button type="button" className="primary-btn" disabled={!title.trim()} onClick={addTask}>
              {t('Add task')}
            </button>
          }
        >
          <input className="mt-quick-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && addTask()} placeholder={t('What needs doing?')} aria-label={t('Task')} />
        </Sheet>
      )}
    </section>
  );
}

/* ---------------- Upcoming ---------------- */

/** The event's video call: a real link, or in the demo a place that just says Zoom or Google Meet. */
const linkOf = (e: CalEvent, demo?: boolean): MeetingKind | null => meetingLinkOf(e)?.kind ?? (demo ? (/zoom/i.test(e.location ?? '') ? 'zoom' : /meet|google/i.test(e.location ?? '') ? 'meet' : null) : null);

function Upcoming(p: MeetProps) {
  const mode = p.settings.joinMode ?? 'accepted';
  const now = Date.now();
  const week = p.events.filter((e) => !e.allDay && new Date(e.end).getTime() > now && new Date(e.start).getTime() < now + 7 * 86_400_000).sort((a, b) => a.start.localeCompare(b.start));
  // Only calls the notetaker can join (Read AI's list); the rest are one quiet line at the end.
  const soon = week.filter((e) => linkOf(e, p.demo));
  const noLink = week.length - soon.length;
  const days = [...new Set(soon.map((e) => new Date(e.start).toDateString()))];
  const dayName = (d: string) => (d === new Date().toDateString() ? t('Today') : d === new Date(now + 86_400_000).toDateString() ? t('Tomorrow') : fmtDate(new Date(d), { weekday: 'long', day: 'numeric', month: 'short' }));
  const joins = (e: CalEvent) => {
    const k = linkOf(e, p.demo);
    if (!k || !notetakerJoins(k)) return false;
    if (e.id in p.overrides) return p.overrides[e.id];
    return joinsByRule(e, mode, isMine);
  };
  const live = p.autoJoin === 'live';
  const admin = p.myRole !== 'member';
  const modeLabel = t(JOIN_MODES.find((x) => x.value === mode)?.label ?? '');
  return (
    <section className="meet-pane view-enter">
      <Head title={t('Upcoming')} sub={p.calendarsSyncedAt ? t('From your calendars · updated {ago}', { ago: relative(p.calendarsSyncedAt) }) : t('From your calendar')} onMenu={p.onMenu}>
        {p.onSyncCalendars && (
          <button className="ghost-btn sm" onClick={p.onSyncCalendars}>
            <RefreshCw size={13} /> {t('Update now')}
          </button>
        )}
      </Head>
      <div className="tracking-scroll">
        <div className="side-card upcoming-set">
          <span>
            <strong>{t('Notetaker joins automatically')}</strong>
            <small>
              {p.autoJoin === 'off'
                ? t('The notetaker isn’t available on this server yet, so it can’t join meetings. Recordings and notes start working as soon as it is.')
                : admin
                  ? t('{mode}, a minute before the start. Read only: it never changes your calendar.', { mode: modeLabel })
                  : t('{mode}, for everyone in the company. An admin can change it in Settings, Meetings. Use the switch on a meeting to change just that one.', { mode: modeLabel })}
            </small>
          </span>
          {p.autoJoin !== 'off' && admin && <Select value={mode} onChange={p.onJoinMode} label={t('Notetaker joins automatically')} width={280} options={JOIN_MODES.map((x) => ({ value: x.value, label: t(x.label), hint: t(x.hint) }))} />}
        </div>
        {days.map((d) => (
          <div key={d} className="todo-group">
            <div className="d-heading">{dayName(d)}</div>
            {soon
              .filter((e) => new Date(e.start).toDateString() === d)
              .map((e) => {
                const link = linkOf(e, p.demo);
                const url = meetingLinkOf(e)?.url;
                const bot = !!link && notetakerJoins(link) && p.autoJoin !== 'off';
                const mid = p.sentEvents[e.id];
                const mt = mid ? p.meetings.find((x) => x.id === mid) : undefined;
                const startsSoon = new Date(e.start).getTime() - now < 15 * 60_000;
                // With the real notetaker, the server sends it by itself a minute or two before the start.
                const willJoin = live && bot && !mt && new Date(e.start).getTime() > now - 60_000 && joins(e);
                return (
                  <div key={e.id} className="ev-row">
                    <time>
                      {fmtTime(e.start)}
                      <small>{fmtTime(e.end)}</small>
                    </time>
                    <span className="ev-main">
                      <strong>{e.title}</strong>
                      <small>
                        {link ? MEETING_NAME[link] : t('No meeting link')}
                        {link && !notetakerJoins(link) ? ` · ${t('the notetaker can’t join this yet')}` : ''}
                        {e.guests?.length ? ` · ${tn(e.guests.length, '{n} other', '{n} others')}` : ''}
                      </small>
                    </span>
                    {mt ? (
                      <button className="link-btn" onClick={() => p.onPage({ kind: 'meeting', id: mt.id })}>
                        <StatusPill m={mt} />
                      </button>
                    ) : (
                      bot &&
                      startsSoon &&
                      !willJoin && (
                        <button className="ghost-btn sm" onClick={() => p.onSendNow(e)}>
                          <Send size={13} /> {t('Send now')}
                        </button>
                      )
                    )}
                    {url && startsSoon && (
                      <a className="ghost-btn sm" href={url} target="_blank" rel="noopener noreferrer">
                        <Video size={13} /> {t('Join')}
                      </a>
                    )}
                    {bot && !mt && (
                      <label className="ev-switch" title={t('Notetaker')}>
                        <span className="muted small">{t('Notetaker')}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={joins(e)}
                          className={`switch ${joins(e) ? 'on' : ''}`}
                          onClick={() => {
                            const want = !joins(e);
                            p.onOverride(e.id, want === joinsByRule(e, mode, isMine) ? null : want);
                          }}
                        >
                          <span />
                        </button>
                      </label>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
        {noLink > 0 && <p className="muted small ev-nolink">{tn(noLink, '{n} more without a call link', '{n} more without a call link')}</p>}
        {!soon.length && <EmptyState compact text={t('No meetings in the next 7 days. Connect a calendar in Calendar, or send the notetaker to a meeting link.')} />}
      </div>
    </section>
  );
}

/* ---------------- Send notetaker ---------------- */

export function SendBotDialog({ clients, botName, languages, real, workspaceId, isOwner, seed, upcoming, demo, onSendEvent, onSend, onClose }: { clients: Client[]; botName: string; languages?: string[]; real?: boolean; workspaceId?: string; isOwner?: boolean; seed?: { title: string; note?: string }; upcoming?: CalEvent[]; demo?: boolean; onSendEvent?: (e: CalEvent) => void; onSend: (d: { url: string; title: string; botName: string; clientId: string; language?: string }) => void; onClose: () => void }) {
  const phone = usePhone();
  // The real notetaker: this month's hours left on the plan (the server stops it when they run out).
  const [minutes, setMinutes] = useState<{ used: number; left: number | null; total: number | null } | null>(null);
  useEffect(() => {
    if (!real || !workspaceId) return;
    let on = true;
    void fetch(`/api/meet/status?ws=${encodeURIComponent(workspaceId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { minutes?: { used: number; left: number | null; total: number | null } } | null) => on && setMinutes(d?.minutes ?? null), () => {});
    return () => {
      on = false;
    };
  }, [real, workspaceId]);
  const usedUp = !!minutes && minutes.left !== null && minutes.left < 1;
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('');
  const [title, setTitle] = useState(seed?.title ?? '');
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [err, setErr] = useState('');
  // Phones: one of the next calls, picked by tapping its row (Send at the top sends it).
  const [picked, setPicked] = useState<CalEvent | null>(null);
  const send = () => {
    if (picked && !url.trim() && onSendEvent) return onSendEvent(picked);
    if (!/^https?:\/\/(meet\.google\.com|[\w.-]*zoom\.us)\//i.test(url.trim())) return setErr(t('Paste a Google Meet or Zoom link'));
    onSend({ url: url.trim(), title: title.trim(), botName: name.trim() || botName, clientId, language: language || undefined });
  };
  const minutesNote = minutes && minutes.total !== null && minutes.left !== null && (
    <p className={usedUp ? 'warn-note small' : 'muted small'}>
      {usedUp
        ? isOwner
          ? t('The notetaker’s {hours} for this month are used up. Add 10 more hours in Settings, Plan & billing, Add-ons, or it starts again on the 1st.', { hours: hoursOf(minutes.total) })
          : t('The notetaker’s {hours} for this month are used up. An owner can add 10 more hours in Settings, Plan & billing, or it starts again on the 1st.', { hours: hoursOf(minutes.total) })
        : t('{left} of the notetaker’s {total} left this month. It leaves the meeting when they run out.', { left: hoursOf(minutes.left), total: hoursOf(minutes.total) })}
    </p>
  );

  // Phones (Google Meet's "Take notes"): the next calls first, one tap each; or paste a link. Send at the top right.
  if (phone) {
    const now = Date.now();
    const next = seed
      ? []
      : (upcoming ?? [])
          .filter((e) => !e.allDay && callOf(e, demo) && notetakerJoins(callOf(e, demo)!) && new Date(e.end).getTime() > now && new Date(e.start).getTime() < now + 86_400_000)
          .sort((a, b) => a.start.localeCompare(b.start))
          .slice(0, 3);
    const paste = async () => {
      try {
        const v = (await navigator.clipboard.readText()).trim();
        if (v) (setUrl(v), setErr(''), setPicked(null));
      } catch {
        setErr(t('Couldn’t read what you copied. Paste it into the field instead.'));
      }
    };
    return (
      <Sheet
        onClose={onClose}
        label={t('Send notetaker')}
        className="tn-sheet"
        size="tall"
        head={
          <>
            <button type="button" className="icon-btn qc-x" onClick={onClose} aria-label={t('Close')}>
              <X size={22} />
            </button>
            <h2 className="sheet-title tn-title">{t('Send notetaker')}</h2>
            <span className="spacer" />
            <button type="button" className="primary-btn qc-save" onClick={send} disabled={usedUp || (!url.trim() && !picked)}>
              {t('Send')}
            </button>
          </>
        }
      >
        <div className="tn-body">
          {seed && <p className="tn-note">{seed.note ? t('{note} If the meeting also has a Google Meet or Zoom link, paste it here.', { note: t(seed.note) }) : t('“{title}” has no meeting link yet. Paste its Google Meet or Zoom link to send the notetaker. Someone in the call has to let it in.', { title: seed.title })}</p>}
          {next.length > 0 && onSendEvent && (
            <>
              <div className="ad-heading">{t('Your next calls')}</div>
              {next.map((e) => (
                <button key={e.id} type="button" className={`tn-call${picked?.id === e.id ? ' on' : ''}`} aria-pressed={picked?.id === e.id} onClick={() => (setPicked(picked?.id === e.id ? null : e), setUrl(''), setErr(''))}>
                  <CallMark kind={callOf(e, demo)} />
                  <span className="mh-text">
                    <strong>{e.title}</strong>
                    <small>
                      {fmtTime(e.start)} · {MEETING_NAME[callOf(e, demo)!]}
                    </small>
                  </span>
                  <span className="tn-pick" aria-hidden="true">{picked?.id === e.id && <Check size={20} />}</span>
                </button>
              ))}
              <div className="ad-heading">{t('Or paste a link')}</div>
            </>
          )}
          <div className="er-row tn-link">
            <span className="er-icon">
              <Link2 size={20} />
            </span>
            <span className="er-body">
              <span className="er-field">
                <input className="er-input" value={url} onChange={(e) => (setUrl(e.target.value), setErr(''), setPicked(null))} placeholder={t('Meet or Zoom link')} inputMode="url" aria-label={t('Meeting link')} onKeyDown={(e) => e.key === 'Enter' && send()} />
                {!url && (
                  <button type="button" className="icon-btn tn-paste" onClick={() => void paste()} aria-label={t('Paste')} title={t('Paste')}>
                    <ClipboardPaste size={20} />
                  </button>
                )}
              </span>
            </span>
          </div>
          {err && <p className="err tn-err">{err}</p>}
          <div className="er-group">
            <div className="er-row">
              <span className="er-icon">
                <FileText size={20} />
              </span>
              <span className="er-body">
                <input className="er-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('Title (optional)')} aria-label={t('Title (optional)')} />
              </span>
            </div>
            <div className="er-row">
              <span className="er-icon">
                <Folder size={20} />
              </span>
              <span className="er-body">
                <ProjectPicker value={clientId} onChange={setClientId} projects={clients} none={t('Filed automatically')} label={t('Folder')} className="er-sel" />
              </span>
            </div>
            <div className="er-row">
              <span className="er-icon">
                <Languages size={20} />
              </span>
              <span className="er-body">
                <Select<string>
                  value={language}
                  onChange={setLanguage}
                  label={t('Spoken in')}
                  className="er-sel"
                  options={[{ value: '', label: languagesLabel(languages), hint: t('Your company’s meeting languages') }, ...MEETING_LANGUAGES.map((l) => ({ value: l.code, label: t(l.label), hint: t('Just this meeting') }))]}
                />
              </span>
            </div>
            <div className="er-row">
              <span className="er-icon">
                <Bot size={20} />
              </span>
              <span className="er-body">
                <input className="er-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={botName} aria-label={t('Notetaker name, for this meeting')} />
              </span>
            </div>
          </div>
          {!real && <p className="tn-note">{t('Demo: no real notetaker is sent. You’ll see it join, record a short sample conversation and write the notes.')}</p>}
          {minutesNote && <div className="tn-note">{minutesNote}</div>}
        </div>
      </Sheet>
    );
  }

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label={t('Send notetaker')} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && !document.querySelector('.pop') && onClose()}>
        <header className="modal-head">
          <span className="dump-title">
            <Bot size={15} /> {t('Send notetaker')}
          </span>
          <button className="icon-btn sm" onClick={onClose} aria-label={t('Close')}>
            <X size={15} />
          </button>
        </header>
        <div className="modal-body connect-form">
          <SmoothHeight>
          <p className="modal-intro">{seed ? (seed.note ? t('{note} If the meeting also has a Google Meet or Zoom link, paste it here.', { note: t(seed.note) }) : t('“{title}” has no meeting link yet. Paste its Google Meet or Zoom link to send the notetaker. Someone in the call has to let it in.', { title: seed.title })) : t('Paste a Google Meet or Zoom link. Someone in the call has to let the notetaker in.')}</p>
          <label className="field">
            <span>{t('Meeting link')}</span>
            <input autoFocus value={url} onChange={(e) => (setUrl(e.target.value), setErr(''))} placeholder="https://meet.google.com/abc-defg-hij" onKeyDown={(e) => e.key === 'Enter' && send()} />
          </label>
          {err && <p className="err">{err}</p>}
          <label className="field">
            <span>{t('Title (optional)')}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('Weekly sync with…')} />
          </label>
          <label className="field">
            <span>{t('Notetaker name (optional, for this meeting)')}</span>
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={botName} />
          </label>
          <div className="field">
            <span>{t('Folder (optional, otherwise filed automatically)')}</span>
            <ProjectPicker value={clientId} onChange={setClientId} projects={clients} none={t('Auto')} label={t('Folder')} />
          </div>
          <div className="field">
            <span>{t('Spoken in')}</span>
            <Select<string>
              value={language}
              onChange={setLanguage}
              label={t('Spoken in')}
              options={[{ value: '', label: languagesLabel(languages), hint: t('Your company’s meeting languages') }, ...MEETING_LANGUAGES.map((l) => ({ value: l.code, label: t(l.label), hint: t('Just this meeting') }))]}
            />
          </div>
          {!real && <p className="muted small">{t('Demo: no real notetaker is sent. You’ll see it join, record a short sample conversation and write the notes.')}</p>}
          {minutesNote}
          </SmoothHeight>
        </div>
        <footer className="modal-foot">
          <span className="spacer" />
          <button className="ghost-btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className="primary-btn" onClick={send} disabled={usedUp}>
            <Send size={14} /> {t('Send notetaker')}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ---------------- Share ---------------- */

export function ShareDialog({ m, onSave, onOff, onPreview, onClose, toast }: { m: Meeting; onSave: (opts: { transcript: boolean; video: boolean }) => void; onOff: () => void; onPreview: () => void; onClose: () => void; toast: (t: string) => void }) {
  const phone = usePhone();
  const hasVideo = m.recording?.keep === 'video' || m.recording?.keep === 'audio';
  const [transcript, setTranscript] = useState(m.share?.transcript ?? true);
  const [video, setVideo] = useState(m.share?.video ?? hasVideo);
  const link = m.share ? `https://meet.sprint2go.com/s/${m.share.token}` : '';
  const save = () => onSave({ transcript, video: video && hasVideo });
  const body = (
    <>
      <p className="modal-intro">{t('Anyone with the link can view a read-only page: summary and tasks, plus the parts you allow below. No login needed.')}</p>
      <label className="set-row toggle-row">
        <span>
          <strong>{t('Include transcript')}</strong>
          <small>{t('The full conversation, line by line')}</small>
        </span>
        <button type="button" role="switch" aria-checked={transcript} className={`switch ${transcript ? 'on' : ''}`} onClick={() => setTranscript(!transcript)}>
          <span />
        </button>
      </label>
      <label className="set-row toggle-row">
        <span>
          <strong>{t('Include recording')}</strong>
          <small>{hasVideo ? t('The meeting recording') : t('This meeting has no recording')}</small>
        </span>
        <button type="button" role="switch" disabled={!hasVideo} aria-checked={video && hasVideo} className={`switch ${video && hasVideo ? 'on' : ''}`} onClick={() => setVideo(!video)}>
          <span />
        </button>
      </label>
      {link && (
        <div className="share-link">
          <input readOnly value={link} onFocus={(e) => e.target.select()} />
          <button className="ghost-btn sm" onClick={() => navigator.clipboard?.writeText(link).then(() => toast(t('Link copied')), () => toast(t('Copying isn’t allowed here')))}>
            {t('Copy link')}
          </button>
          <button className="link-btn" onClick={onPreview}>
            <Eye size={13} /> {t('Preview')}
          </button>
        </div>
      )}
    </>
  );
  // Phones: a sheet with its grab handle and one full-width button; turning the link off is a quiet line in it.
  if (phone)
    return (
      <Sheet
        title={t('Share this meeting')}
        onClose={onClose}
        className="m-share-sheet"
        footer={
          <button type="button" className="primary-btn" onClick={save}>
            {link ? t('Save') : t('Create link')}
          </button>
        }
      >
        {body}
        {link && (
          <button type="button" className="link-btn danger-text m-share-off" onClick={() => confirm(t('Turn off this link? People who have it will no longer see the meeting.')) && onOff()}>
            {t('Turn off link')}
          </button>
        )}
      </Sheet>
    );
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label={t('Share this meeting')} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <header className="modal-head">
          <span className="dump-title">
            <Link2 size={15} /> {t('Share this meeting')}
          </span>
          <button className="icon-btn sm" onClick={onClose} aria-label={t('Close')}>
            <X size={15} />
          </button>
        </header>
        <div className="modal-body">
          <SmoothHeight>
          {body}
          </SmoothHeight>
        </div>
        <footer className="modal-foot">
          {link && (
            <button className="ghost-btn danger-text" onClick={() => confirm(t('Turn off this link? People who have it will no longer see the meeting.')) && onOff()}>
              {t('Turn off link')}
            </button>
          )}
          <span className="spacer" />
          <button className="ghost-btn" onClick={onClose}>
            {t('Close')}
          </button>
          <button className="primary-btn" onClick={save}>
            {link ? t('Save') : t('Create link')}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function SharedPage({ m, brand, tasks, users, onClose }: { m: Meeting; brand: string; tasks: Todo[]; users: User[]; onClose: () => void }) {
  const opts = m.share ?? { transcript: false, video: false };
  return (
    <div className="portal-scrim">
      <div className="preview-bar">
        <Eye size={15} /> {t('Preview of the public link. People see this without signing in.')}
        <span className="spacer" />
        <button className="ghost-btn sm" onClick={onClose}>
          <X size={14} /> {t('Close preview')}
        </button>
      </div>
      <div className="portal">
        <p className="portal-kicker">{t('{brand} · Shared meeting · read only', { brand })}</p>
        <h1 className="m-title">{m.title}</h1>
        <p className="m-sub">
          {[fullDate(m.at), m.minutes ? hoursOf(m.minutes) : '', fmtList(m.attendees)].filter(Boolean).join(' · ')}
        </p>
        {opts.video && (
          <div className="m-player video">
            <span className="m-play">
              <Play size={20} />
            </span>
          </div>
        )}
        <div className="portal-card">
          <h2>{tx('meet', 'Notes')}</h2>
          <p>{m.summary || t('No summary for this meeting.')}</p>
          {(
            [
              [mark('Key points'), m.keyPoints],
              [mark('Decisions'), m.decisions],
              [mark('Open questions'), m.openQuestions],
            ] as const
          ).map(([h, l]) =>
            l?.length ? (
              <div key={h}>
                <h4>{t(h)}</h4>
                <ul>
                  {l.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </div>
        <div className="portal-card">
          <h2>{t('Action items')}</h2>
          <ul className="portal-list">
            {tasks.map((tk) => (
              <li key={tk.id}>
                {tk.done ? '✓' : '○'} <span className="pl-title">{tk.title}</span>
                <span className="muted small">
                  {users.find((u) => u.id === tk.userId)?.name.split(' ')[0] ?? ''}
                  {tk.due ? ` · ${t('due {date}', { date: fmtDay(tk.due) })}` : ''}
                </span>
              </li>
            ))}
            {!tasks.length && m.actions.map((a) => <li key={a.title}>○ {a.title}</li>)}
          </ul>
        </div>
        {opts.transcript && (
          <div className="portal-card">
            <h2>{t('Transcript')}</h2>
            <div className="m-transcript">
              {(m.transcript ?? []).map((l, i) => (
                <div key={i} className="tl">
                  <time>{mmss(l.at)}</time>
                  <b>{l.speaker}</b>
                  <span>{l.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { Mic as MeetIcon };
