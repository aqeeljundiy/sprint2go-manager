// /admin, AI, Subscriptions: the owner's own AI accounts (a Claude subscription, a ChatGPT subscription, API keys),
// one priority list, and which company uses which (server/aiAccounts.ts). Owners only. Logins never come to the page:
// it gets each account's name, email, plan, usage and state.
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, KeyRound, LogIn } from 'lucide-react';
import { Select, type Option } from '../../components/ui/Select';
import { SmoothHeight } from '../../components/ui/Smooth';
import { ApiError, get, post, rel } from '../api';
import { Badge, Confirm, CopyBtn, Dialog, Empty, Failed, Field, Loading, Menu, Section, Switch, useAct, useAdmin, useApi } from '../ui';
import { t, tx } from '../../i18n';
import { fmtNumber } from '../../i18n/format';
import '../../aiAccounts.css';

type State = 'ok' | 'limit' | 'resting' | 'signed-out' | 'archived';
interface Acct {
  id: string;
  kind: 'claude' | 'codex' | 'key';
  provider: string;
  label: string;
  model: string | null;
  email: string | null;
  plan: string | null;
  last4: string | null;
  addedAt: string;
  state: State;
  text: boolean;
  speech: boolean;
  usage: { windows: { id: string; label: string; used: number; resets: string | null }[] } | null;
  usageAt: string | null;
  usageError: string | null;
  restUntil: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
  calls: number;
  tokens: number;
  usedBy: string[];
}
interface Data {
  accounts: Acct[];
  archived: Acct[];
  settings: { autoSwitch: boolean; limit: number };
  workspaces: { id: string; name: string; ai: string; speech: string }[];
  tools: { claude: boolean; codex: boolean };
  keyProviders: { id: string; name: string; speech: boolean; text: boolean; models: { id: string; name: string }[] }[];
}
interface LoginView {
  id: string;
  kind: 'claude' | 'codex';
  state: 'running' | 'done' | 'failed' | 'cancelled';
  url: string | null;
  code: string | null;
  error: string | null;
  accountId: string | null;
  wrongCode?: boolean;
}

const KIND_NAME = (a: Pick<Acct, 'kind' | 'provider'>, providers: Data['keyProviders']) => (a.kind === 'claude' ? t('Claude subscription') : a.kind === 'codex' ? t('ChatGPT subscription') : t('{provider} key', { provider: providers.find((p) => p.id === a.provider)?.name ?? a.provider }));
const MARK = (a: Acct) => (a.kind === 'claude' ? 'C' : a.kind === 'codex' ? 'G' : a.provider.charAt(0).toUpperCase());
/** Usage window names from the server, in the console's language. */
const WINDOW: Record<string, () => string> = { '5 hours': () => t('5 hours'), Week: () => t('Week'), 'Week, Opus': () => t('Week, Opus'), 'Week, Sonnet': () => t('Week, Sonnet') };
const windowName = (label: string) => WINDOW[label]?.() ?? label;
const STATE_BADGE: Record<State, { tone: 'good' | 'warn' | 'bad' | 'neutral'; label: () => string }> = {
  ok: { tone: 'good', label: () => t('Ready') },
  limit: { tone: 'warn', label: () => t('At its limit') },
  resting: { tone: 'warn', label: () => t('Resting') },
  'signed-out': { tone: 'bad', label: () => t('Signed out') },
  archived: { tone: 'neutral', label: () => t('Archived') },
};

export function Subscriptions() {
  const { me, toast } = useAdmin();
  const owner = me.role === 'owner';
  const { data, error, reload, setData } = useApi<Data>(owner ? 'ai-accounts' : null, [], 60_000);
  const act = useAct();
  const [signIn, setSignIn] = useState<{ kind: 'claude' | 'codex'; account?: Acct } | null>(null);
  const [addKey, setAddKey] = useState(false);
  const [editing, setEditing] = useState<Acct | null>(null);
  const [archiving, setArchiving] = useState<Acct | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  if (!owner) return <Empty title={t('Only an owner can manage the AI subscriptions')} text={t('Ask an owner to add or change them.')} />;
  if (error) return <Failed error={error} retry={reload} />;
  if (!data) return <Loading rows={5} />;
  const d = data;
  const save = (path: string, body: unknown, done?: string) => act(() => post<Data>(path, body).then(setData), done);
  const move = (id: string, by: -1 | 1) => {
    const order = d.accounts.map((a) => a.id);
    const i = order.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    // Moves at once on the page; the server's answer follows.
    setData({ ...d, accounts: order.map((x) => d.accounts.find((a) => a.id === x)!) });
    void save('ai-accounts/priority', { order });
  };
  const refresh = (a: Acct) => {
    setBusy(a.id);
    void act(() => post<Data>(`ai-accounts/${a.id}/refresh`).then(setData), t('Checked {name}', { name: a.label })).finally(() => setBusy(null));
  };
  const test = (a: Acct) => {
    setBusy(a.id);
    void post<Data>(`ai-accounts/${a.id}/test`)
      .then((r) => (setData(r), toast(t('{name} answered', { name: a.label }))), (e: ApiError) => (toast(e.message), reload()))
      .finally(() => setBusy(null));
  };
  const textAccounts = d.accounts.filter((a) => a.text);
  const speechAccounts = d.accounts.filter((a) => a.speech);
  const aiOptions: Option[] = [
    { value: 'off', label: t('Its own setup'), hint: t('Settings, AI in that company') },
    { value: 'priority', label: t('All, in priority order'), hint: t('Switches when one is at its limit') },
    ...textAccounts.map((a) => ({ value: a.id, label: t('Only {name}', { name: a.label }), group: t('One account') })),
  ];
  const speechOptions: Option[] = [{ value: 'off', label: t('Its own setup'), hint: t('Settings, AI in that company') }, ...speechAccounts.map((a) => ({ value: a.id, label: a.label }))];

  return (
    <div className="acc-page">
      <p className="adm-note acc-lead">{t('Your own AI accounts, shared out to the companies you pick. A company you leave on its own setup keeps working exactly as before, and its own setup stays the fallback for the others.')}</p>
      <Section
        title={t('Accounts')}
        hint={t('Tried from the top. Logins are encrypted on the server and never shown here.')}
        actions={
          <span className="acc-adds">
            <button className="primary-btn sm" onClick={() => setSignIn({ kind: 'claude' })}>
              <LogIn size={13} /> {t('Sign in with Claude')}
            </button>
            <button className="ghost-btn sm" onClick={() => setSignIn({ kind: 'codex' })}>
              <LogIn size={13} /> {t('Sign in with ChatGPT')}
            </button>
            <button className="ghost-btn sm" onClick={() => setAddKey(true)}>
              <KeyRound size={13} /> {t('Add an API key')}
            </button>
          </span>
        }
      >
        {d.accounts.length === 0 ? (
          <Empty title={t('No accounts yet')} text={t('Sign in with a Claude or ChatGPT subscription, or add an API key. Then pick below which companies use them.')} />
        ) : (
          <div className="adm-mini-list">
            {d.accounts.map((a, i) => (
              <div key={a.id} className={`adm-mini-row adm-ai-key acc-row ${leaving === a.id ? 'leaving' : ''}`}>
                <span className="acc-order">
                  <button className="icon-btn sm" aria-label={t('Move {name} up', { name: a.label })} title={t('Move up')} disabled={i === 0} onClick={() => move(a.id, -1)}>
                    <ArrowUp size={14} />
                  </button>
                  <button className="icon-btn sm" aria-label={t('Move {name} down', { name: a.label })} title={t('Move down')} disabled={i === d.accounts.length - 1} onClick={() => move(a.id, 1)}>
                    <ArrowDown size={14} />
                  </button>
                </span>
                <span className="adm-ai-mark" aria-hidden>
                  {MARK(a)}
                </span>
                <span className="grow adm-ai-two">
                  <strong>
                    {a.label} {a.last4 && <span className="adm-ai-last4">•••• {a.last4}</span>}
                    <Badge tone={STATE_BADGE[a.state].tone}>{STATE_BADGE[a.state].label()}</Badge>
                  </strong>
                  <small>{[KIND_NAME(a, d.keyProviders), a.email, a.plan, a.model ? t('model {model}', { model: a.model }) : a.text ? t('default model') : t('speech to text')].filter(Boolean).join(' · ')}</small>
                  <Usage a={a} limit={d.settings.limit} />
                  <small className={a.state === 'signed-out' || (a.lastError && a.state !== 'ok') ? 'adm-ai-bad' : ''}>
                    {a.state === 'signed-out'
                      ? t('Signed out. Reconnect it to use it again.')
                      : a.state === 'resting' && a.restUntil
                        ? t('{why} Tried again {when}.', { why: a.lastError ?? t('It failed.'), when: rel(a.restUntil) })
                        : a.lastUsedAt
                          ? t('Last used {when}, {calls} calls and {tokens} tokens this month', { when: rel(a.lastUsedAt), calls: fmtNumber(a.calls), tokens: fmtNumber(a.tokens) })
                          : t('Not used yet')}
                    {a.usedBy.length ? ` · ${t('Used by {companies}', { companies: a.usedBy.slice(0, 3).join(', ') + (a.usedBy.length > 3 ? ` +${a.usedBy.length - 3}` : '') })}` : ''}
                  </small>
                </span>
                <span className="adm-ai-acts">
                  {a.state === 'signed-out' && a.kind !== 'key' ? (
                    <button className="ghost-btn sm" onClick={() => setSignIn({ kind: a.kind as 'claude' | 'codex', account: a })}>
                      {t('Reconnect')}
                    </button>
                  ) : (
                    a.text && (
                      <button className="ghost-btn sm" disabled={busy === a.id} onClick={() => test(a)}>
                        {busy === a.id ? t('Testing…') : tx('verb', 'Test')}
                      </button>
                    )
                  )}
                  <Menu
                    label={t('More')}
                    items={[
                      { label: t('Name and model'), run: () => setEditing(a) },
                      a.kind !== 'key' && { label: t('Check usage now'), run: () => refresh(a) },
                      a.kind !== 'key' && { label: t('Reconnect'), hint: t('Sign in again, keeping its place and companies'), run: () => setSignIn({ kind: a.kind as 'claude' | 'codex', account: a }) },
                      (a.state === 'resting' || a.state === 'signed-out') && a.kind === 'key' && { label: t('Use it again now'), run: () => refresh(a) },
                      { label: t('Archive'), hint: t('Stops using it; you can restore it'), danger: true, run: () => setArchiving(a) },
                    ]}
                  />
                </span>
              </div>
            ))}
          </div>
        )}
        {d.archived.length > 0 && (
          <div className="acc-archived">
            <button className="link-btn" aria-expanded={showArchived} onClick={() => setShowArchived((x) => !x)}>
              {showArchived ? t('Hide archived ({n})', { n: d.archived.length }) : t('Show archived ({n})', { n: d.archived.length })}
            </button>
            <div className={`fold ${showArchived ? 'open' : ''}`}>
              <div>
                <div className="adm-mini-list">
                  {d.archived.map((a) => (
                    <div key={a.id} className="adm-mini-row adm-ai-key off">
                      <span className="adm-ai-mark" aria-hidden>
                        {MARK(a)}
                      </span>
                      <span className="grow adm-ai-two">
                        <strong>{a.label}</strong>
                        <small>{[KIND_NAME(a, d.keyProviders), a.email].filter(Boolean).join(' · ')}</small>
                      </span>
                      <button className="ghost-btn sm" onClick={() => void save(`ai-accounts/${a.id}/restore`, {}, t('{name} restored', { name: a.label }))}>
                        {t('Restore')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section title={t('Switching')}>
        <div className="adm-form">
          <Switch
            label={t('Switch to the next account at the limit')}
            hint={d.settings.autoSwitch ? t('An account over the limit below, resting after an error or signed out is skipped. Usage is checked every 5 minutes.') : t('Off: the first account is always tried; the next one only runs when it fails.')}
            on={d.settings.autoSwitch}
            onChange={(v) => void save('ai-accounts/settings', { autoSwitch: v }, v ? t('Auto-switch on') : t('Auto-switch off'))}
          />
          {d.settings.autoSwitch && (
            <Field label={t('Counts as at its limit from')}>
              <Select value={String(d.settings.limit)} label={t('Limit')} width={200} options={[70, 80, 90, 95, 100].map((n) => ({ value: String(n), label: t('{n}% used', { n }) }))} onChange={(v) => void save('ai-accounts/settings', { limit: Number(v) })} />
            </Field>
          )}
        </div>
      </Section>

      <Section title={t('Companies')} hint={t('AI: Ask AI, brain dump, summaries, meeting notes')}>
        {d.workspaces.length === 0 ? (
          <Empty title={t('No companies yet')} />
        ) : (
          <div className="adm-mini-list">
            {d.workspaces.map((w) => (
              <div key={w.id} className="adm-mini-row acc-ws">
                <strong>{w.name}</strong>
                <span className="adm-ai-pick">
                  <small>AI</small>
                  <Select className="sel-flat" value={w.ai} options={aiOptions} label={t('AI for {company}', { company: w.name })} title={w.name} width={300} onChange={(v) => void save('ai-accounts/workspace', { workspaceId: w.id, ai: v }, t('{company} updated', { company: w.name }))} />
                </span>
                <span className="adm-ai-pick">
                  <small>{t('Meeting transcripts')}</small>
                  <Select className="sel-flat" value={w.speech} options={speechOptions} label={t('Meeting transcripts for {company}', { company: w.name })} title={w.name} width={260} onChange={(v) => void save('ai-accounts/workspace', { workspaceId: w.id, speech: v }, t('{company} updated', { company: w.name }))} />
                </span>
              </div>
            ))}
          </div>
        )}
        {speechAccounts.length === 0 && <p className="adm-note">{t('For meeting transcripts, add a speech-to-text key (Groq, Deepgram, SumoPod or OpenAI). Subscriptions only do text.')}</p>}
      </Section>

      {signIn && <SignIn kind={signIn.kind} account={signIn.account} ready={d.tools[signIn.kind]} onClose={() => (setSignIn(null), reload())} onDone={(text) => (setSignIn(null), toast(text), reload())} />}
      {addKey && <AddKey d={d} onClose={() => setAddKey(false)} onDone={(r, text) => (setAddKey(false), setData(r), toast(text))} />}
      {editing && <Edit a={editing} d={d} onClose={() => setEditing(null)} onDone={(r) => (setEditing(null), setData(r), toast(t('{name} saved', { name: editing.label })))} />}
      {archiving && (
        <Confirm
          title={t('Archive {name}?', { name: archiving.label })}
          text={archiving.usedBy.length ? t('{companies} stop using it at once and go to the next account, or their own setup. Its login is kept, so you can restore it.', { companies: archiving.usedBy.join(', ') }) : t('It stops being used at once. Its login is kept, so you can restore it.')}
          action={t('Archive')}
          onClose={() => setArchiving(null)}
          onConfirm={async () => {
            const a = archiving;
            setArchiving(null);
            setLeaving(a.id);
            await new Promise((r) => setTimeout(r, 200));
            await save(`ai-accounts/${a.id}/archive`, {}, t('{name} archived', { name: a.label }));
            setLeaving(null);
          }}
        />
      )}
    </div>
  );
}

/** Each usage window as a bar, with when it resets. */
function Usage({ a, limit }: { a: Acct; limit: number }) {
  if (a.kind === 'key') return null;
  if (!a.usage?.windows.length) return <small>{a.usageError ? t(a.usageError) : t('Usage shows after the first check.')}</small>;
  return (
    <span className="acc-usage">
      {a.usage.windows.map((w) => (
        <span key={w.id} className={`acc-win ${w.used >= limit ? 'over' : w.used >= limit - 15 ? 'near' : ''}`}>
          <span className="acc-win-top">
            <span>{windowName(w.label)}</span>
            <span>{t('{n}% used', { n: w.used })}</span>
          </span>
          <span className="acc-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={w.used} aria-label={windowName(w.label)}>
            <span style={{ width: `${w.used}%` }} />
          </span>
          {w.resets && <span className="acc-win-reset">{t('resets {when}', { when: rel(w.resets) })}</span>}
        </span>
      ))}
    </span>
  );
}

/** Signing in: Claude shows its page and takes the code back; ChatGPT shows a code to type on its page and waits. */
function SignIn({ kind, account, ready, onClose, onDone }: { kind: 'claude' | 'codex'; account?: Acct; ready: boolean; onClose: () => void; onDone: (text: string) => void }) {
  const [view, setView] = useState<LoginView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const started = useRef(false);
  const name = kind === 'claude' ? 'Claude' : 'ChatGPT';
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    post<LoginView>('ai-accounts/login', { kind, accountId: account?.id }).then(setView, (e: ApiError) => setErr(e.message));
  }, [kind, account, ready]);
  // ChatGPT finishes by itself once the code is typed in: ask every 2 seconds.
  useEffect(() => {
    if (!view || view.state !== 'running' || kind !== 'codex') return;
    const timer = setInterval(() => void get<LoginView>(`ai-accounts/login/${view.id}`).then(setView, () => {}), 2000);
    return () => clearInterval(timer);
  }, [view, kind]);
  useEffect(() => {
    if (view?.state === 'done') onDone(account ? t('{name} reconnected', { name: account.label }) : t('{name} subscription added', { name }));
  }, [view?.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    if (view?.state === 'running') void post(`ai-accounts/login/${view.id}/cancel`).catch(() => {});
    onClose();
  };
  const send = () => {
    if (!view || !code.trim()) return;
    setSending(true);
    setErr(null);
    void post<LoginView>(`ai-accounts/login/${view.id}/code`, { code: code.trim() })
      .then((v) => (setView(v), v.wrongCode && setErr(t('That code wasn’t accepted. Copy the whole code and try again.'))), (e: ApiError) => setErr(e.message))
      .finally(() => setSending(false));
  };
  const failed = view?.state === 'failed' || view?.state === 'cancelled';
  return (
    <Dialog
      title={account ? t('Reconnect {name}', { name: account.label }) : t('Sign in with {name}', { name })}
      onClose={close}
      foot={
        <>
          <button className="ghost-btn" onClick={close}>
            {view?.state === 'running' ? t('Cancel') : t('Close')}
          </button>
          {kind === 'claude' && view?.state === 'running' && (
            <button className="primary-btn" disabled={!code.trim() || sending} onClick={send}>
              {sending ? t('Checking…') : t('Sign in')}
            </button>
          )}
        </>
      }
    >
      <SmoothHeight>
        <div className="adm-form acc-signin">
          {!ready ? (
            <p className="adm-note">{t('This server doesn’t have the {name} sign-in tool yet. It comes with the next deploy; API keys work already.', { name })}</p>
          ) : err && !view ? (
            <p className="adm-ai-warn">{err}</p>
          ) : !view ? (
            <Loading rows={2} />
          ) : failed ? (
            <p className="adm-ai-warn">{view.error ? t('The sign-in didn’t finish: {why}', { why: view.error }) : t('The sign-in didn’t finish. Start again.')}</p>
          ) : kind === 'claude' ? (
            <>
              <ol className="acc-steps">
                <li>
                  <span>{t('Open Claude’s sign-in page and sign in with the subscription you want to add.')}</span>
                  {view.url && (
                    <a className="ghost-btn sm" href={view.url} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} /> {t('Open the sign-in page')}
                    </a>
                  )}
                </li>
                <li>
                  <span>{t('Claude then shows a code. Paste it here.')}</span>
                </li>
              </ol>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <Field label={t('Code from Claude')}>
                  <input value={code} onChange={(e) => (setCode(e.target.value), setErr(null))} autoComplete="off" spellCheck={false} autoFocus />
                </Field>
              </form>
              {err && <p className="adm-ai-warn">{err}</p>}
            </>
          ) : (
            <>
              <ol className="acc-steps">
                <li>
                  <span>{t('Open ChatGPT’s device page and sign in with the subscription you want to add.')}</span>
                  {view.url && (
                    <a className="ghost-btn sm" href={view.url} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} /> {t('Open the device page')}
                    </a>
                  )}
                </li>
                <li>
                  <span>{t('Type in this code:')}</span>
                  {view.code && (
                    <span className="acc-code">
                      <code>{view.code}</code>
                      <CopyBtn text={view.code} iconOnly />
                    </span>
                  )}
                </li>
              </ol>
              <p className="adm-note acc-wait">
                <span className="acc-dot" aria-hidden /> {t('Waiting for you to finish on ChatGPT’s page…')}
              </p>
            </>
          )}
        </div>
      </SmoothHeight>
    </Dialog>
  );
}

function AddKey({ d, onClose, onDone }: { d: Data; onClose: () => void; onDone: (r: Data, text: string) => void }) {
  const [provider, setProvider] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const info = d.keyProviders.find((p) => p.id === provider);
  const ready = !!info && key.trim().length >= 8 && (provider !== 'custom' || /^https:\/\//.test(url.trim()));
  const options: Option[] = d.keyProviders.map((p) => ({ value: p.id, label: p.name, group: p.text ? (p.speech ? t('Text and speech') : t('Text')) : t('Speech to text') }));
  const save = () => {
    if (!ready || !info) return;
    setBusy(true);
    setErr(null);
    void post<Data & { id: string }>('ai-accounts/key', { provider, key: key.trim(), baseUrl: url.trim() || undefined, label: label.trim() || undefined, model: model || undefined })
      .then((r) => onDone(r, t('{provider} key added', { provider: info.name })), (e: ApiError) => setErr(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog
      title={t('Add an API key')}
      onClose={onClose}
      foot={
        <>
          <button className="ghost-btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className="primary-btn" disabled={!ready || busy} onClick={save}>
            {busy ? t('Testing…') : info?.text ? t('Test and save') : t('Save')}
          </button>
        </>
      }
    >
      <form
        className="adm-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={t('Provider')}>
          <Select value={provider} options={options} onChange={(v) => (setProvider(v), setModel(''), setErr(null))} placeholder={t('Choose a provider')} label={t('Provider')} searchable width={340} />
        </Field>
        {provider === 'custom' && (
          <Field label={t('Address')} hint={t('Must start with https://')}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" autoComplete="off" />
          </Field>
        )}
        {info && (
          <>
            <Field label={t('Key')}>
              <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => (setKey(e.target.value), setErr(null))} />
            </Field>
            {info.text && info.models.length > 0 && (
              <Field label={t('Model')} hint={t('Empty: the best match for each job')}>
                <Select value={model} options={[{ value: '', label: t('Best match for each job') }, ...info.models.map((m) => ({ value: m.id, label: m.name }))]} onChange={setModel} label={t('Model')} width={340} />
              </Field>
            )}
            <Field label={t('Name (optional)')}>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('{provider} key', { provider: info.name })} autoComplete="off" />
            </Field>
          </>
        )}
        {err && <p className="adm-ai-warn">{err}</p>}
      </form>
    </Dialog>
  );
}

/** A subscription's model: the tool's own names (Claude: sonnet, opus, haiku; ChatGPT: its default, or a GPT model). */
const SUB_MODELS: Record<'claude' | 'codex', Option[]> = {
  get claude() {
    return [
      { value: 'sonnet', label: 'Sonnet', hint: t('balanced') },
      { value: 'opus', label: 'Opus', hint: t('best, uses the limit fastest') },
      { value: 'haiku', label: 'Haiku', hint: t('fastest') },
    ];
  },
  get codex() {
    return [
      { value: '', label: t('ChatGPT’s default') },
      { value: 'gpt-5', label: 'GPT-5' },
      { value: 'gpt-5-mini', label: 'GPT-5 mini', hint: t('fastest') },
    ];
  },
};
function Edit({ a, d, onClose, onDone }: { a: Acct; d: Data; onClose: () => void; onDone: (r: Data) => void }) {
  const [label, setLabel] = useState(a.label);
  const [model, setModel] = useState(a.model ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const models: Option[] = a.kind === 'key' ? [{ value: '', label: t('Best match for each job') }, ...(d.keyProviders.find((p) => p.id === a.provider)?.models ?? []).map((m) => ({ value: m.id, label: m.name }))] : SUB_MODELS[a.kind];
  const save = () => {
    setBusy(true);
    void post<Data>(`ai-accounts/${a.id}/update`, { label, model })
      .then(onDone, (e: ApiError) => setErr(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog
      title={t('Name and model')}
      size="sm"
      onClose={onClose}
      foot={
        <>
          <button className="ghost-btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className="primary-btn" disabled={busy || !label.trim()} onClick={save}>
            {t('Save')}
          </button>
        </>
      }
    >
      <form
        className="adm-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={t('Name')}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} autoComplete="off" />
        </Field>
        {a.text && (
          <Field label={t('Model')}>
            <Select value={model} options={models} onChange={setModel} label={t('Model')} width={300} />
          </Field>
        )}
        {err && <p className="adm-ai-warn">{err}</p>}
      </form>
    </Dialog>
  );
}

