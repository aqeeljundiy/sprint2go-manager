// Settings, Domains: every domain the company has, the Google Workspace way. One is primary (new people get their
// address there by default, and Email delivery shows its records); mailboxes, shared inboxes and addresses can live on
// any of them. Records and checks come from the mail engine (/api/mail/setup and /api/mail/check, per domain); the save
// path on the server checks the list (server/domains.ts, domainsOnSave). Brands (Brands.tsx) are optional on top.
import { useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronRight, Copy, Globe, Loader2, Plus, RefreshCw, Star, Trash2, X } from 'lucide-react';
import type { Workspace } from '../../types';
import { Badge, type BadgeTone } from '../ui/Person';
import { Layer } from '../ui/Layer';
import { SmoothHeight, useLeaving } from '../ui/Smooth';
import { EmptyState } from '../ui/EmptyState';
import { cleanDomain, orderedDomains, primaryDomain, validDomain } from '../../domains';
import { toast, toastUndo } from '../../toast';
import { server } from '../../sync';
import { relative } from '../../utils';
import { mark, t, tn } from '../../i18n';

type Rec = { type: string; host: string; value: string; note: string; key: string };
type Checks = { at: string; allOk: boolean; checks: { key: string; ok: boolean; found: string; want: string }[] } | null;
type Owner = { domain: string; state: 'verified' | 'pending' | 'held' | 'taken'; record: { value: string } } | null;
interface Info {
  domain: string;
  records: Rec[];
  checks: Checks;
  ownership?: Owner;
  dnsHost?: { name: string; where: string } | null;
}

const lower = (s: string) => s.toLowerCase();

/** What a domain's row says: what the last check saw, in the words people use. */
export function domainStatus(ws: Workspace, d: string): { tone: BadgeTone; label: string } {
  const c = ws.domainChecks?.[lower(d)];
  const primary = d === primaryDomain(ws);
  if (c?.owner === 'held' || c?.owner === 'taken') return { tone: 'bad', label: t('Another company uses it') };
  const allOk = c?.allOk ?? (primary ? ws.mailChecks?.allOk : undefined);
  if (allOk || (primary && ws.mailReady?.receive && ws.mailReady?.send)) return { tone: 'good', label: t('Mail working') };
  if (c?.owner === 'verified') return { tone: 'info', label: t('Verified') };
  return { tone: 'warn', label: t('Waiting for DNS') };
}

/** Addresses on a domain: mailboxes, shared inboxes, groups and extra addresses. Temporary addresses don't count. */
function usersOf(ws: Workspace, d: string) {
  const at = (a?: string) => lower(String(a ?? '').split('@')[1] ?? '');
  return [...ws.accounts.filter((a) => !a.temp).map((a) => a.email), ...(ws.mailAliases ?? []).map((a) => a.address), ...(ws.mailGroups ?? []).map((g) => g.address)].filter((a) => at(a) === lower(d));
}

async function post(path: string, body: unknown) {
  const r = await fetch(`/api/mail/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  const err = (data as { error?: string }).error;
  if (!r.ok) throw new Error(err ? t(err) : t('Something went wrong.'));
  return data;
}

/** The records for one domain, and whether they're there; loads when shown. */
function Records({ ws, domain, canManage, again }: { ws: Workspace; domain: string; canManage: boolean; again?: number }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState('');
  const load = (tries = 0): Promise<void> =>
    fetch(`/api/mail/setup?ws=${encodeURIComponent(ws.id)}&setup=${ws.emailSetup ?? 'none'}&provider=${ws.emailProvider ?? ''}&domain=${encodeURIComponent(domain)}`)
      .then(async (r) => {
        if (!r.ok) return setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? mark('Could not load.'));
        const i = (await r.json()) as Info;
        // A domain added a moment ago may not have reached the server yet: ask again shortly.
        if (lower(i.domain) !== lower(domain) && tries < 6) return void setTimeout(() => void load(tries + 1), 700);
        setError('');
        setInfo(i);
      })
      .catch(() => setError(mark('No connection.')));
  useEffect(() => {
    if (!server.on) return setError(mark('Records show once you’re connected to the server.'));
    void load();
  }, [ws.id, domain, ws.emailSetup, ws.emailProvider, ws.mailRoute, again, ws.domainChecks?.[lower(domain)]?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const check = async () => {
    setChecking(true);
    try {
      const r = (await post('check', { workspaceId: ws.id, domain })) as Checks;
      toast({ text: r?.allOk ? t('All records for {domain} are in place.', { domain }) : t('Some records for {domain} are still missing.', { domain }) });
      await load();
    } catch (e) {
      toast({ text: (e as Error).message });
    } finally {
      setChecking(false);
    }
  };
  const copy = (v: string) => {
    void navigator.clipboard?.writeText(v);
    setCopied(v);
    setTimeout(() => setCopied(''), 1500);
  };
  const res = (key: string) => info?.checks?.checks.find((c) => c.key === key);
  const copyBtn = (v: string) => (
    <button type="button" className="icon-btn sm" title={t('Copy')} aria-label={t('Copy')} onClick={() => copy(v)}>
      {copied === v ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
  return (
    <div className="dm-records">
      {error && <p className="small muted">{t(error)}</p>}
      {!info && !error && (
        <p className="small muted dm-wait">
          <Loader2 size={14} className="spin" /> {t('Looking up {domain}…', { domain })}
        </p>
      )}
      {info && (
        <>
          {(info.ownership?.state === 'held' || info.ownership?.state === 'taken') && (
            <p className="ed-owner bad">
              <AlertTriangle size={15} />
              <span>
                <strong>{t('Another company uses {domain}.', { domain })}</strong> {t('Add the TXT record below to prove it’s yours, then check again.')}
              </span>
            </p>
          )}
          <p className="small muted">
            {info.dnsHost ? t('{domain}’s DNS is at {host}. Add these there: {where}.', { domain, host: info.dnsHost.name, where: info.dnsHost.where }) : t('Add these where {domain}’s DNS is managed, usually where you bought the domain.', { domain })} {t('Changes can take up to an hour to show.')}
          </p>
          <div className="ed-records">
            {info.ownership && info.ownership.state !== 'verified' && (
              <div className={`ed-record ${res('verify') ? (res('verify')!.ok ? 'ok' : 'bad') : ''}`}>
                <span className="ed-rec-type mono">TXT</span>
                <span className="ed-rec-main">
                  <span className="ed-rec-host mono">@</span>
                  <span className="ed-rec-value">
                    <code className="mono">{info.ownership.record.value}</code>
                    {copyBtn(info.ownership.record.value)}
                  </span>
                  <small className="muted">{t('Proves the domain is yours. It also verifies by itself once the other records are in place.')}</small>
                </span>
                <span className="ed-rec-state" />
              </div>
            )}
            {info.records
              .filter((r) => r.key !== 'verify')
              .map((r) => {
                const x = res(r.key);
                return (
                  <div key={r.key + r.host} className={`ed-record ${x ? (x.ok ? 'ok' : 'bad') : ''}`}>
                    <span className="ed-rec-type mono">{r.type}</span>
                    <span className="ed-rec-main">
                      <span className="ed-rec-host mono">{r.host.startsWith('(') ? t(r.host) : r.host}</span>
                      <span className="ed-rec-value">
                        <code className="mono">{r.value.startsWith('(') || r.host.startsWith('(') ? t(r.value) : r.value}</code>
                        {!r.value.startsWith('(') && copyBtn(r.value)}
                      </span>
                      <small className="muted">{t(r.note)}</small>
                      {x && !x.ok && <small className="ed-found">{t('Found: {found}', { found: t(x.found) })}</small>}
                    </span>
                    <span className="ed-rec-state">{x ? x.ok ? <Check size={15} /> : <AlertTriangle size={15} /> : null}</span>
                  </div>
                );
              })}
          </div>
          <div className="dm-check">
            {info.checks ? (
              <small className={info.checks.allOk ? 'ed-ok' : 'muted'}>
                {info.checks.allOk ? t('Everything is in place.') : t('{missing} of {total} still missing.', { missing: info.checks.checks.filter((c) => !c.ok).length, total: info.checks.checks.length })} {t('Checked {ago}.', { ago: relative(info.checks.at) })}
              </small>
            ) : (
              <small className="muted">{t('Not checked yet.')}</small>
            )}
            {canManage && (
              <button type="button" className="ghost-btn sm outline" disabled={checking} onClick={() => void check()}>
                {checking ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} {checking ? t('Checking…') : t('Check now')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Add a domain: type it, it's added, then the records to put at the domain's DNS with Check now. */
function AddDomain({ ws, onWorkspace, onClose }: { ws: Workspace; onWorkspace: (p: Partial<Workspace>) => void; onClose: () => void }) {
  const [raw, setRaw] = useState('');
  const [added, setAdded] = useState<string | null>(null);
  const d = cleanDomain(raw);
  const have = ws.domains.some((x) => lower(x) === d);
  const valid = validDomain(d) && !have;
  const add = () => {
    if (!valid) return;
    onWorkspace({ domains: [...ws.domains, d], ...(ws.domains.length ? {} : { primaryDomain: d }) });
    setAdded(d);
  };
  return (
    <Layer>
      <div className="modal-scrim" onMouseDown={onClose}>
        <div className="modal dm-modal" role="dialog" aria-label={t('Add a domain')} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
          <header className="modal-head">
            <span>{added ? t('Add these records for {domain}', { domain: added }) : t('Add a domain')}</span>
            <button type="button" className="icon-btn sm" onClick={onClose} aria-label={t('Close')}>
              <X size={15} />
            </button>
          </header>
          <div className="modal-body">
            <SmoothHeight>
              {!added ? (
                <>
                  <p className="modal-intro">{t('A domain you own, like shop.com. People can then get addresses there, and mail for it can arrive here.')}</p>
                  <div className="field">
                    <label htmlFor="dm-new">{t('Domain')}</label>
                    <input id="dm-new" autoFocus inputMode="url" autoCapitalize="off" autoComplete="off" spellCheck={false} value={raw} onChange={(e) => setRaw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="shop.com" />
                    {raw.trim() && have && <small className="err">{t('{domain} is already one of your domains.', { domain: d })}</small>}
                    {raw.trim() && !have && !validDomain(d) && <small className="err">{t('That isn’t a domain. Type it like shop.com.')}</small>}
                  </div>
                </>
              ) : (
                <Records ws={ws} domain={added} canManage />
              )}
            </SmoothHeight>
          </div>
          <footer className="modal-foot">
            {!added ? (
              <>
                <button type="button" className="ghost-btn" onClick={onClose}>
                  {t('Cancel')}
                </button>
                <button type="button" className="primary-btn" disabled={!valid} onClick={add}>
                  {t('Add domain')}
                </button>
              </>
            ) : (
              <button type="button" className="primary-btn" onClick={onClose}>
                {t('Done')}
              </button>
            )}
          </footer>
        </div>
      </div>
    </Layer>
  );
}

export function DomainsSection({ ws, canManage, onWorkspace }: { ws: Workspace; canManage: boolean; onWorkspace: (p: Partial<Workspace>) => void }) {
  const list = orderedDomains(ws);
  const primary = primaryDomain(ws);
  const rows = useLeaving(list, (d) => d);
  const [open, setOpen] = useState<string | null>(null);
  const [seen, setSeen] = useState<string[]>([]); // opened once: stays rendered so closing folds smoothly
  useEffect(() => void (open && !seen.includes(open) && setSeen((x) => [...x, open])), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [adding, setAdding] = useState(false);
  const makePrimary = (d: string) => {
    const was = primary;
    onWorkspace({ primaryDomain: d });
    toastUndo(t('{domain} is now the primary domain.', { domain: d }), () => onWorkspace({ primaryDomain: was || undefined }));
  };
  const remove = (d: string) => {
    const using = usersOf(ws, d);
    if (using.length)
      return toast({ text: tn(using.length, '{domain} still has {n} address on it ({list}). Move or remove it first.', '{domain} still has {n} addresses on it ({list}). Move or remove them first.', { domain: d, list: using.slice(0, 3).join(', ') + (using.length > 3 ? '…' : '') }), ms: 7000 });
    if (d === primary && ws.domains.length > 1) return toast({ text: t('{domain} is the primary domain. Make another one primary first.', { domain: d }) });
    const before = { domains: ws.domains, primaryDomain: ws.primaryDomain, brands: ws.brands };
    const brands = ws.brands?.map((b) => ({ ...b, domains: b.domains.filter((x) => x !== d) }));
    setOpen(null);
    onWorkspace({ domains: ws.domains.filter((x) => x !== d), primaryDomain: d === primary ? undefined : ws.primaryDomain, ...(brands ? { brands } : {}) });
    toastUndo(t('{domain} removed', { domain: d }), () => onWorkspace(before));
  };
  return (
    <>
      <h2>{t('Domains')}</h2>
      <p className="set-intro">{t('Every domain {company} uses for email. People, shared inboxes and addresses can be on any of them. New addresses start on the primary domain.', { company: ws.name || t('the company') })}</p>
      {!canManage && <p className="modal-note">{t('Only owners and admins can change domains.')}</p>}
      {!list.length ? (
        <EmptyState compact icon={<Globe size={20} />} title={t('No domain yet')} text={t('Your addresses live at our address for now. Add the domain you own to use it for email.')} />
      ) : (
        <div className="acct-list dm-list">
          {rows.map(({ item: d, leaving }) => {
            const st = domainStatus(ws, d);
            const n = usersOf(ws, d).length;
            const isOpen = open === d;
            return (
              <div key={d} className={`acct-block${leaving ? ' row-leaving' : ''}`}>
                <div className="acct-row dm-row">
                  <span className="acct-icon">
                    <Globe size={16} />
                  </span>
                  <span className="acct-info">
                    <strong>
                      {d} {d === primary && <Badge tone="accent" small>{t('Primary')}</Badge>}
                    </strong>
                    <small>{n ? tn(n, '{n} address', '{n} addresses') : t('No addresses yet')}</small>
                      <span className="dm-status-inline"><Badge tone={st.tone} small>{st.label}</Badge></span>
                  </span>
                  <span className="dm-status"><Badge tone={st.tone}>{st.label}</Badge></span>
                  <button type="button" className={`icon-btn sm dm-toggle ${isOpen ? 'on' : ''}`} aria-expanded={isOpen} aria-label={isOpen ? t('Hide {domain}', { domain: d }) : t('Show {domain}', { domain: d })} onClick={() => setOpen((x) => (x === d ? null : d))}>
                    <ChevronRight size={16} className={`rot-chev ${isOpen ? 'open' : ''}`} />
                  </button>
                </div>
                <div className={`fold ${isOpen ? 'open' : ''}`}>
                  <div>
                    {(isOpen || seen.includes(d)) && (
                      <div className="dm-body">
                        <Records ws={ws} domain={d} canManage={canManage} />
                        {canManage && (
                          <div className="dm-actions">
                            {d !== primary && (
                              <button type="button" className="ghost-btn sm outline" onClick={() => makePrimary(d)}>
                                <Star size={14} /> {t('Make primary')}
                              </button>
                            )}
                            <button type="button" className="ghost-btn sm danger" onClick={() => remove(d)}>
                              <Trash2 size={14} /> {t('Remove domain')}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {canManage && (
        <button type="button" className="acct-add" onClick={() => setAdding(true)}>
          <Plus size={16} /> <span>{t('Add domain')}</span>
        </button>
      )}
      {adding && <AddDomain ws={ws} onWorkspace={onWorkspace} onClose={() => setAdding(false)} />}
    </>
  );
}
