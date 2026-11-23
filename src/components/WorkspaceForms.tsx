import { useRef, useState } from 'react';
import { SmoothHeight } from './ui/Smooth';
import { ImagePlus, Inbox, Shield, UserRound, Users, X } from 'lucide-react';
import type { Account, MailAlias, MailProvider, Role, User, Workspace } from '../types';
import { Select } from './ui/Select';
import { PROVIDERS } from './Onboarding';
import { notAtProvider, providerLabel } from './EmailSetupGuide';
import { WORKSPACE_COLORS } from '../data/workspaces';
import { uid } from '../utils';
import { primaryDomain, usableDomains } from '../domains';
import { readLogo, WorkspaceLogo } from './WorkspaceLogo';
import { brand as product } from '../terms';
import { deviceTz } from '../jobTimes';
import { t, tn } from '../i18n';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Logo picker + brand colour, shared by "new workspace" and settings. */
export function BrandFields({
  value,
  onChange,
}: {
  value: Pick<Workspace, 'name' | 'logo' | 'color'>;
  onChange: (p: Partial<Workspace>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="brand-fields">
      <div className="logo-pick">
        <button className="logo-drop" onClick={() => input.current?.click()} title={t('Upload logo')}>
          <WorkspaceLogo ws={value} size={64} />
          <span className="logo-over">
            <ImagePlus size={18} />
          </span>
        </button>
        <div>
          <strong>{t('Logo')}</strong>
          <small>{t('PNG, JPG or SVG · square works best')}</small>
          <div className="logo-actions">
            <button className="ghost-btn outline sm" onClick={() => input.current?.click()}>
              {t('Upload')}
            </button>
            {value.logo && (
              <button className="ghost-btn sm" onClick={() => onChange({ logo: undefined })}>
                {t('Remove')}
              </button>
            )}
          </div>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) onChange({ logo: await readLogo(f) });
            e.target.value = '';
          }}
        />
      </div>
      <div className="field">
        <label>{t('Brand colour')}</label>
        <div className="accent-row">
          {WORKSPACE_COLORS.map((c) => (
            <button key={c} className={`accent-swatch ${value.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange({ color: c })} aria-label={c} />
          ))}
          <label className="accent-swatch custom" title={t('Custom colour')} style={{ background: WORKSPACE_COLORS.includes(value.color) ? undefined : value.color }}>
            <input type="color" value={value.color} onChange={(e) => onChange({ color: e.target.value })} />
          </label>
        </div>
      </div>
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <header className="modal-head">
          <span>{title}</span>
          <button className="icon-btn sm" onClick={onClose} aria-label={t('Close')}>
            <X size={15} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function NewWorkspace({ userId, userName, onCreate, onClose }: { userId: string; userName: string; onCreate: (w: Workspace) => void; onClose: () => void }) {
  const [ws, setWs] = useState<Pick<Workspace, 'name' | 'logo' | 'color'>>({ name: '', color: WORKSPACE_COLORS[2] });
  const [email, setEmail] = useState('');
  const [name, setName] = useState(userName);
  const domain = email.split('@')[1] ?? '';
  const valid = ws.name.trim() && isEmail(email);

  const create = () =>
    valid &&
    onCreate({
      id: uid(),
      name: ws.name.trim(),
      logo: ws.logo,
      color: ws.color,
      domains: domain ? [domain.toLowerCase()] : [],
      primaryDomain: domain ? domain.toLowerCase() : undefined,
      accounts: [{ id: uid(), email: email.trim().toLowerCase(), name: name.trim() || email, kind: 'personal', connected: false, users: [userId] }],
      members: [{ userId, role: 'owner' }],
      timeZone: deviceTz(), // where its creator is; Settings, General changes it
    });

  return (
    <Modal title={t('New workspace')} onClose={onClose}>
      <div className="modal-body">
        <SmoothHeight>
        <p className="modal-intro">{t('A workspace is one business, with its own brand, email accounts, calendar and drive.')}</p>
        <div className="field">
          <label>{t('Business name')}</label>
          <input autoFocus value={ws.name} onChange={(e) => setWs({ ...ws, name: e.target.value })} placeholder={t('e.g. Continue')} />
        </div>
        <BrandFields value={ws} onChange={(p) => setWs({ ...ws, ...p })} />
        <div className="field">
          <label>{t('Your email address there')}</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('you@business.com')} onKeyDown={(e) => e.key === 'Enter' && create()} />
          {domain && <small>{t('People at @{domain} count as your team (never tracked).', { domain })}</small>}
        </div>
        <div className="field">
          <label>{t('Name people see')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        </SmoothHeight>
      </div>
      <footer className="modal-foot">
        <button className="ghost-btn" onClick={onClose}>
          {t('Cancel')}
        </button>
        <button className="primary-btn" onClick={create} disabled={!valid}>
          {t('Create workspace')}
        </button>
      </footer>
    </Modal>
  );
}

export function NewAccount({ workspace, userId, onAdd, onClose }: { workspace: Workspace; userId: string; onAdd: (a: Account) => void; onClose: () => void }) {
  // A new mailbox here goes on any of the company's domains (primary first); one at another provider is typed in full.
  const doms = usableDomains(workspace);
  const [typed, setTyped] = useState(primaryDomain(workspace) ? `@${primaryDomain(workspace)}` : '');
  const [local, setLocal] = useState('');
  const [domain, setDomain] = useState(doms[0] ?? '');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Account['kind']>('personal');
  const [provider, setProvider] = useState<MailProvider>(workspace.emailSetup === 'keep' && workspace.emailProvider ? workspace.emailProvider : 'sprint2go');
  const split = provider === 'sprint2go' && doms.length > 0;
  const email = split ? `${local.trim().toLowerCase()}@${domain}` : typed;
  const setEmail = setTyped;
  const taken = workspace.accounts.some((a) => a.email === email.trim().toLowerCase());
  const valid = isEmail(email) && !taken;

  const add = () =>
    valid && onAdd({ id: uid(), email: email.trim().toLowerCase(), name: name.trim() || (kind === 'shared' ? workspace.name : email.split('@')[0]), kind, connected: false, users: [userId], provider });

  return (
    <Modal title={t('Add an account to {company}', { company: workspace.name })} onClose={onClose}>
      <div className="modal-body">
        <SmoothHeight>
        <div className="kind-pick">
          <button className={kind === 'personal' ? 'on' : ''} onClick={() => setKind('personal')}>
            <UserRound size={18} />
            <strong>{t('Personal')}</strong>
            <small>{t('Your own address')}</small>
          </button>
          <button className={kind === 'shared' ? 'on' : ''} onClick={() => setKind('shared')}>
            <Users size={18} />
            <strong>{t('Shared inbox')}</strong>
            <small>hello@, support@, sales@</small>
          </button>
        </div>
        <div className="field">
          <label>{t('Where does this mailbox live?')}</label>
          <div className="aw-tones wrap">
            <button className={provider === 'sprint2go' ? 'on' : ''} onClick={() => setProvider('sprint2go')}>
              {t('New {product} mailbox', { product: product.name })}
            </button>
            {PROVIDERS.map((p) => (
              <button key={p.id} className={provider === p.id ? 'on' : ''} onClick={() => setProvider(p.id)}>
                {t('Connect {provider}', { provider: p.name })}
              </button>
            ))}
          </div>
          <small>
            {provider === 'sprint2go'
              ? t('We create and host this mailbox.')
              : t('Mail stays where it is and shows here too, in sync both ways. The owner signs in to connect it.')}
          </small>
        </div>
        <div className="field">
          <label>{t('Email address')}</label>
          {split ? (
            <div className="email-split">
              <input autoFocus value={local} onChange={(e) => setLocal(e.target.value.replace(/s/g, ''))} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={kind === 'shared' ? 'hello' : 'isabel'} aria-label={t('Name before the @')} />
              {doms.length > 1 ? <Select<string> value={domain} onChange={setDomain} label={t('Domain')} title={t('Domain')} className="sel-flat" width={220} options={doms.map((d) => ({ value: d, label: `@${d}` }))} /> : <span>@{domain}</span>}
            </div>
          ) : (
          <input
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={(e) => email.startsWith('@') && e.target.setSelectionRange(0, 0)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={t('name@business.com')}
          />
          )}
          {taken && <small className="err">{t('That account is already added.')}</small>}
        </div>
        <div className="field">
          <label>{t('Name people see')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'shared' ? workspace.name : t('Your name')} />
        </div>
        <p className="modal-note">
          <Inbox size={14} />{' '}
          {provider !== 'sprint2go'
            ? t('It shows as “Not connected” until it’s signed in.')
            : workspace.emailSetup === 'mix'
              ? `${t('It’s ready once mail for it arrives here, passed on by {provider}.', { provider: providerLabel(workspace.emailProvider ?? 'google') })} ${notAtProvider(workspace.emailProvider ?? 'google')}`
              : t('It’s ready once mail for it arrives here. Settings, Email delivery shows whether it receives and sends.')}
        </p>
        </SmoothHeight>
      </div>
      <footer className="modal-foot">
        <button className="ghost-btn" onClick={onClose}>
          {t('Cancel')}
        </button>
        <button className="primary-btn" onClick={add} disabled={!valid}>
          {t('Add account')}
        </button>
      </footer>
    </Modal>
  );
}

const PALETTE = ['#10b981', '#f59e0b', '#0ea5e9', '#d946ef', '#ef4444', '#14b8a6', '#8b5cf6'];

/** What inviting someone asks the server for (/api/people/invite): it decides between a new person and a join request. */
export interface InviteAsk {
  name: string;
  email: string; // how they sign in: any address
  role: Role;
  mailbox: string | null; // an address at the company's domain, or none
  shared: string[];
}

/**
 * Invite someone: how they sign in (any email; someone who already uses sprint2go gets a request to join instead) and,
 * separately, an optional mailbox at the company's domain, their role and the shared inboxes they open.
 * With the server it goes through `onAsk`; the demo without one makes the person in the browser (`onInvite`).
 */
export function InviteMember({
  workspace,
  users,
  me,
  onInvite,
  onAsk,
  onClose,
}: {
  workspace: Workspace;
  users: User[];
  me?: string;
  onInvite: (u: User, role: Role, mailbox: Account | null, shared: string[]) => void;
  onAsk?: (ask: InviteAsk) => Promise<string | null>; // null when it went, else why it didn't
  onClose: () => void;
}) {
  const doms = usableDomains(workspace); // primary first: the address starts there
  const [domain, setDomain] = useState(doms[0] ?? '');
  const [name, setName] = useState('');
  const [local, setLocal] = useState('');
  const [signIn, setSignIn] = useState(''); // empty: the same as the mailbox
  const [role, setRole] = useState<Role>('member');
  const [mailbox, setMailbox] = useState(doms.length > 0);
  const shared = workspace.accounts.filter((a) => a.kind === 'shared');
  const [access, setAccess] = useState<string[]>(shared.map((a) => a.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const box = mailbox && domain ? `${local.trim().toLowerCase()}@${domain}` : '';
  const email = (signIn.trim() || box).toLowerCase();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const boxOk = !mailbox || (!!domain && /^[a-z0-9._+-]+$/i.test(local.trim()));
  const boxTaken = !!box && boxOk && workspace.accounts.some((a) => a.email.toLowerCase() === box);
  const member = users.find((u) => u.email.toLowerCase() === email && workspace.members.some((m) => m.userId === u.id));
  const owner = workspace.members.some((m) => m.userId === me && m.role === 'owner');
  const valid = !!name.trim() && emailOk && boxOk && !boxTaken && !member && !busy;

  const invite = async () => {
    if (!valid) return;
    setError('');
    if (onAsk) {
      setBusy(true);
      const why = await onAsk({ name: name.trim(), email, role, mailbox: mailbox && box ? box : null, shared: access });
      setBusy(false);
      if (why) setError(why);
      return;
    }
    const user: User = { id: uid(), name: name.trim(), email, title: '', color: PALETTE[users.length % PALETTE.length] };
    const acct: Account | null = mailbox && box ? { id: uid(), email: box, name: name.trim(), kind: 'personal', connected: false, users: [user.id] } : null;
    onInvite(user, role, acct, access);
  };

  return (
    <Modal title={t('Invite someone to {company}', { company: workspace.name })} onClose={onClose}>
      <div className="modal-body">
        <SmoothHeight>
        <div className="field">
          <label>{t('Full name')}</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!local || local === name.split(' ')[0].toLowerCase()) setLocal(e.target.value.split(' ')[0].toLowerCase());
            }}
            placeholder={t('e.g. Isabel Hayes')}
          />
        </div>
        <label className="check-row">
          <input type="checkbox" checked={mailbox} disabled={!doms.length} onChange={(e) => setMailbox(e.target.checked)} />
          {doms.length ? t('Give them a company mailbox') : t('Add a domain in Settings to give them a company mailbox')}
        </label>
        <div className={`fold${mailbox && doms.length ? ' open' : ''}`}>
          <div>
            <div className="field">
              <label>{t('Their mailbox')}</label>
              <div className="email-split">
                <input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="isabel" aria-label={t('Their mailbox')} onKeyDown={(e) => e.key === 'Enter' && void invite()} />
                {doms.length > 1 ? <Select<string> value={domain} onChange={setDomain} label={t('Domain')} title={t('Domain')} className="sel-flat" width={220} options={doms.map((d) => ({ value: d, label: `@${d}` }))} /> : <span>@{domain}</span>}
              </div>
              {boxTaken && <small className="err">{t('That mailbox address is already taken.')}</small>}
              {workspace.emailSetup === 'mix' && (
                <small className="muted">
                  {t('Mail for {address} comes through {provider}.', { address: local.trim() ? box : t('their address'), provider: providerLabel(workspace.emailProvider ?? 'google') })} {notAtProvider(workspace.emailProvider ?? 'google')}
                </small>
              )}
            </div>
          </div>
        </div>
        <div className="field">
          <label>{t('How they sign in')}</label>
          <input type="email" autoComplete="off" value={signIn} onChange={(e) => setSignIn(e.target.value)} placeholder={box && boxOk ? box : t('their email address')} onKeyDown={(e) => e.key === 'Enter' && void invite()} />
          {member ? (
            <small className="err">{t('They’re already in this company.')}</small>
          ) : (
            <small className="muted">{mailbox && box && !signIn.trim() ? t('With their mailbox. Type another address if they’d rather sign in with one they already use.') : t('Any address. If they already use sprint2go, they get a request to join and accept it in their own app.')}</small>
          )}
        </div>
        <div className="field">
          <label>{t('Role')}</label>
          <div className="kind-pick three">
            {(
              [
                ['member', UserRound, t('Member'), t('Their own mail')],
                ['admin', Shield, t('Admin'), t('Manage people & settings')],
                ['owner', Users, t('Owner'), t('Everything, incl. billing')],
              ] as const
            ).map(([id, Icon, label, hint]) => (
              <button key={id} className={role === id ? 'on' : ''} disabled={id === 'owner' && !!onAsk && !owner} onClick={() => setRole(id)}>
                <Icon size={18} />
                <strong>{label}</strong>
                <small>{hint}</small>
              </button>
            ))}
          </div>
        </div>
        {shared.length > 0 && (
          <div className="field">
            <label>{t('Shared inboxes they can open')}</label>
            {shared.map((a) => (
              <label key={a.id} className="check-row">
                <input
                  type="checkbox"
                  checked={access.includes(a.id)}
                  onChange={(e) => setAccess((x) => (e.target.checked ? [...x, a.id] : x.filter((i) => i !== a.id)))}
                />
                {a.email}
              </label>
            ))}
          </div>
        )}
        {error && <small className="form-error" role="alert">{error}</small>}
        <p className="modal-note">
          <Inbox size={14} /> {t('Admins can manage people, but nobody can read someone else’s personal mailbox.')}
        </p>
        </SmoothHeight>
      </div>
      <footer className="modal-foot">
        <button className="ghost-btn" onClick={onClose}>
          {t('Cancel')}
        </button>
        <button className="primary-btn" onClick={() => void invite()} disabled={!valid}>
          {busy ? t('Sending…') : t('Send invite')}
        </button>
      </footer>
    </Modal>
  );
}

/** Removing a mailbox says what happens to its mail first: moved into another mailbox, or deleted with it. */
export function RemoveMailbox({ account, workspace, conversations, onRemove, onClose }: { account: Account; workspace: Workspace; conversations: number | null; onRemove: (moveTo: string | null) => Promise<boolean>; onClose: () => void }) {
  const others = workspace.accounts.filter((a) => a.id !== account.id && !a.temp);
  const [moveTo, setMoveTo] = useState<string>(others.find((a) => a.kind === 'shared')?.id ?? others[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const aliases = (workspace.mailAliases ?? []).filter((al) => al.to.includes(account.id));
  const hosted = !account.provider || account.provider === 'sprint2go';
  const mail = conversations === null ? t('Its mail') : tn(conversations, 'Its {n} conversation', 'Its {n} conversations');
  return (
    <Modal title={t('Remove {email}?', { email: account.email })} onClose={onClose}>
      <div className="modal-body">
        <SmoothHeight>
          <p className="modal-intro">
            {hosted
              ? t('New mail to {email} is refused from now on, and senders get a note that it bounced.', { email: account.email })
              : t('{email} stays at {provider}. It just stops showing in {product}.', { email: account.email, provider: providerLabel(account.provider ?? 'google'), product: product.name })}
          </p>
          {conversations !== 0 && (
            <div className="field">
              <label>{mail}</label>
              <Select<string>
                value={moveTo}
                onChange={setMoveTo}
                label={t('What happens to its mail')}
                width={320}
                options={[
                  ...others.map((a) => ({ value: a.id, label: t('Move it to {email}', { email: a.email }), hint: a.kind === 'shared' ? t('Shared inbox') : undefined })),
                  { value: '', label: t('Delete it'), hint: t('For everyone. This can’t be undone.'), danger: true },
                ]}
              />
            </div>
          )}
          {aliases.length > 0 && (
            <p className="small muted">
              {aliases.some((al) => al.to.length === 1)
                ? tn(aliases.length, '{addresses} stops delivering here; an address with no other mailbox is removed too.', '{addresses} stop delivering here; an address with no other mailbox is removed too.', { addresses: aliases.map((al) => al.address).join(', ') })
                : tn(aliases.length, '{addresses} stops delivering here.', '{addresses} stop delivering here.', { addresses: aliases.map((al) => al.address).join(', ') })}
            </p>
          )}
        </SmoothHeight>
      </div>
      <footer className="modal-foot">
        <button className="ghost-btn" onClick={onClose}>
          {t('Cancel')}
        </button>
        <button
          className="primary-btn danger-btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            if (!(await onRemove(conversations === 0 ? null : moveTo || null))) setBusy(false);
          }}
        >
          {moveTo && conversations !== 0 ? t('Move mail and remove') : t('Remove mailbox')}
        </button>
      </footer>
    </Modal>
  );
}

/**
 * Another address for mail: sales@ into Isabel's and Thomas's mailboxes (each gets a copy), or info@ into the hello@
 * shared inbox. With "Some of each", the provider must not have the address, or it keeps the mail.
 */
export function AliasDialog({ workspace, alias, onSave, onClose }: { workspace: Workspace; alias?: MailAlias; onSave: (a: MailAlias) => Promise<string | null>; onClose: () => void }) {
  const domains = usableDomains(workspace); // primary first
  const [local, setLocal] = useState(alias?.address.split('@')[0] ?? '');
  const [domain, setDomain] = useState(alias?.address.split('@')[1] ?? domains[0] ?? '');
  const boxes = workspace.accounts.filter((a) => !a.temp && (!a.provider || a.provider === 'sprint2go'));
  const [to, setTo] = useState<string[]>(alias?.to ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const address = `${local.trim().toLowerCase()}@${domain}`;
  const taken = workspace.accounts.some((a) => a.email === address) || (workspace.mailAliases ?? []).some((al) => al.address === address && al.id !== alias?.id);
  const valid = /^[a-z0-9][a-z0-9._+-]{0,63}$/i.test(local.trim()) && !!domain && !taken && to.length > 0;
  const picked = boxes.filter((b) => to.includes(b.id));
  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    const err = await onSave({ id: alias?.id ?? uid(), address, to });
    setBusy(false);
    if (err) setError(err);
  };
  return (
    <Modal title={alias ? t('Edit {address}', { address: alias.address }) : t('Add an address')} onClose={onClose}>
      <div className="modal-body">
        <SmoothHeight>
          <p className="modal-intro">{t('Another address at your domain that delivers into mailboxes here, like sales@ or info@. Replies go out from the mailbox.')}</p>
          <div className="field">
            <label>{t('Address')}</label>
            <div className="email-split">
              <input autoFocus value={local} onChange={(e) => (setLocal(e.target.value), setError(''))} placeholder="sales" onKeyDown={(e) => e.key === 'Enter' && void save()} />
              {domains.length > 1 ? (
                <Select<string> value={domain} onChange={setDomain} label={t('Domain')} className="sel-flat" width={220} options={domains.map((d) => ({ value: d, label: `@${d}` }))} />
              ) : (
                <span>@{domain}</span>
              )}
            </div>
            {taken && <small className="err">{t('{address} is already a mailbox or an address.', { address })}</small>}
          </div>
          <div className="field">
            <label>{t('Delivers to')}</label>
            {boxes.map((b) => (
              <label key={b.id} className="check-row">
                <input type="checkbox" checked={to.includes(b.id)} onChange={(e) => setTo((x) => (e.target.checked ? [...x, b.id] : x.filter((i) => i !== b.id)))} />
                <span>
                  {b.email}
                  {b.kind === 'shared' && <small className="muted"> · {t('shared inbox')}</small>}
                </span>
              </label>
            ))}
            <small>{picked.length > 1 ? t('Each of these mailboxes gets its own copy.') : picked[0]?.kind === 'shared' ? t('Everyone on {email} sees it.', { email: picked[0].email }) : t('Pick one mailbox, or several: each gets its own copy.')}</small>
          </div>
          {workspace.emailSetup === 'mix' && (
            <p className="modal-note">
              <Inbox size={14} /> {t('Mail for {address} comes through {provider}.', { address: local.trim() ? address : t('the address'), provider: providerLabel(workspace.emailProvider ?? 'google') })} {notAtProvider(workspace.emailProvider ?? 'google')}
            </p>
          )}
          {error && <p className="err">{t(error)}</p>}
        </SmoothHeight>
      </div>
      <footer className="modal-foot">
        <button className="ghost-btn" onClick={onClose}>
          {t('Cancel')}
        </button>
        <button className="primary-btn" onClick={() => void save()} disabled={!valid || busy}>
          {alias ? t('Save') : t('Add address')}
        </button>
      </footer>
    </Modal>
  );
}
