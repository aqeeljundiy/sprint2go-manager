import { ProjectBadge } from './ProjectBadge';
import { Fragment, useEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ProjectPicker } from './ProjectPicker';
import { SmoothHeight } from './ui/Smooth';
import { term, brand as product } from '../terms';
import { ChevronDown, Copy, Eye, EyeOff, Fingerprint, Globe, History, NotebookText, KeyRound, Lock, MoreHorizontal, Pencil, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck, Trash2, Upload, Users, X } from 'lucide-react';
import type { Client, Team, User } from '../types';
import { t, tn } from '../i18n';
import { tj } from '../i18n/tj';
import { fmtAgo, fmtDateTime, fmtList } from '../i18n/format';
import { server } from '../sync';
import { isSandboxId } from '../sandbox';
import { Popover } from './ui/Popover';
import { PeoplePicker } from './ui/PeoplePicker';
import { enableQuickUnlock, quickUnlock, quickUnlockAvailable, quickUnlockOff, quickUnlockOn } from '../vaultCrypto';
import { Avatar } from './Avatar';
import { PersonName, usePersonCard } from './ui/PersonCard';
import { TabPane } from './ui/Smooth';
import './vault.css';
import { decryptSecret, encryptSecret, isEncrypted, makeVaultKeys, newItemKeys, rewrapVaultKey, setVaultUnlocked, vaultAnyUnlocked, onVaultLockChange, totp as totpCode, unlockVaultKey, unwrapWith, vaultUnlocked, wrapFor, type VaultKeyRecord, type WrappedKey } from '../vaultCrypto';
import { EmptyState } from './ui/EmptyState';
import { PushScreen } from './ui/PushScreen';
import { Sheet } from './ui/Sheet';
import { SwipeRow } from './ui/SwipeRow';
import { useActionMenu, type SheetAction } from './ui/ActionSheet';
import { Group, GRow } from './ui/Grouped';
import { useLeaving } from './ui/Smooth';
import { useCreateAction, useTitleMenu } from '../mobile/chrome';
import { usePhone } from '../mobile/media';
import { Dot } from './ui/Select';

/** What the browser knows about a login. The password, 2FA secret and notes stay on the server. */
export interface VaultItem {
  id: string;
  workspaceId: string;
  meta: { title: string; url?: string; username?: string; clientId?: string; access: { everyone: boolean; userIds: string[]; teamIds: string[] }; keys?: Record<string, WrappedKey> };
  hasPassword: boolean;
  hasTotp: boolean;
  hasNotes: boolean;
  createdBy: string;
  updatedAt: string;
  canEdit: boolean;
}

const host = (u?: string) => (u ? u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : '');
const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const d = await r.json().catch(() => ({}));
  // The server answers in English: its fixed messages are translated here (src/i18n/id/vault.ts).
  const error = (d as { error?: string }).error;
  if (!r.ok) throw new Error(error ? t(error) : t('Something went wrong.'));
  return d as T;
};
/** One line of a login's history, a whole sentence from what the server wrote ("copied the password"). */
function logLine(who: ReactNode, what: string): ReactNode {
  switch (what) {
    case 'copied the password':
      return tj('{who} copied the password', { who });
    case 'used a 2FA code':
      return tj('{who} used a 2FA code', { who });
    case 'read the notes':
      return tj('{who} read the notes', { who });
    case 'added it':
      return tj('{who} added it', { who });
    case 'changed it':
      return tj('{who} changed it', { who });
    case 'checked the password health':
      return tj('{who} checked its password health', { who });
  }
  const shared = /^re-shared with (\d+) people$/.exec(what);
  if (shared) return tj('{who} re-shared it with {people}', { who, people: tn(Number(shared[1]), '{n} person', '{n} people') });
  return (
    <>
      {who} {what}
    </>
  );
}
/** Copies, then clears the clipboard after 30 seconds (if this tab still has focus). */
const copySecret = async (text: string) => {
  await navigator.clipboard?.writeText(text);
  setTimeout(() => void navigator.clipboard?.writeText('').catch(() => {}), 30_000);
};

/** The sidebar: all logins, or one client's. */
export function VaultSidebar({ items, clients, filter, onFilter, onNew, workspaceId }: { items: VaultItem[]; clients: Client[]; filter: string; onFilter: (f: string) => void; onNew: () => void; workspaceId?: string }) {
  const withItems = clients.filter((c) => items.some((i) => i.meta.clientId === c.id));
  // Locked: adding a login needs the key, so the button waits until the passphrase is typed.
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onVaultLockChange(redraw), []);
  const locked = !vaultAnyUnlocked();
  const h = useHealth();
  return (
    <>
      <button className="compose-btn" onClick={onNew} disabled={!server.on || isSandboxId(workspaceId) || locked} title={locked ? t('Unlock the Vault first.') : t('Add a login')}>
        <Plus size={16} />
        <span className="sb-label">{t('Add a login')}</span>
      </button>
      <nav className="nav">
        <button className={`nav-item ${filter === '' ? 'active' : ''}`} onClick={() => onFilter('')}>
          <KeyRound size={16} />
          <span className="sb-label">{t('All logins')}</span>
        </button>
        <button className={`nav-item ${filter === 'company' ? 'active' : ''}`} onClick={() => onFilter('company')}>
          <Lock size={16} />
          <span className="sb-label">{t('Company logins')}</span>
        </button>
        {!locked && (
          <button className={`nav-item ${filter === 'attention' ? 'active' : ''}`} onClick={() => onFilter('attention')}>
            <ShieldAlert size={16} />
            <span className="sb-label">{t('Needs attention')}</span>
            {h.checked && h.issues.size > 0 && <span className="count warn-count">{h.issues.size}</span>}
          </button>
        )}
      </nav>
      {withItems.length > 0 && (
        <>
          <div className="nav-heading sb-label">{term.Many}</div>
          <nav className="nav">
            {withItems.map((c) => (
              <button key={c.id} className={`nav-item ${filter === c.id ? 'active' : ''}`} onClick={() => onFilter(c.id)}>
                <ProjectBadge p={c} kind="client-dot" />
                <span className="sb-label">{c.name}</span>
              </button>
            ))}
          </nav>
        </>
      )}
      <p className="muted small sb-label sb-note vault-note">
        <ShieldCheck size={16} /> {t('Logins are kept encrypted. Copying one is logged, and the clipboard clears after 30 seconds.')}
      </p>
    </>
  );
}

/** The logins, with copy username / copy password / 2FA code on each row. */
export function VaultView({
  workspaceId,
  items,
  reload,
  filter,
  clients,
  users,
  teams,
  me,
  isAdmin,
  editing,
  setEditing,
  toast,
  vaultKey,
  onVaultKey,
  adminIds = [],
  onFilter,
}: {
  onFilter?: (f: string) => void; // phones: the title switcher (All logins, Company logins, each project)
  vaultKey?: VaultKeyRecord; // this person's end-to-end keys (none yet: they set a passphrase first)
  onVaultKey: (r: VaultKeyRecord) => void;
  adminIds?: string[]; // admins can always open a login, so they get a key too
  workspaceId: string;
  items: VaultItem[];
  reload: () => void;
  filter: string;
  clients: Client[];
  users: User[];
  teams: Team[];
  me: string;
  isAdmin: boolean;
  editing: VaultItem | 'new' | null;
  setEditing: (v: VaultItem | 'new' | null) => void;
  toast: (t: string) => void;
}) {
  const [code, setCode] = useState<{ id: string; code: string; left: number } | null>(null);
  const [, setTick] = useState(0); // re-render after unlocking
  const [menu, setMenu] = useState<string | null>(null);
  const [reading, setReading] = useState<{ title: string; value: string } | null>(null);
  const [log, setLog] = useState<{ item: VaultItem; rows: { userId: string; what: string; at: string }[] } | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const accessAnchor = useRef<HTMLElement | null>(null);
  const [accessOf, setAccessOf] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const h = useHealth();
  const checkHealth = () => {
    const k = vaultUnlocked(me);
    if (k) runHealth(workspaceId, items, me, k).catch((e) => toast((e as Error).message));
  };
  // "Needs attention" checks on its own the first time it's opened (that's what opening it asks for).
  const open_ = !!vaultUnlocked(me);
  useEffect(() => {
    if (filter === 'attention' && open_ && server.on && !h.checked && !h.running) checkHealth();
  }, [filter, open_]); // eslint-disable-line react-hooks/exhaustive-deps
  // The 2FA code counts down and refreshes itself while it's shown.
  useEffect(() => {
    if (!code) return;
    const timer = setInterval(() => setCode((c) => (c ? { ...c, left: c.left - 1 } : c)), 1000);
    return () => clearInterval(timer);
  }, [code?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (code && code.left <= 0) void showCode(code.id);
  }, [code?.left]); // eslint-disable-line react-hooks/exhaustive-deps
  // Locks itself after 15 minutes with nothing done in the app, like 1Password and Bitwarden: the key leaves memory and
  // the passphrase is asked again. "Lock" in the header does it at once.
  const lock = () => (setVaultUnlocked(me, null), setCode(null), setTick((n) => n + 1));
  useEffect(() => {
    let last = Date.now();
    const seen = () => void (last = Date.now());
    const check = () => vaultUnlocked(me) && Date.now() - last > 15 * 60_000 && lock();
    const timer = setInterval(check, 30_000);
    const events = ['pointerdown', 'keydown'] as const;
    events.forEach((ev) => window.addEventListener(ev, seen, { passive: true }));
    document.addEventListener('visibilitychange', check);
    return () => (clearInterval(timer), events.forEach((ev) => window.removeEventListener(ev, seen)), document.removeEventListener('visibilitychange', check));
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phones: Apple Passwords. Two-line rows, a login opens full screen, + adds one, the title switches the list.
  const phone = usePhone();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<VaultItem | null>(null);
  const [q, setQ] = useState('');
  const usable = server.on && !isSandboxId(workspaceId) && !!vaultUnlocked(me);
  useCreateAction('vault', usable && { label: t('New login'), icon: Plus, run: () => setEditing('new') });
  const projectsWith = clients.filter((c) => items.some((i) => i.meta.clientId === c.id));
  useTitleMenu(
    'vault',
    phone &&
      usable &&
      !!onFilter && {
        label: t('Which logins'),
        value: filter,
        options: [
          { value: '', label: t('All logins'), icon: <KeyRound size={15} /> },
          { value: 'company', label: t('Company logins'), icon: <Lock size={15} /> },
          { value: 'attention', label: t('Needs attention'), icon: <ShieldAlert size={15} /> },
          ...projectsWith.map((c) => ({ value: c.id, label: c.name, group: term.Many, icon: <Dot color={c.color} /> })),
        ],
        onChange: (v) => onFilter(v),
      },
  );

  // The demo company has made-up people: real passwords never go in it.
  if (isSandboxId(workspaceId))
    return (
      <section className="tasks-pane view-enter">
        <EmptyState icon={<KeyRound size={22} />} title={t('The Vault isn’t part of the demo company')} text={t('It keeps real passwords and two-step codes, so it opens in your real company only.')} />
      </section>
    );
  if (!server.on)
    return (
      <section className="tasks-pane view-enter">
        <EmptyState
          icon={<KeyRound size={22} />}
          title={t('The Vault isn’t available here')}
          text={
            // Developer instructions only for developers; everyone else gets what it means for them.
            import.meta.env.DEV
              ? t('Passwords are never kept in the browser. Run the local server (npm run server) and sign in to use it.')
              : t('Passwords are kept on the {product} server, never in the browser. Sign in to your company to open the Vault.', { product: product.name })
          }
        />
      </section>
    );

  // Locked until the passphrase is typed once in this tab: the private key lives only in memory.
  const priv = vaultUnlocked(me);
  /** Every login I hold the key to: wrap it for each allowed person who has a Vault key but no copy yet. */
  const reshareAll = async () => {
    if (!priv) return;
    let people = 0, logins = 0;
    for (const it of items) {
      const mine = it.meta.keys?.[me];
      if (!mine) continue;
      const inTeam = (u: User) => it.meta.access.teamIds.some((tid) => teams.find((x) => x.id === tid)?.members.includes(u.id));
      const missing = users.filter((u) => u.vaultKey && !it.meta.keys?.[u.id] && (adminIds.includes(u.id) || it.meta.access.everyone || it.meta.access.userIds.includes(u.id) || inTeam(u)));
      if (!missing.length) continue;
      try {
        const itemKey = await unwrapWith(priv, mine);
        const keys: Record<string, WrappedKey> = {};
        for (const u of missing) keys[u.id] = await wrapFor(itemKey, u.vaultKey!.pub);
        await api(`/api/vault/${it.id}/keys`, { method: 'POST', body: JSON.stringify({ keys }) });
        people += missing.length;
        logins++;
      } catch (e) {
        toast(e instanceof Error ? e.message : t('Could not re-share a login.'));
      }
    }
    toast(
      logins
        ? t('Re-shared {logins} with {people}.', { logins: tn(logins, '{n} login', '{n} logins'), people: tn(people, '{n} person', '{n} people') })
        : t('Everyone who may open your logins already holds the keys.'),
    );
    reload();
  };
  if (!priv) return <VaultGate record={vaultKey} me={me} onUnlocked={(k, record) => (setVaultUnlocked(me, k), record && onVaultKey(record), setTick((n) => n + 1), reload())} />;

  const shown = items.filter((i) => (filter === '' || filter === 'attention' ? true : filter === 'company' ? !i.meta.clientId : i.meta.clientId === filter));
  const attention = filter === 'attention';
  /** A secret of an end-to-end login, decrypted here; a server-locked (older) one comes back as is. */
  const secretOf = async (it: VaultItem, field: 'password' | 'totp' | 'notes') => {
    const { value } = await api<{ value: string }>(`/api/vault/${it.id}/reveal`, { method: 'POST', body: JSON.stringify({ field }) });
    if (!isEncrypted(value)) return value;
    const w = it.meta.keys?.[me];
    if (!w) throw new Error(t('You don’t hold the key to this login. Ask whoever added it to edit and save it, so it’s shared with you.'));
    return decryptSecret(await unwrapWith(priv, w), value);
  };
  const copyPassword = async (it: VaultItem) => {
    try {
      const value = await secretOf(it, 'password');
      await copySecret(value);
      toast(t('Password for {title} copied. The clipboard clears in 30 seconds', { title: it.meta.title }));
    } catch (e) {
      toast((e as Error).message);
    }
  };
  async function showCode(id: string) {
    try {
      const it = items.find((x) => x.id === id);
      // End-to-end: the secret is decrypted here and the code worked out here. Older logins: the server does it.
      const r = it?.meta.keys ? await totpCode(await secretOf(it, 'totp')) : await api<{ code: string; secondsLeft: number }>(`/api/vault/${id}/code`, { method: 'POST' });
      setCode({ id, code: r.code, left: r.secondsLeft });
    } catch (e) {
      toast((e as Error).message);
    }
  }
  const who = (id: string) => users.find((u) => u.id === id)?.name.split(' ')[0] ?? t('Someone');
  const accessLabel = (it: VaultItem) => {
    if (it.meta.access.everyone) return t('Everyone');
    const names = [...it.meta.access.teamIds.map((tid) => teams.find((x) => x.id === tid)?.name).filter((n): n is string => !!n), ...it.meta.access.userIds.map(who)];
    if (names.length) return fmtList(names);
    return it.createdBy === me ? t('Only you') : t('Only {name}', { name: who(it.createdBy) });
  };
  const current = items.find((i) => i.id === menu);
  const remove = async (it: VaultItem) => {
    try {
      await api(`/api/vault/${it.id}`, { method: 'DELETE' });
      if (openId === it.id) setOpenId(null);
      reload();
      toast(t('Login deleted'));
    } catch (e) {
      toast((e as Error).message);
    }
  };
  /** Asks first: a sheet on phones, the same sheet as a centred panel on wider screens. */
  const askDelete = (it: VaultItem) => setConfirmDel(it);
  const openLog = async (it: VaultItem) => {
    try {
      const { log: rows } = await api<{ log: { userId: string; what: string; at: string }[] }>(`/api/vault/${it.id}/log`);
      setLog({ item: it, rows });
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const copyUsername = (it: VaultItem) => void copySecret(it.meta.username ?? '').then(() => toast(t('Username copied')));
  const copyCode = async (it: VaultItem) => {
    try {
      const r = it.meta.keys ? await totpCode(await secretOf(it, 'totp')) : await api<{ code: string; secondsLeft: number }>(`/api/vault/${it.id}/code`, { method: 'POST' });
      setCode({ id: it.id, code: r.code, left: r.secondsLeft });
      await copySecret(r.code);
      toast(t('Code copied'));
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const faces = (it: VaultItem) => peopleWithAccess(it, users, teams);
  const openAccess = (it: VaultItem, el: HTMLElement | null) => ((accessAnchor.current = el), setAccessOf(it.id));
  const ops: VaultOps = { copyPassword, copyUsername, copyCode, showCode: (id) => void showCode(id), secretOf, askDelete, openLog, edit: (it) => setEditing(it), accessLabel, who, toast, faces, openAccess };
  const logName = (id: string) => {
    const u = users.find((x) => x.id === id);
    if (id === me || !u) return id === me ? t('You') : who(id);
    return <PersonName who={{ userId: u.id, email: u.email, name: u.name }}>{who(id)}</PersonName>;
  };
  const accessItem = items.find((i) => i.id === accessOf) ?? null;
  const accessPop = (
    <AccessPeople it={accessItem} users={users} teams={teams} me={me} anchor={accessAnchor} open={!!accessOf} onClose={() => setAccessOf(null)} onEdit={accessItem?.canEdit ? () => setEditing(accessItem) : undefined} />
  );
  const importer = importing && (
    <VaultImport
      adminIds={adminIds}
      workspaceId={workspaceId}
      clients={clients}
      users={users}
      me={me}
      defaultClient={filter && filter !== 'company' && filter !== 'attention' ? filter : undefined}
      onDone={(n) => (setImporting(false), reload(), toast(tn(n, '{n} login imported', '{n} logins imported')))}
      onClose={() => setImporting(false)}
    />
  );
  const offer = <QuickUnlockOffer me={me} name={users.find((u) => u.id === me)?.name ?? ''} priv={priv} record={vaultKey} toast={toast} />;
  const healthList = <VaultHealthList items={items} run={checkHealth} onChange={(it) => setEditing(it)} phone={phone} />;
  const savedEdit = () => (editing && editing !== 'new' && healthFixed(editing.id), setEditing(null), reload(), toast(t('Login saved')));

  const confirmSheet = confirmDel && (
          <Sheet title={t('Delete “{title}”?', { title: confirmDel.meta.title })} onClose={() => setConfirmDel(null)} className="vp-confirm">
            <p className="vp-confirm-text">{t('Everyone who uses it loses it too. This can’t be undone.')}</p>
            <div className="as-list">
              <button type="button" className="as-item danger" onClick={() => (setConfirmDel(null), void remove(confirmDel))}>
                <Trash2 size={18} className="as-icon" />
                <span className="as-label">{t('Delete login')}</span>
              </button>
              <button type="button" className="as-item" onClick={() => setConfirmDel(null)}>
                <X size={18} className="as-icon" />
                <span className="as-label">{t('Cancel')}</span>
              </button>
            </div>
          </Sheet>
  );

  if (phone) {
    const query = q.trim().toLowerCase();
    const list = shown.filter((it) => !query || `${it.meta.title} ${it.meta.username ?? ''} ${it.meta.url ?? ''}`.toLowerCase().includes(query)).sort((a, b) => a.meta.title.localeCompare(b.meta.title));
    const open = items.find((i) => i.id === openId);
    return (
      <section className="tasks-pane view-enter vault-phone">
        <div className="vp-scroll">
          {offer}
          {attention ? healthList : <>
          {shown.length > 0 && (
            <label className="vp-search">
              <Search size={17} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search')} aria-label={t('Search logins')} enterKeyHint="search" />
              {q && (
                <button type="button" className="vp-clear" onClick={() => setQ('')} aria-label={t('Clear the search')}>
                  <X size={15} />
                </button>
              )}
            </label>
          )}
          {shown.length === 0 ? (
            <EmptyState
              icon={<KeyRound size={22} />}
              title={t('No logins yet')}
              text={usable ? t('Add a client login. Paste its 2FA setup key and the team gets the codes here.') : t('Logins can be added once the server is on and you are in your real company.')}
              action={usable ? <><button type="button" className="primary-btn" onClick={() => setEditing('new')}><Plus size={16} /> {t('Add a login')}</button><button type="button" className="ghost-btn" onClick={() => setImporting(true)}><Upload size={16} /> {t('Import logins')}</button></> : undefined}
            />
          ) : (
            <VaultPhoneList items={list} clients={clients} me={me} ops={ops} onOpen={setOpenId} />
          )}
          {shown.length > 0 && list.length === 0 && <p className="vp-none">{t('No logins with “{query}”.', { query: q.trim() })}</p>}
          {shown.length > 0 && usable && (
            <Group>
              <GRow icon={Upload} plainIcon label={t('Import logins')} onClick={() => setImporting(true)} />
            </Group>
          )}
          {shown.length > 0 && <p className="vp-foot">{t('End-to-end encrypted. Copying a password is logged.')}</p>}
          </>}
        </div>
        {open && <VaultItemScreen it={open} clients={clients} me={me} ops={ops} code={code?.id === open.id ? code : null} onBack={() => setOpenId(null)} />}
        {confirmSheet}
        {accessPop}
        {importer}
        {log && (
          <PushScreen title={t('Activity')} backLabel={log.item.meta.title} onBack={() => setLog(null)} className="g-page">
            <div className="vp-detail">
              {log.rows.length === 0 ? (
                <p className="vp-none">{t('Nobody has used it yet.')}</p>
              ) : (
                <Group>
                  {log.rows.map((r, i) => (
                    <GRow key={i} label={logLine(logName(r.userId), r.what)} value={fmtAgo(r.at)} />
                  ))}
                </Group>
              )}
            </div>
          </PushScreen>
        )}
        {editing && (
          <VaultEditor
            priv={priv}
            adminIds={adminIds}
            item={editing === 'new' ? null : editing}
            defaultClient={filter && filter !== 'company' ? filter : undefined}
            workspaceId={workspaceId}
            clients={clients}
            users={users}
            teams={teams}
            me={me}
            isAdmin={isAdmin}
            onSaved={savedEdit}
            onClose={() => setEditing(null)}
          />
        )}
      </section>
    );
  }

  return (
    <section className="tasks-pane view-enter">
      <header className="tracking-head tasks-head">
        <div className="th-text">
          <h1>{filter === '' ? t('All logins') : attention ? t('Needs attention') : filter === 'company' ? t('Company logins') : (clients.find((c) => c.id === filter)?.name ?? t('Logins'))}</h1>
        </div>
        {priv && items.some((it) => it.meta.keys?.[me]) && (
          <button className="ghost-btn sm" title={t('Give everyone who may open a login the key to it (after they set up their Vault, or lost their passphrase)')} onClick={() => void reshareAll()}>
            <Users size={14} /> {t('Re-share all')}
          </button>
        )}
        {shown.length > 0 && (
          <label className="search vault-search">
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search logins')} aria-label={t('Search logins')} />
          </label>
        )}
        <button className="ghost-btn sm" onClick={() => setImporting(true)} title={t('Import logins from another password manager')}>
          <Upload size={14} /> {t('Import')}
        </button>
        {priv && (
          <button className="ghost-btn sm" onClick={lock} title={t('Lock the Vault: your passphrase is needed to open it again')}>
            <Lock size={14} /> {t('Lock')}
          </button>
        )}
        <button className="primary-btn sm" onClick={() => setEditing('new')}>
          <Plus size={14} /> {t('Add a login')}
        </button>
      </header>
      <div className="tracking-scroll">
        {offer}
        {attention && healthList}
        {!attention && shown.length === 0 && (
          <EmptyState
            icon={<KeyRound size={22} />}
            title={t('No logins here yet')}
            text={t('Add the client logins your team shares (Meta, Shopify, Google Ads). Paste the 2FA setup key and everyone with access gets the codes here, without anyone’s phone.')}
            action={
              <button type="button" className="ghost-btn" onClick={() => setImporting(true)}>
                <Upload size={16} /> {t('Import logins')}
              </button>
            }
          />
        )}
        {!attention && <div className="todo-group">
          {/* The same search as on phones (1Password and Bitwarden open on search). */}
          {shown.filter((it) => !q.trim() || `${it.meta.title} ${it.meta.username ?? ''} ${it.meta.url ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())).map((it) => {
            const c = clients.find((x) => x.id === it.meta.clientId);
            return (
              <div key={it.id} className="task vault-row">
                <span className="vault-icon">{it.meta.title.charAt(0).toUpperCase()}</span>
                <div className="task-main">
                  <span className="task-title-btn">{it.meta.title}</span>
                  <div className="task-meta">
                    {it.meta.username && <span className="src">{it.meta.username}</span>}
                    {it.meta.url && <span className="src">{host(it.meta.url)}</span>}
                    {c && (
                      <span className="client-chip" style={{ ['--c' as string]: c.color }}>
                        {c.name}
                      </span>
                    )}
                    <button type="button" className="src vault-access" onClick={(e) => openAccess(it, e.currentTarget)} title={t('Who sees it')}>
                      <AccessFaces people={faces(it)} /> {accessLabel(it)}
                    </button>
                    {/* Password managers don't show crypto per item; only an older login that still needs re-saving says so. */}
                    {!it.meta.keys && (
                      <span className="src vault-e2e" title={t('Locked by the server. Edit and save to move it to end-to-end')}>
                        <Lock size={11} /> {t('Re-save to encrypt')}
                      </span>
                    )}
                  </div>
                </div>
                {code?.id === it.id ? (
                  <button className="vault-code" onClick={() => void copySecret(code.code).then(() => toast(t('Code copied')))} title={t('Copy the code')}>
                    <b>
                      {code.code.slice(0, 3)} {code.code.slice(3)}
                    </b>
                    <small>{code.left}s</small>
                  </button>
                ) : (
                  it.hasTotp && (
                    <button className="row-act" onClick={() => void showCode(it.id)}>
                      <ShieldCheck size={12} /> {t('2FA code')}
                    </button>
                  )
                )}
                {it.meta.username && (
                  <button className="icon-btn sm" title={t('Copy username')} onClick={() => copyUsername(it)}>
                    <Copy size={14} />
                  </button>
                )}
                {it.hasPassword && (
                  <button className="row-act primary" onClick={() => void copyPassword(it)}>
                    {t('Copy password')}
                  </button>
                )}
                <button
                  className="icon-btn sm"
                  aria-label={t('More')}
                  onClick={(e) => {
                    anchor.current = e.currentTarget;
                    setMenu(it.id);
                  }}
                >
                  <MoreHorizontal size={15} />
                </button>
              </div>
            );
          })}
        </div>}
      </div>

      <Popover anchor={anchor} open={!!current} onClose={() => setMenu(null)} width={230} title={current?.meta.title ?? ''}>
        {current && (
          <div className="sel-pop">
            {current.meta.url && (
              <a className="sel-opt" href={current.meta.url} target="_blank" rel="noreferrer" onClick={() => setMenu(null)}>
                <RefreshCw size={14} /> {t('Open {site}', { site: host(current.meta.url) })}
              </a>
            )}
            {current.hasNotes && (
              <button
                className="sel-opt"
                onClick={async () => {
                  setMenu(null);
                  try {
                    setReading({ title: current.meta.title, value: await secretOf(current, 'notes') });
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                <Eye size={14} /> {t('Read notes')}
              </button>
            )}
            {current.canEdit && (
              <>
                <button className="sel-opt" onClick={() => (setMenu(null), setEditing(current))}>
                  <Pencil size={14} /> {t('Edit and access')}
                </button>
                <button
                  className="sel-opt"
                  onClick={async () => {
                    setMenu(null);
                    try {
                      const { log: rows } = await api<{ log: { userId: string; what: string; at: string }[] }>(`/api/vault/${current.id}/log`);
                      setLog({ item: current, rows });
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }}
                >
                  <History size={14} /> {t('Who used it')}
                </button>
                <button
                  className="sel-opt danger"
                  onClick={async () => {
                    setMenu(null);
                    askDelete(current);
                  }}
                >
                  <Trash2 size={14} /> {t('Delete')}
                </button>
              </>
            )}
          </div>
        )}
      </Popover>

      {editing && (
        <VaultEditor
          priv={priv}
          adminIds={adminIds}
          item={editing === 'new' ? null : editing}
          defaultClient={filter && filter !== 'company' ? filter : undefined}
          workspaceId={workspaceId}
          clients={clients}
          users={users}
          teams={teams}
          me={me}
          isAdmin={isAdmin}
          onSaved={savedEdit}
          onClose={() => setEditing(null)}
        />
      )}
      {reading && (
        <div className="modal-scrim" onMouseDown={() => setReading(null)}>
          <div className="modal vault-log" role="dialog" onMouseDown={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <span className="dump-title">
                <Lock size={15} /> {t('Notes for “{name}”', { name: reading.title })}
              </span>
              <button className="icon-btn sm" onClick={() => setReading(null)} aria-label={t('Close')}>
                <X size={15} />
              </button>
            </header>
            <div className="modal-body">
              <SmoothHeight>
              <p className="vault-notes">{reading.value}</p>
              <p className="muted small">{t('Reading notes is logged, like copying a password.')}</p>
              </SmoothHeight>
            </div>
          </div>
        </div>
      )}
      {log && (
        <div className="modal-scrim" onMouseDown={() => setLog(null)}>
          <div className="modal vault-log" role="dialog" onMouseDown={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <span className="dump-title">
                <History size={15} /> {t('Who used “{name}”', { name: log.item.meta.title })}
              </span>
              <button className="icon-btn sm" onClick={() => setLog(null)} aria-label={t('Close')}>
                <X size={15} />
              </button>
            </header>
            <div className="modal-body">
              <SmoothHeight>
              {log.rows.length === 0 && <EmptyState compact text={t('Nobody has used it yet.')} />}
              <ul className="home-list">
                {log.rows.map((r, i) => (
                  <li key={i} className="vault-log-row">
                    <span>{logLine(<b>{logName(r.userId)}</b>, r.what)}</span>
                    <time dateTime={r.at} title={fmtDateTime(r.at)}>
                      {fmtAgo(r.at)}
                    </time>
                  </li>
                ))}
              </ul>
              </SmoothHeight>
            </div>
          </div>
        </div>
      )}
      {confirmSheet}
      {accessPop}
      {importer}
    </section>
  );
}

/** What a phone row and a login's screen can do; the functions live in VaultView. */
interface VaultOps {
  copyPassword: (it: VaultItem) => Promise<void>;
  copyUsername: (it: VaultItem) => void;
  copyCode: (it: VaultItem) => Promise<void>;
  showCode: (id: string) => void;
  secretOf: (it: VaultItem, field: 'password' | 'totp' | 'notes') => Promise<string>;
  askDelete: (it: VaultItem) => void;
  openLog: (it: VaultItem) => Promise<void>;
  edit: (it: VaultItem) => void;
  accessLabel: (it: VaultItem) => string;
  who: (id: string) => string;
  toast: (t: string) => void;
  faces: (it: VaultItem) => User[];
  openAccess: (it: VaultItem, el: HTMLElement | null) => void;
}

/** The letter tile in a colour of its own, the same for a login every time (Apple's site icons stand in here). */
const TILE = ['#0a84ff', '#30b158', '#ff9500', '#af52de', '#ff3b30', '#12a8c7', '#5856d6', '#ff2d55', '#a2845e'];
function VaultTile({ title, size = 40 }: { title: string; size?: number }) {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className="vp-tile" style={{ width: size, height: size, fontSize: size * 0.45, borderRadius: size / 4, background: TILE[h % TILE.length] }} aria-hidden>
      {title.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/** The A-Z section a login sits under ('#' for digits and symbols). */
const letterOf = (title: string) => {
  const c = title.trim().charAt(0).toUpperCase();
  return /\p{L}/u.test(c) ? c : '#';
};

/** The phone's list: Apple Passwords' rows. Tap opens the login, hold for its menu, swipe left to copy or delete. */
function VaultPhoneList({ items, clients, me, ops, onOpen }: { items: VaultItem[]; clients: Client[]; me: string; ops: VaultOps; onOpen: (id: string) => void }) {
  const rows = useLeaving(items, (i) => i.id);
  return (
    <div className="vp-list">
      {rows.map(({ item, leaving }, i) => {
        const letter = letterOf(item.meta.title);
        return (
          <Fragment key={item.id}>
            {(i === 0 || letterOf(rows[i - 1].item.meta.title) !== letter) && <h3 className="vp-letter">{letter}</h3>}
            <VaultPhoneRow it={item} leaving={leaving} clients={clients} me={me} ops={ops} onOpen={() => onOpen(item.id)} />
          </Fragment>
        );
      })}
    </div>
  );
}

function rowActions(it: VaultItem, ops: VaultOps, onOpen?: () => void): SheetAction[] {
  return [
    ...(it.meta.username ? [{ label: t('Copy username'), icon: Copy, run: () => ops.copyUsername(it) }] : []),
    ...(it.hasPassword ? [{ label: t('Copy password'), icon: KeyRound, run: () => void ops.copyPassword(it) }] : []),
    ...(it.hasTotp ? [{ label: t('Copy 2FA code'), icon: ShieldCheck, run: () => void ops.copyCode(it) }] : []),
    ...(it.meta.url ? [{ label: t('Open {site}', { site: host(it.meta.url) }), icon: Globe, group: 'more', run: () => void window.open(it.meta.url, '_blank', 'noreferrer') }] : []),
    ...(onOpen ? [{ label: t('Who sees it'), icon: Users, hint: ops.accessLabel(it), group: 'more', run: () => ops.openAccess(it, document.activeElement as HTMLElement | null) }] : []),
    ...(it.canEdit ? [{ label: t('Delete'), icon: Trash2, danger: true, group: 'end', run: () => ops.askDelete(it) }] : []),
  ];
}

function VaultPhoneRow({ it, leaving, clients, me, ops, onOpen }: { it: VaultItem; leaving: boolean; clients: Client[]; me: string; ops: VaultOps; onOpen: () => void }) {
  const menu = useActionMenu(() => rowActions(it, ops, onOpen), { title: it.meta.title });
  const shared = it.meta.access.everyone || it.meta.access.userIds.some((id) => id !== me) || it.meta.access.teamIds.length > 0;
  const project = clients.find((c) => c.id === it.meta.clientId);
  return (
    <>
      <SwipeRow
        leaving={leaving}
        className="vp-swipe"
        end={[
          ...(it.hasPassword ? [{ id: 'copy', label: t('Copy password'), icon: Copy, tone: 'accent' as const, run: () => void ops.copyPassword(it) }] : []),
          ...(it.canEdit ? [{ id: 'delete', label: t('Delete'), icon: Trash2, tone: 'danger' as const, run: () => ops.askDelete(it) }] : []),
        ]}
      >
        <div className="vp-row lp" role="button" tabIndex={0} {...menu.bind} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
          <VaultTile title={it.meta.title} />
          <span className="vp-text">
            <span className="vp-title">{it.meta.title}</span>
            <span className="vp-user">{it.meta.username || host(it.meta.url) || (project ? project.name : t('No username'))}</span>
          </span>
          {(it.hasTotp || shared) && (
            <span className="vp-marks">
              {it.hasTotp && <ShieldCheck size={16} className="vp-mark" aria-label={t('Has a 2FA code')} />}
              {shared && <Users size={16} className="vp-mark" aria-label={t('Shared')} />}
            </span>
          )}
          {it.hasPassword && (
            <button type="button" className="vp-copy" aria-label={t('Copy password')} onClick={(e) => (e.stopPropagation(), void ops.copyPassword(it))} onKeyDown={(e) => e.stopPropagation()}>
              <Copy size={18} />
            </button>
          )}
        </div>
      </SwipeRow>
      {menu.menu}
    </>
  );
}

/** The countdown ring next to a 2FA code: a full circle at 30 seconds, empty when the code changes. */
function CodeRing({ left }: { left: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg className="vp-ring" width="20" height="20" viewBox="0 0 20 20" aria-label={t('{n} seconds left', { n: left })}>
      <circle cx="10" cy="10" r={r} className="vp-ring-track" />
      <circle cx="10" cy="10" r={r} className="vp-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(30, left)) / 30)} />
    </svg>
  );
}

/** One login, full screen on a phone (Apple Passwords' detail): copy each field, the 2FA code, who sees it. */
function VaultItemScreen({ it, clients, me, ops, code, onBack }: { it: VaultItem; clients: Client[]; me: string; ops: VaultOps; code: { code: string; left: number } | null; onBack: () => void }) {
  const [pw, setPw] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const project = clients.find((c) => c.id === it.meta.clientId);
  const by = it.createdBy === me ? t('you') : ops.who(it.createdBy);
  const reveal = async (field: 'password' | 'notes') => {
    try {
      const v = await ops.secretOf(it, field);
      if (field === 'password') setPw(v);
      else setNotes(v);
    } catch (e) {
      ops.toast((e as Error).message);
    }
  };
  return (
    <PushScreen
      title={it.meta.title}
      backLabel={t('Vault')}
      onBack={onBack}
      className="g-page vp-screen"
      actions={
        it.canEdit ? (
          <button type="button" className="vp-edit" onClick={() => ops.edit(it)}>
            {t('Edit')}
          </button>
        ) : undefined
      }
    >
      <div className="vp-detail">
        <header className="vp-head">
          <VaultTile title={it.meta.title} size={56} />
          <h2>{it.meta.title}</h2>
          <p>{t('Changed {when} by {name}', { when: fmtAgo(it.updatedAt), name: by })}</p>
        </header>
        <Group>
          {it.meta.username && (
            <GRow
              className="vp-field"
              label={<small className="vp-label">{t('Username')}</small>}
              sub={<span className="vp-value">{it.meta.username}</span>}
              accessory={
                <button type="button" className="g-btn" onClick={() => ops.copyUsername(it)} aria-label={t('Copy username')}>
                  <Copy size={19} />
                </button>
              }
            />
          )}
          {it.hasPassword && (
            <GRow
              className="vp-field"
              label={<small className="vp-label">{t('Password')}</small>}
              sub={<span className={`vp-value${pw == null ? ' dots' : ' mono'}`}>{pw ?? '••••••••••••'}</span>}
              accessory={
                <>
                  <button type="button" className="g-btn" onClick={() => (pw == null ? void reveal('password') : setPw(null))} aria-label={pw == null ? t('Show') : t('Hide')}>
                    {pw == null ? <Eye size={19} /> : <EyeOff size={19} />}
                  </button>
                  <button type="button" className="g-btn" onClick={() => void ops.copyPassword(it)} aria-label={t('Copy password')}>
                    <Copy size={19} />
                  </button>
                </>
              }
            />
          )}
          {it.hasTotp &&
            (code ? (
              <GRow
                className="vp-field"
                label={<small className="vp-label">{t('2FA code')}</small>}
                sub={
                  <span className="vp-code">
                    {code.code.slice(0, 3)} {code.code.slice(3)}
                  </span>
                }
                accessory={
                  <>
                    <CodeRing left={code.left} />
                    <button type="button" className="g-btn" onClick={() => void copySecret(code.code).then(() => ops.toast(t('Code copied')))} aria-label={t('Copy the code')}>
                      <Copy size={19} />
                    </button>
                  </>
                }
              />
            ) : (
              <GRow icon={ShieldCheck} plainIcon label={t('Show the 2FA code')} action onClick={() => ops.showCode(it.id)} />
            ))}
        </Group>
        {(it.meta.url || it.hasNotes || project) && (
          <Group>
            {it.meta.url && <GRow icon={Globe} plainIcon label={t('Website')} value={host(it.meta.url)} onClick={() => void window.open(it.meta.url, '_blank', 'noreferrer')} />}
            {project && <GRow icon={KeyRound} plainIcon label={term.One} value={project.name} />}
            {it.hasNotes &&
              (notes == null ? (
                <GRow icon={NotebookText} plainIcon label={t('Notes')} value={t('Show')} onClick={() => void reveal('notes')} />
              ) : (
                <div className="g-row vp-notes">
                  <span className="g-label">
                    <small className="vp-label">{t('Notes')}</small>
                    <span className="vp-notes-text">{notes}</span>
                  </span>
                </div>
              ))}
          </Group>
        )}
        <Group footer={it.hasNotes && notes != null ? t('Reading notes is logged, like copying a password.') : undefined}>
          <GRow icon={Users} plainIcon label={t('Who sees it')} sub={ops.accessLabel(it)} value={<AccessFaces people={ops.faces(it)} />} onClick={() => ops.openAccess(it, document.activeElement as HTMLElement | null)} />
          {it.canEdit && <GRow icon={History} plainIcon label={t('Activity')} onClick={() => void ops.openLog(it)} />}
        </Group>
        {it.canEdit && (
          <Group>
            <GRow label={t('Delete login')} danger onClick={() => ops.askDelete(it)} />
          </Group>
        )}
        <p className="vp-foot">{it.meta.keys ? t('End-to-end encrypted.') : t('Locked by the server. Edit and save to move it to end-to-end')}</p>
      </div>
    </PushScreen>
  );
}

/** Pull the secret out of an otpauth:// link, or tidy a pasted setup key. */
const parseTotp = (raw: string) => {
  const s = raw.trim();
  if (s.startsWith('otpauth://')) {
    try {
      return new URL(s).searchParams.get('secret') ?? '';
    } catch {
      return s;
    }
  }
  return s.replace(/\s+/g, '');
};
const strongPassword = (length = 20, symbols = true, digits = true) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz' + (digits ? '23456789' : '') + (symbols ? '!@#$%&*?' : '');
  const a = new Uint32Array(length);
  crypto.getRandomValues(a);
  return [...a].map((n) => chars[n % chars.length]).join('');
};

/** The generator's settings, remembered in this browser. */
interface GenOpts {
  mode: 'chars' | 'words';
  length: number; // characters, or words
  symbols: boolean; // words: joined with dashes instead of spaces
  digits: boolean;
}
const loadGen = (): GenOpts => {
  try {
    const o = JSON.parse(localStorage.getItem('vault-gen') ?? 'null');
    if (o && (o.mode === 'chars' || o.mode === 'words') && Number.isFinite(o.length)) return { mode: o.mode, length: o.length, symbols: !!o.symbols, digits: !!o.digits };
  } catch {
    /* the defaults */
  }
  return { mode: 'chars', length: 20, symbols: true, digits: true };
};
const saveGen = (o: GenOpts) => {
  try {
    localStorage.setItem('vault-gen', JSON.stringify(o));
  } catch {
    /* not remembered */
  }
};
/** Short words that are easy to type. Four of them are about 32 bits, plus the capital and the number. */
const WORDS =
  'acid acorn actor adapt agent alarm album alert alien alley amber angle ankle apple april apron arena armor arrow atlas attic audio autumn award bacon badge bagel baker bamboo banjo barn basil beach beard bench berry bison blade blank bloom board bonus boost brave bread brick bride brush bucket buddy cabin cable cactus camel candy canoe canvas cargo carpet cedar chalk charm cherry chess chief cider cinema civic clay cliff clock cloud clover coast cobra cocoa comet coral cotton couch crane crisp crown cubic curry daisy dance delta denim diary dingo disco dolphin donut dragon dream drift drum eagle earth easel echo elbow elder ember empty energy equal fable falcon fancy feast fern ferry fiber field flame flute focus forest fossil frost fruit galaxy garden gecko ginger glass globe glove goose grape gravy guitar habit hammer harbor hazel heart hello honey hotel humble igloo index island ivory jacket jelly jewel jungle kayak kettle kiwi koala label ladder lemon lilac lime linen lotus lunar magic mango maple marble meadow melon metal mint mocha moose motor music nectar noble north novel oasis ocean olive onion opera orbit otter paddle panda paper pearl pepper piano pilot pixel plum polar poppy pulse quartz quiet quill rabbit radar raven ribbon river robin rocket ruby saddle salad salmon sandal satin scout shadow shell silk sketch sofa solar spice spiral spoon spring squid stamp storm sugar summit sunny swan tango teapot tiger timber toast topaz tower trail tulip tunnel turtle velvet violin wagon walnut whale willow window winter wizard yacht yogurt zebra'.split(' ');
const pick = (n: number) => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
};
const makeSecret = (o: GenOpts) => {
  if (o.mode === 'chars') return strongPassword(o.length, o.symbols, o.digits);
  const words = Array.from({ length: o.length }, () => WORDS[pick(WORDS.length)]);
  const cap = pick(words.length);
  words[cap] = words[cap].replace(/^./, (c) => c.toUpperCase());
  if (o.digits) words[pick(words.length)] += String(pick(10));
  return words.join(o.symbols ? '-' : ' ');
};

function VaultEditor({
  priv,
  adminIds,
  item,
  defaultClient,
  workspaceId,
  clients,
  users,
  teams,
  me,
  isAdmin,
  onSaved,
  onClose,
}: {
  priv: CryptoKey;
  adminIds: string[];
  item: VaultItem | null;
  defaultClient?: string;
  workspaceId: string;
  clients: Client[];
  users: User[];
  teams: Team[];
  me: string;
  isAdmin: boolean;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item?.meta.title ?? '');
  const [url, setUrl] = useState(item?.meta.url ?? '');
  const [username, setUsername] = useState(item?.meta.username ?? '');
  const [password, setPassword] = useState(''); // empty = keep the saved one
  const [totp, setTotp] = useState('');
  const [notes, setNotes] = useState('');
  const [clientId, setClientId] = useState(item?.meta.clientId ?? defaultClient ?? '');
  const [everyone, setEveryone] = useState(item?.meta.access.everyone ?? false);
  const [userIds, setUserIds] = useState<string[]>(item?.meta.access.userIds ?? []);
  const [teamIds, setTeamIds] = useState<string[]>(item?.meta.access.teamIds ?? []);
  const [showPw, setShowPw] = useState(false);
  const [gen, setGen] = useState<GenOpts | null>(null);
  const makePw = (o: GenOpts) => (setGen(o), saveGen(o), setPassword(makeSecret(o)), setShowPw(true));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [noKey, setNoKey] = useState<string[]>([]); // people who'd get access but haven't set up their Vault yet
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      // Who may open it: me, admins, and the people and teams chosen (everyone, when it's for everyone).
      const inTeam = (u: User) => teamIds.some((tid) => teams.find((x) => x.id === tid)?.members.includes(u.id));
      const allowed = users.filter((u) => u.id === me || adminIds.includes(u.id) || everyone || userIds.includes(u.id) || inTeam(u));
      const withKey = allowed.filter((u) => u.vaultKey);
      setNoKey(allowed.filter((u) => !u.vaultKey && u.id !== me).map((u) => u.name.split(' ')[0]));
      // The item key: the one this login already has (if I hold it), or a fresh one.
      let itemKey: CryptoKey;
      let keys: Record<string, WrappedKey> = {};
      const mine = item?.meta.keys?.[me];
      if (item?.meta.keys && !mine) throw new Error(t('You don’t hold the key to this login, so you can’t change it. Ask whoever added it to edit and save it, so it’s shared with you.'));
      if (mine) {
        itemKey = await unwrapWith(priv, mine);
        for (const u of withKey) keys[u.id] = item!.meta.keys![u.id] ?? (await wrapFor(itemKey, u.vaultKey!.pub));
      } else {
        const made = await newItemKeys(withKey.map((u) => ({ id: u.id, pub: u.vaultKey!.pub })));
        itemKey = made.key;
        keys = made.keys;
      }
      // Secrets: what was typed, else what's saved. An older server-locked login moves to end-to-end on the way.
      const current = async (field: 'password' | 'totp' | 'notes', has: boolean) => {
        if (!item || !has) return undefined;
        const { value } = await api<{ value: string }>(`/api/vault/${item.id}/reveal`, { method: 'POST', body: JSON.stringify({ field }) });
        return isEncrypted(value) ? (mine ? value : await encryptSecret(itemKey, await decryptSecret(await unwrapWith(priv, mine!), value))) : value ? await encryptSecret(itemKey, value) : undefined;
      };
      const enc = async (v: string) => encryptSecret(itemKey, v);
      await api('/api/vault', {
        method: 'POST',
        body: JSON.stringify({
          id: item?.id,
          workspaceId,
          meta: { title, url: url || undefined, username: username || undefined, clientId: clientId || undefined, access: { everyone, userIds, teamIds }, keys },
          password: password ? await enc(password) : await current('password', !!item?.hasPassword),
          totp: totp ? await enc(parseTotp(totp)) : await current('totp', !!item?.hasTotp),
          notes: notes ? await enc(notes) : await current('notes', !!item?.hasNotes),
        }),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  const phone = usePhone();
  const fields = (
    <>
          <div className="vault-grid">
            <label className="field">
              <span>{t('Name')}</span>
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('e.g. {example}', { example: 'Kopinara Meta Business' })} />
            </label>
            <label className="field">
              <span>{t('Website')}</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://business.facebook.com" />
            </label>
            <label className="field">
              <span>{t('Username or email')}</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </label>
            <div className="field">
              <span>{item?.hasPassword ? t('Password (leave empty to keep it)') : t('Password')}</span>
              <span className="pw-row">
                <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={item?.hasPassword ? '••••••••' : ''} />
                <button type="button" className="icon-btn sm" onClick={() => setShowPw((s) => !s)} title={showPw ? t('Hide') : t('Show')}>
                  <Eye size={14} />
                </button>
                <button type="button" className="ghost-btn sm vault-gen" onClick={() => makePw(gen ?? loadGen())}>
                  {t('Generate')}
                </button>
              </span>
              <div className={`fold${gen ? ' open' : ''}`} aria-hidden={!gen}>
                <div className="fold-in">
                  <div className="vault-gen-opts">
                    <div className="segmented vault-gen-mode" role="group" aria-label={t('Kind of password')}>
                      <button type="button" className={gen?.mode !== 'words' ? 'on' : ''} onClick={() => gen && makePw({ ...gen, mode: 'chars', length: gen.mode === 'words' ? 20 : gen.length })} tabIndex={gen ? 0 : -1}>
                        {t('Characters')}
                      </button>
                      <button type="button" className={gen?.mode === 'words' ? 'on' : ''} onClick={() => gen && makePw({ ...gen, mode: 'words', length: gen.mode === 'words' ? gen.length : 4 })} tabIndex={gen ? 0 : -1}>
                        {t('Words')}
                      </button>
                    </div>
                    <label className="vault-gen-len">
                      <span>{gen?.mode === 'words' ? tn(gen.length, '{n} word', '{n} words') : t('Length {n}', { n: gen?.length ?? 20 })}</span>
                      <input type="range" min={gen?.mode === 'words' ? 3 : 8} max={gen?.mode === 'words' ? 8 : 40} value={gen?.length ?? 20} onChange={(e) => gen && makePw({ ...gen, length: Number(e.target.value) })} tabIndex={gen ? 0 : -1} />
                    </label>
                    <label className="vault-gen-check">
                      <input type="checkbox" checked={gen?.digits ?? true} onChange={(e) => gen && makePw({ ...gen, digits: e.target.checked })} tabIndex={gen ? 0 : -1} /> {t('Numbers')}
                    </label>
                    <label className="vault-gen-check">
                      <input type="checkbox" checked={gen?.symbols ?? true} onChange={(e) => gen && makePw({ ...gen, symbols: e.target.checked })} tabIndex={gen ? 0 : -1} /> {gen?.mode === 'words' ? t('Dashes') : t('Symbols')}
                    </label>
                    <button type="button" className="icon-btn sm" onClick={() => gen && makePw(gen)} aria-label={t('Make another')} title={t('Make another')} tabIndex={gen ? 0 : -1}>
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* The optional parts in one group (on phones, one card), the project as a row with its value on the right. */}
          <div className="vault-grid vault-more">
          <label className="field">
            <span>{item?.hasTotp ? t('2FA setup key (saved; paste a new one to replace it)') : t('2FA setup key (optional)')}</span>
            <input value={totp} onChange={(e) => setTotp(e.target.value)} placeholder={t('Setup key or otpauth link')} autoComplete="off" />
          </label>
          <label className="field">
            <span>{item?.hasNotes ? t('Notes (saved; type to replace)') : t('Notes (optional)')}</span>
            <textarea className="vault-notes-input" rows={3} value={notes} onChange={(e) => { setNotes(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder={t('Backup codes, security questions, who to ask')} autoComplete="off" />
          </label>
          <div className="field vault-project">
            <span>{term.One}</span>
            <ProjectPicker value={clientId} onChange={setClientId} projects={clients} none={t('Company login (no {project})', { project: term.one })} />
          </div>
          </div>
          <div className="field">
            <span>{t('Who can use it')}</span>
            <label className="check-row">
              <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} /> {t('Everyone in the company')}
            </label>
            <div className={`fold ${everyone ? '' : 'open'}`} aria-hidden={everyone}>
              <div className="fold-in">
                <div className="team-toggles">
                  {teams.map((team) => (
                    <button key={team.id} type="button" className={teamIds.includes(team.id) ? 'on' : ''} onClick={() => setTeamIds((x) => (x.includes(team.id) ? x.filter((y) => y !== team.id) : [...x, team.id]))}>
                      <span className="team-square" style={{ background: team.color }} /> {team.name}
                    </button>
                  ))}
                </div>
                <PeoplePicker value={userIds} users={users.filter((u) => u.id !== me)} me={me} onChange={setUserIds} label={t('People')} emptyText={t('Add people')} />
                <small className="muted">
                  {isAdmin
                    ? t('You can always see it. People who haven’t set up their Vault yet get the key once you save again after they do.')
                    : t('You and admins can always see it. People who haven’t set up their Vault yet get the key once you save again after they do.')}
                </small>
                {noKey.length > 0 && <small className="muted">{t('Not set up yet: {names}.', { names: fmtList(noKey) })}</small>}
              </div>
            </div>
          </div>
          {error && <p className="err">{error}</p>}
    </>
  );
  // Phones: a full screen with Cancel and Save at the top (Apple Passwords' New Password), no dialog.
  if (phone)
    return (
      <PushScreen
        title={item ? t('Edit login') : t('New login')}
        backLabel={t('Cancel')}
        onBack={onClose}
        className="g-page vault-edit"
        actions={
          <button type="button" className="vp-edit strong" disabled={!title.trim() || busy} onClick={() => void save()}>
            {busy ? t('Saving…') : t('Save')}
          </button>
        }
      >
        <div className="vault-body vp-form">{fields}</div>
      </PushScreen>
    );
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal vault-modal" role="dialog" aria-label={item ? t('Edit login') : t('Add a login')} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && !document.querySelector('.pop') && onClose()}>
        <header className="modal-head">
          <span className="dump-title">
            <KeyRound size={15} /> {item ? t('Edit “{name}”', { name: item.meta.title }) : t('Add a login')}
          </span>
          <button className="icon-btn sm" onClick={onClose} aria-label={t('Close')}>
            <X size={15} />
          </button>
        </header>
        <div className="modal-body vault-body">
          <SmoothHeight>{fields}</SmoothHeight>
        </div>
        <footer className="modal-foot">
          <span className="spacer" />
          <button className="ghost-btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className="primary-btn" disabled={!title.trim() || busy} onClick={() => void save()}>
            {busy ? t('Saving…') : t('Save login')}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * The door to the Vault: a passphrase that only this person knows. The first time, it makes their key pair and
 * locks the private key with it; after that, it unlocks the key for this tab. Nothing about it reaches the server
 * in the clear, so a lost passphrase can't be recovered: logins would have to be re-shared by others.
 */
function VaultGate({ record, me, onUnlocked }: { record?: VaultKeyRecord; me: string; onUnlocked: (priv: CryptoKey, record?: VaultKeyRecord) => void }) {
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fresh = !record;
  const phone = usePhone();
  const [how, setHow] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [quick, setQuick] = useState(() => !fresh && quickUnlockOn(me, record));
  const tryQuick = async () => {
    setBusy(true);
    setError('');
    try {
      onUnlocked(await quickUnlock(me));
    } catch (e) {
      if ((e as Error).name !== 'NotAllowedError') setError(t('Quick unlock didn’t work. Use your passphrase.'));
    }
    setBusy(false);
  };
  // A rough strength: length, plus a little for mixing kinds of characters. 0 to 4.
  const strength = !pass ? 0 : Math.min(4, Math.floor(pass.length / 6) + (/[^a-zA-Z]/.test(pass) && /[a-zA-Z]/.test(pass) ? 1 : 0));
  const go = async () => {
    setBusy(true);
    setError('');
    try {
      if (fresh) {
        if (pass.length < 8) throw new Error(t('Use at least 8 characters.'));
        if (pass !== again) throw new Error(t('The two don’t match.'));
        const made = await makeVaultKeys(pass);
        onUnlocked(made.priv, made.record);
      } else onUnlocked(await unlockVaultKey(record!, pass));
    } catch (e) {
      setError(fresh ? (e as Error).message : t('That’s not it. Try again.'));
    }
    setBusy(false);
  };
  // Phones: no card, top-aligned so the keyboard never covers the field, and words for a phone (no "tab").
  const phoneText = fresh ? t('Logins are encrypted with keys only you hold. This passphrase locks your key, and it can’t be reset.') : t('Your passphrase opens it on this device until you close {product}.', { product: product.name });
  return (
    <section className="tasks-pane view-enter">
      <div className="vault-gate">
        <div className="vault-gate-card">
          {phone ? <Lock size={44} /> : <KeyRound size={22} />}
          <h2>{fresh ? t('Set your Vault passphrase') : phone ? t('Vault is locked') : t('Unlock the Vault')}</h2>
          <p className="muted">
            {phone
              ? phoneText
              : fresh
                ? t('Logins are encrypted on your devices with keys only you hold; the server never sees a password. This passphrase locks your key. There is no reset: if it’s lost, teammates re-share logins with you.')
                : t('Your key stays in this tab until you close it.')}
          </p>
          {phone && fresh && (
            <>
              <button type="button" className="vg-how" aria-expanded={how} onClick={() => setHow((h) => !h)}>
                {t('How it works')}
                <ChevronDown size={16} style={{ transform: how ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} aria-hidden />
              </button>
              <div className={`fold${how ? ' open' : ''}`} aria-hidden={!how}>
                <div className="fold-in">
                  <p className="muted vg-how-text">{t('If you forget it, nobody can open your logins, not even an admin. Set a new passphrase, and anyone who still has a login can share it with you again.')}</p>
                </div>
              </div>
            </>
          )}
          {quick && (
            <div className="vg-quick">
              <button type="button" className="primary-btn" disabled={busy} onClick={() => void tryQuick()}>
                <Fingerprint size={18} /> {phone ? t('Unlock with Face ID or fingerprint') : t('Unlock with Face ID, fingerprint or Windows Hello')}
              </button>
              <button type="button" className="link-btn small" onClick={() => (quickUnlockOff(me), setQuick(false))}>
                {t('Turn off quick unlock on this device')}
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void go();
            }}
          >
            <span className="vg-pass">
              <input type={showPass ? 'text' : 'password'} autoFocus={!phone} value={pass} onChange={(e) => setPass(e.target.value)} placeholder={t('Passphrase')} aria-label={t('Passphrase')} autoComplete={fresh ? 'new-password' : 'current-password'} />
              <button type="button" className="vg-eye" onClick={() => setShowPass((s) => !s)} aria-label={showPass ? t('Hide') : t('Show')} aria-pressed={showPass}>
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
            {fresh && (
              <span className="vg-meter" data-level={strength} role="meter" aria-label={t('Passphrase strength')} aria-valuemin={0} aria-valuemax={4} aria-valuenow={strength}>
                <i /><i /><i /><i />
              </span>
            )}
            {fresh && <input type={showPass ? 'text' : 'password'} value={again} onChange={(e) => setAgain(e.target.value)} placeholder={t('Confirm passphrase')} aria-label={t('Confirm passphrase')} autoComplete="new-password" />}
            {error && <p className="err small">{error}</p>}
            <button className={quick ? 'ghost-btn' : 'primary-btn'} disabled={busy || !pass}>
              {busy && !quick ? t('Working…') : fresh ? t('Set and open') : t('Unlock')}
            </button>
          </form>

        </div>
      </div>
    </section>
  );
}

/** A new passphrase for the same keys (for the header's "Change passphrase"). */
export async function changeVaultPassphrase(me: string, record: VaultKeyRecord, next: string) {
  const priv = vaultUnlocked(me);
  if (!priv) throw new Error(t('Unlock the Vault first.'));
  return rewrapVaultKey(priv, record.pub, next);
}

/* ---------- who sees a login: faces, and the list behind them ---------- */

/** Everyone who can open a login: the people and team members it's shared with, and whoever added it. */
function peopleWithAccess(it: VaultItem, users: User[], teams: Team[]) {
  const live = users.filter((u) => !u.deletedAt && !u.clientOf);
  if (it.meta.access.everyone) return live;
  const ids = new Set([it.createdBy, ...it.meta.access.userIds, ...it.meta.access.teamIds.flatMap((tid) => teams.find((x) => x.id === tid)?.members ?? [])]);
  return live.filter((u) => ids.has(u.id));
}

/** Up to three faces and "+N": who sees a login, at a glance. */
function AccessFaces({ people }: { people: User[] }) {
  const shown = people.slice(0, 3);
  return (
    <span className="vault-faces" aria-hidden>
      {shown.map((u) => (
        <Avatar key={u.id} person={{ name: u.name, email: u.email, color: u.color, photo: u.photo }} size={24} />
      ))}
      {people.length > shown.length && <span className="vault-faces-more">+{people.length - shown.length}</span>}
    </span>
  );
}

/** The people and teams a login is shared with. Tapping a person opens their profile card. */
function AccessPeople({ it, users, teams, me, anchor, open, onClose, onEdit }: { it: VaultItem | null; users: User[]; teams: Team[]; me: string; anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; onEdit?: () => void }) {
  const card = usePersonCard();
  const people = it ? peopleWithAccess(it, users, teams) : [];
  const shareTeams = it && !it.meta.access.everyone ? teams.filter((x) => it.meta.access.teamIds.includes(x.id)) : [];
  return (
    <Popover anchor={anchor} open={open && !!it} onClose={onClose} width={300} title={t('Who sees it')}>
      {it && (
        <div className="vault-people">
          <p className="vault-people-note">{it.meta.access.everyone ? t('Everyone in the company. Admins can always open it.') : t('These people, and admins, who can always open it.')}</p>
          {shareTeams.map((x) => (
            <div key={x.id} className="vault-people-row team">
              <span className="team-square" style={{ background: x.color }} />
              <span className="vault-people-text">
                <span className="vault-people-name">{x.name}</span>
                <span className="vault-people-sub">{tn(x.members.length, '{n} person', '{n} people')}</span>
              </span>
            </div>
          ))}
          {people.map((u) => (
            <button
              key={u.id}
              type="button"
              className="vault-people-row"
              onClick={() => {
                const at = anchor.current;
                onClose();
                card?.open({ userId: u.id, email: u.email, name: u.name }, at);
              }}
            >
              <Avatar person={{ name: u.name, email: u.email, color: u.color, photo: u.photo }} size={32} />
              <span className="vault-people-text">
                <span className="vault-people-name">{u.id === me ? t('{name} (you)', { name: u.name }) : u.name}</span>
                <span className="vault-people-sub">{u.id === it.createdBy ? t('Added it') : u.title || u.email}</span>
              </span>
            </button>
          ))}
          {onEdit && (
            <button type="button" className="sel-opt vault-people-edit" onClick={() => (onClose(), onEdit())}>
              <Pencil size={14} /> {t('Change who sees it')}
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}

/* ---------- password health ---------- */

type Issue = 'weak' | 'reused' | 'breached' | 'no2fa' | 'http';
const ISSUE_LABEL: Record<Issue, () => string> = {
  weak: () => t('Weak password'),
  reused: () => t('Reused password'),
  breached: () => t('Found in a data breach'),
  no2fa: () => t('2FA available, not set up'),
  http: () => t('Not a secure (https) site'),
};
/** The last check, kept in memory only while the Vault is open. */
const health: { checked: boolean; running: boolean; issues: Map<string, Issue[]>; notChecked: number; breachUnknown: boolean } = { checked: false, running: false, issues: new Map(), notChecked: 0, breachUnknown: false };
const healthListeners = new Set<() => void>();
const healthChanged = () => healthListeners.forEach((f) => f());
onVaultLockChange(() => {
  if (vaultAnyUnlocked()) return;
  Object.assign(health, { checked: false, running: false, issues: new Map(), notChecked: 0, breachUnknown: false });
  healthChanged();
});
/** A login that was just changed drops off the list until the next check. */
const healthFixed = (id: string) => {
  if (health.issues.delete(id)) healthChanged();
};
function useHealth() {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    healthListeners.add(redraw);
    return () => void healthListeners.delete(redraw);
  }, []);
  return health;
}
/** Sites that offer two-step sign-in: a login there without a 2FA key is worth fixing. */
const TWO_FA_SITES = ['facebook.com', 'instagram.com', 'google.com', 'shopify.com', 'myshopify.com', 'tiktok.com', 'linkedin.com', 'x.com', 'twitter.com', 'github.com', 'amazon.com', 'microsoft.com', 'live.com', 'apple.com', 'dropbox.com', 'slack.com', 'stripe.com', 'paypal.com', 'mailchimp.com', 'canva.com', 'wordpress.com', 'godaddy.com', 'cloudflare.com', 'namecheap.com', 'zoom.us', 'hubspot.com', 'pinterest.com', 'youtube.com', 'tokopedia.com', 'shopee.co.id', 'figma.com', 'notion.so', 'xero.com', 'klaviyo.com'];
const COMMON = new Set(['password', 'password1', '123456', '12345678', '123456789', 'qwerty', 'abc123', 'letmein', 'welcome', 'admin', 'iloveyou', 'monkey', 'dragon', 'sunshine', 'football', 'passw0rd', 'qwerty123']);
const isWeak = (pw: string) => {
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) => r.test(pw)).length;
  return pw.length < 10 || (pw.length < 14 && kinds < 3) || COMMON.has(pw.toLowerCase()) || /^(.)\1+$/.test(pw);
};
/** Have I Been Pwned, by k-anonymity: only the first 5 characters of the SHA-1 leave the browser. */
async function breached(pw: string): Promise<boolean> {
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pw)))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const r = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' } });
  if (!r.ok) throw new Error('hibp');
  const rest = hash.slice(5);
  return (await r.text()).split('\n').some((line) => {
    const [suffix, count] = line.trim().split(':');
    return suffix === rest && Number(count) > 0;
  });
}
/** Reads every password I hold the key to (the server logs it on each login), and scores them here. */
async function runHealth(workspaceId: string, items: VaultItem[], me: string, priv: CryptoKey) {
  if (health.running) return;
  health.running = true;
  healthChanged();
  try {
    const { secrets } = await api<{ secrets: Record<string, string> }>(`/api/vault/health?ws=${encodeURIComponent(workspaceId)}`, { method: 'POST', body: '{}' });
    const plain = new Map<string, string>();
    for (const it of items) {
      const enc = secrets[it.id];
      const w = it.meta.keys?.[me];
      if (!enc || !w || !isEncrypted(enc)) continue;
      try {
        plain.set(it.id, await decryptSecret(await unwrapWith(priv, w), enc));
      } catch {
        /* a key that no longer opens: skipped */
      }
    }
    const counts = new Map<string, number>();
    plain.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
    const issues = new Map<string, Issue[]>();
    let breachUnknown = false;
    for (const it of items) {
      const list: Issue[] = [];
      const pw = plain.get(it.id);
      if (pw) {
        if (isWeak(pw)) list.push('weak');
        if ((counts.get(pw) ?? 0) > 1) list.push('reused');
        if (!breachUnknown) {
          try {
            if (await breached(pw)) list.push('breached');
          } catch {
            breachUnknown = true;
          }
        }
      }
      const site = host(it.meta.url).toLowerCase();
      if (site && !it.hasTotp && TWO_FA_SITES.some((d) => site === d || site.endsWith('.' + d))) list.push('no2fa');
      if (it.meta.url?.trim().toLowerCase().startsWith('http://')) list.push('http');
      if (list.length) issues.set(it.id, list);
    }
    Object.assign(health, { checked: true, issues, notChecked: items.filter((it) => it.hasPassword && !plain.has(it.id)).length, breachUnknown });
  } finally {
    health.running = false;
    healthChanged();
  }
}

/** "Needs attention": each login with what's wrong, and Change password as the one thing to do. */
function VaultHealthList({ items, run, onChange, phone }: { items: VaultItem[]; run: () => void; onChange: (it: VaultItem) => void; phone: boolean }) {
  const h = useHealth();
  const flagged = items.filter((it) => h.issues.has(it.id)).sort((a, b) => h.issues.get(b.id)!.length - h.issues.get(a.id)!.length || a.meta.title.localeCompare(b.meta.title));
  const rows = useLeaving(flagged, (i) => i.id);
  return (
    <div className={`vault-health${phone ? ' phone' : ''}`}>
      <div className="vault-health-head">
        <ShieldAlert size={20} />
        <span className="vault-health-text">
          <b>{!h.checked ? (h.running ? t('Checking your passwords…') : t('Check your passwords')) : flagged.length ? tn(flagged.length, '{n} login needs attention', '{n} logins need attention') : t('All your logins look good')}</b>
          <small>
            {t('Weak, reused and breached passwords, and sites with 2FA you haven’t set up. Breach checks send only part of a hash, never the password.')}
            {h.notChecked > 0 && ' ' + tn(h.notChecked, '{n} older login wasn’t checked: re-save it to encrypt it first.', '{n} older logins weren’t checked: re-save them to encrypt them first.')}
            {h.breachUnknown && ' ' + t('The breach check couldn’t be reached this time.')}
          </small>
        </span>
        <button type="button" className="ghost-btn sm" disabled={h.running} onClick={run}>
          <RefreshCw size={14} className={h.running ? 'spin' : ''} /> {h.checked ? t('Check again') : t('Check')}
        </button>
      </div>
      {rows.map(({ item: it, leaving }) => (
        <div key={it.id} className={`vault-health-row${leaving ? ' leaving' : ''}`}>
          <VaultTile title={it.meta.title} size={phone ? 40 : 32} />
          <span className="vault-health-main">
            <span className="vault-health-title">{it.meta.title}</span>
            <span className="vault-health-issues">
              {(h.issues.get(it.id) ?? []).map((x) => (
                <span key={x} className={`vault-issue ${x}`}>
                  {ISSUE_LABEL[x]()}
                </span>
              ))}
            </span>
          </span>
          {it.canEdit && (
            <button type="button" className="row-act primary" onClick={() => onChange(it)}>
              {h.issues.get(it.id)?.some((x) => x === 'weak' || x === 'reused' || x === 'breached') ? t('Change password') : t('Fix it')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- quick unlock offer ---------- */

/** After the passphrase: offer Face ID, fingerprint or Windows Hello for next time, once per device. */
function QuickUnlockOffer({ me, name, priv, record, toast }: { me: string; name: string; priv: CryptoKey; record?: VaultKeyRecord; toast: (t: string) => void }) {
  const [can, setCan] = useState(false);
  const [gone, setGone] = useState(() => {
    try {
      return localStorage.getItem(`vault-quick-no:${me}`) === '1';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => void quickUnlockAvailable().then(setCan), []);
  const show = can && !gone && !quickUnlockOn(me, record);
  const dismiss = () => {
    setGone(true);
    try {
      localStorage.setItem(`vault-quick-no:${me}`, '1');
    } catch {
      /* asked again next time */
    }
  };
  return (
    <div className={`fold${show ? ' open' : ''}`} aria-hidden={!show}>
      <div className="fold-in">
        <div className="vault-quick">
          <Fingerprint size={20} />
          <span className="vault-quick-text">
            <b>{t('Unlock faster on this device')}</b>
            <small>{t('Use Face ID, your fingerprint or Windows Hello instead of the passphrase. The passphrase still works.')}</small>
          </span>
          <button
            type="button"
            className="ghost-btn sm"
            disabled={busy || !show}
            onClick={async () => {
              setBusy(true);
              try {
                await enableQuickUnlock(me, name, priv, record);
                toast(t('Quick unlock is on for this device'));
                setGone(true);
              } catch (e) {
                if ((e as Error).name !== 'NotAllowedError') toast((e as Error).message);
              }
              setBusy(false);
            }}
          >
            {t('Turn on')}
          </button>
          <button type="button" className="icon-btn sm" onClick={dismiss} aria-label={t('Not now')} tabIndex={show ? 0 : -1}>
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- import from another password manager ---------- */

interface ImportRow {
  title: string;
  url?: string;
  username?: string;
  password?: string;
  totp?: string;
  notes?: string;
}
/** A CSV file as rows of cells (quotes, commas and line breaks inside quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}
/** Chrome, Edge, Safari, Firefox, LastPass, Bitwarden and 1Password exports: CSV, or Bitwarden's JSON. */
function parseImport(text: string): ImportRow[] {
  const clean = text.replace(/^﻿/, '');
  if (clean.trim().startsWith('{')) {
    const d = JSON.parse(clean) as { items?: any[] };
    return (d.items ?? [])
      .filter((x) => x && x.login)
      .map((x) => ({ title: String(x.name ?? ''), url: x.login.uris?.[0]?.uri, username: x.login.username ?? undefined, password: x.login.password ?? undefined, totp: x.login.totp ?? undefined, notes: x.notes ?? undefined }));
  }
  const [head, ...body] = parseCsv(clean);
  if (!head) return [];
  const cols = head.map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => cols.findIndex((c) => names.includes(c));
  const at = {
    title: col('name', 'title', 'account', 'account name'),
    url: col('url', 'login_uri', 'website', 'web site', 'uri', 'login url'),
    username: col('username', 'login_username', 'login name', 'user', 'email', 'username/email'),
    password: col('password', 'login_password'),
    totp: col('totp', 'login_totp', 'otpauth', 'one-time password', 'otp'),
    notes: col('notes', 'note', 'extra', 'comments'),
  };
  if (at.password < 0 && at.username < 0) throw new Error(t('That file has no username or password column. Export a CSV from your password manager and try again.'));
  const get = (r: string[], i: number) => (i >= 0 ? r[i]?.trim() || undefined : undefined);
  return body.map((r) => {
    const url = get(r, at.url);
    return { title: get(r, at.title) || host(url) || get(r, at.username) || t('Login'), url, username: get(r, at.username), password: (at.password >= 0 && r[at.password]) || undefined, totp: get(r, at.totp), notes: get(r, at.notes) };
  });
}

/** Pick a file, check the rows, choose the project and who sees them, then one button imports them all. */
function VaultImport({ adminIds, workspaceId, clients, users, me, defaultClient, onDone, onClose }: { adminIds: string[]; workspaceId: string; clients: Client[]; users: User[]; me: string; defaultClient?: string; onDone: (n: number) => void; onClose: () => void }) {
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [clientId, setClientId] = useState(defaultClient ?? '');
  const [everyone, setEveryone] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const phone = usePhone();
  const chosen = (rows ?? []).filter((_, i) => !skip.has(i));
  const read = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    try {
      if (f.size > 5_000_000) throw new Error(t('That file is too big to be a password export.'));
      const parsed = parseImport(await f.text()).filter((r) => r.password || r.username);
      if (!parsed.length) throw new Error(t('No logins found in that file.'));
      setRows(parsed.slice(0, 1000));
      setSkip(new Set());
    } catch (e) {
      setError(e instanceof SyntaxError ? t('That file couldn’t be read. Export a CSV from your password manager and try again.') : (e as Error).message);
    }
    if (file.current) file.current.value = '';
  };
  const go = async () => {
    setError('');
    setDone(0);
    // The same keys as a login added by hand: me, admins, and everyone when it's for everyone.
    const withKey = users.filter((u) => u.vaultKey && (u.id === me || adminIds.includes(u.id) || everyone));
    let n = 0;
    try {
      for (const r of chosen) {
        const made = await newItemKeys(withKey.map((u) => ({ id: u.id, pub: u.vaultKey!.pub })));
        const enc = (v?: string) => (v ? encryptSecret(made.key, v) : Promise.resolve(undefined));
        await api('/api/vault', {
          method: 'POST',
          body: JSON.stringify({
            workspaceId,
            meta: { title: r.title.slice(0, 120), url: r.url || undefined, username: r.username || undefined, clientId: clientId || undefined, access: { everyone, userIds: [], teamIds: [] }, keys: made.keys },
            password: await enc(r.password),
            totp: await enc(r.totp ? parseTotp(r.totp) : undefined),
            notes: await enc(r.notes),
          }),
        });
        setDone(++n);
      }
      onDone(n);
    } catch (e) {
      setError(n ? t('Imported {n}, then stopped: {why}', { n, why: (e as Error).message }) : (e as Error).message);
      setDone(null);
    }
  };
  const busy = done !== null;
  const body = (
    <TabPane key={rows ? 'preview' : 'pick'}>
      {!rows ? (
        <div className="vault-import-pick">
          <Upload size={28} />
          <p>{t('Export your logins as a CSV from Chrome, Edge, Safari, Firefox, LastPass, 1Password or Bitwarden (or Bitwarden’s JSON), then pick the file here.')}</p>
          <p className="muted small">{t('The file is read on this device and each login is encrypted before it’s sent. Delete the export file afterwards.')}</p>
          <input ref={file} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => void read(e.target.files?.[0])} />
          <button type="button" className="primary-btn" onClick={() => file.current?.click()}>
            <Upload size={16} /> {t('Choose a file')}
          </button>
        </div>
      ) : (
        <div className="vault-import-preview">
          <div className="field vault-project">
            <span>{term.One}</span>
            <ProjectPicker value={clientId} onChange={setClientId} projects={clients} none={t('Company login (no {project})', { project: term.one })} />
          </div>
          <div className="field">
            <span>{t('Who can use them')}</span>
            <div className="segmented wide">
              <button type="button" className={!everyone ? 'on' : ''} onClick={() => setEveryone(false)}>
                {t('Only me and admins')}
              </button>
              <button type="button" className={everyone ? 'on' : ''} onClick={() => setEveryone(true)}>
                {t('Everyone')}
              </button>
            </div>
          </div>
          <ul className="vault-import-list">
            {rows.map((r, i) => (
              <li key={i}>
                <label className="vault-import-row">
                  <input
                    type="checkbox"
                    checked={!skip.has(i)}
                    onChange={() =>
                      setSkip((s) => {
                        const next = new Set(s);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  />
                  <VaultTile title={r.title} size={32} />
                  <span className="vault-import-text">
                    <span className="vault-import-title">{r.title}</span>
                    <span className="vault-import-sub">{[r.username, host(r.url)].filter(Boolean).join(' · ') || t('No username')}</span>
                  </span>
                  {r.totp && <ShieldCheck size={16} className="vault-import-mark" aria-label={t('Has a 2FA code')} />}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="err">{error}</p>}
    </TabPane>
  );
  const label = busy ? t('Importing {done} of {total}…', { done: done ?? 0, total: chosen.length }) : tn(chosen.length, 'Import {n} login', 'Import {n} logins');
  if (phone)
    return (
      <PushScreen
        title={t('Import logins')}
        backLabel={t('Cancel')}
        onBack={() => !busy && onClose()}
        className="g-page vault-edit"
        actions={
          rows ? (
            <button type="button" className="vp-edit strong" disabled={!chosen.length || busy} onClick={() => void go()}>
              {busy ? t('Importing…') : t('Import')}
            </button>
          ) : undefined
        }
      >
        <div className="vault-body vp-form">
          {body}
          {rows && <p className="vp-foot">{label}</p>}
        </div>
      </PushScreen>
    );
  return (
    <div className="modal-scrim" onMouseDown={() => !busy && onClose()}>
      <div className="modal vault-modal" role="dialog" aria-label={t('Import logins')} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && !busy && !document.querySelector('.pop') && onClose()}>
        <header className="modal-head">
          <span className="dump-title">
            <Upload size={15} /> {t('Import logins')}
          </span>
          <button className="icon-btn sm" onClick={onClose} disabled={busy} aria-label={t('Close')}>
            <X size={15} />
          </button>
        </header>
        <div className="modal-body vault-body">
          <SmoothHeight>{body}</SmoothHeight>
        </div>
        {rows && (
          <footer className="modal-foot">
            <button className="ghost-btn" disabled={busy} onClick={() => (setRows(null), setError(''))}>
              {t('Another file')}
            </button>
            <span className="spacer" />
            <button className="ghost-btn" disabled={busy} onClick={onClose}>
              {t('Cancel')}
            </button>
            <button className="primary-btn" disabled={!chosen.length || busy} onClick={() => void go()}>
              {label}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
