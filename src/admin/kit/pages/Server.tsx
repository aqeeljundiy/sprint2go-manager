// System › Server: is the machinery fine, what is failing, the backups, and the switches (maintenance mode, feature
// switches). The 18 environment names fold behind "Server settings (technical)" (the why review, Platform).
import { useState } from 'react';
import { bytes, dateTime, post, rel } from '../../api';
import { useAct, useAdmin, useApi } from '../../ui';
import { Card, Chip, Failed, Page, Tabs, esc, useKitList } from '../parts';
import { t, tn } from '../../../i18n';

interface System {
  version: string; commit: string | null; built: string | null; node: string; uptimeSeconds: number; production: boolean; publicUrl: string; https: boolean;
  disk: { free: number; total: number }; dbBytes: number; backups: { file: string; bytes: number; at: string }[]; lastBackupAt: string | null;
  offsite: { configured: boolean; where: string | null; last: string | null; error: string | null };
  cert: { source: string; daysLeft: number; trusted: boolean; error: string | null };
  liveConnections: number; sessions: number; flags: { key: string; set: boolean }[];
  recorder: { configured: boolean; reachable: boolean };
  warnings: { kind: string; level: 'high' | 'normal'; text: string; to?: string }[];
  backupTest: { at: string; ok: boolean; detail: string } | null;
}
interface ErrorGroup { id: string; source: 'server' | 'client'; message: string; sample: string; path: string | null; count: number; firstAt: string; lastAt: string; users: number; companies: string[]; resolvedAt: string | null }
interface Product { flags: Record<string, { description: string; mode: 'off' | 'on' | 'list' | 'percent'; companies: string[]; percent: number }>; maintenance: { on: boolean; message: string } }

export function Server({ tab }: { tab?: string }) {
  const [view, setView] = useState(['health', 'errors', 'backups', 'switches'].includes(tab ?? '') ? tab! : 'health');
  return (
    <Page title={t('Server')} sub={t('Is everything running, what is failing, and the switches.')}>
      <Tabs id="server-tabs" value={view} onChange={(v) => (history.replaceState(null, '', `/admin/v2/server/${v}`), setView(v))} items={[{ id: 'health', label: t('Health') }, { id: 'errors', label: t('Errors') }, { id: 'backups', label: t('Backups') }, { id: 'switches', label: t('Switches') }]} />
      {view === 'errors' ? <Errors /> : view === 'switches' ? <Switches /> : <Health backups={view === 'backups'} />}
    </Page>
  );
}

const v2 = (to?: string) => to?.replace('/admin/platform/mail', '/admin/v2/mail').replace('/admin/platform/errors', '/admin/v2/server/errors').replace(/^\/admin\/ai.*/, '/admin/v2/ai').replace(/^\/admin(?!\/v2)/, '/admin/v2');

function Health({ backups }: { backups: boolean }) {
  const { may } = useAdmin();
  const act = useAct();
  const { data: s, error, reload } = useApi<System>('system');
  const [busy, setBusy] = useState(false);
  if (error) return <Failed error={error} retry={reload} />;
  if (!s) return <section className="ak-card"><ak-placeholder lines="6" /></section>;
  const run = (path: string, done: string) => (setBusy(true), void act(() => post(path), done).then(() => (setBusy(false), reload())));
  if (backups)
    return (
      <div className="s2k-split">
        <Card title={t('Backups')} aside={may('platform') && <div className="s2k-row"><button className="ak-btn" type="button" disabled={busy} onClick={() => run('backup/test', t('Latest backup tested'))}>{t('Test the latest')}</button><button className="ak-btn ak-btn--primary" type="button" disabled={busy} onClick={() => run('backup/now', t('Backup made'))}>{t('Back up now')}</button></div>} flush>
          <ul className="s2k-rows">{s.backups.map((b) => <li key={b.file}><span className="s2k-rows__main"><b>{b.file}</b><small>{dateTime(b.at)}</small></span><span className="s2k-num">{bytes(b.bytes)}</span></li>)}</ul>
        </Card>
        <Card title={t('Is the backup good?')}>
          <dl className="s2k-kv">
            <dt>{t('Last tested')}</dt><dd>{s.backupTest ? <>{rel(s.backupTest.at)} <Chip tone={s.backupTest.ok ? 'success' : 'danger'}>{s.backupTest.ok ? t('Restores fine') : t('Broken')}</Chip><br /><span className="ak-muted">{s.backupTest.detail}</span></> : t('never')}</dd>
            <dt>{t('Copy off this server')}</dt><dd>{s.offsite.configured ? (s.offsite.error ? <Chip tone="danger">{s.offsite.error}</Chip> : t('{where}, last {ago}', { where: s.offsite.where ?? '', ago: s.offsite.last ? rel(s.offsite.last) : t('never') })) : <Chip tone="warn">{t('Not set up')}</Chip>}</dd>
          </dl>
        </Card>
      </div>
    );
  return (
    <>
      {s.warnings.map((w) => <div key={w.kind} className="ak-banner" data-tone={w.level === 'high' ? 'danger' : 'warn'}><div><strong>{w.text}</strong></div>{w.to && <a className="ak-btn" href={v2(w.to)}>{t('Open')}</a>}</div>)}
      <ak-stats>
        <ak-stat label={t('Up for')} value={String(Math.round(s.uptimeSeconds / 3600))} hint={t('hours since the last restart')} count-in="off" />
        <ak-stat label={t('People online now')} value={String(s.liveConnections)} hint={tn(s.sessions, '{n} signed-in session', '{n} signed-in sessions')} count-in="off" />
        <ak-stat label={t('Disk free')} value={String(s.disk.free / s.disk.total)} format="percent" hint={t('{free} of {total}', { free: bytes(s.disk.free), total: bytes(s.disk.total) })} tone={s.disk.free / s.disk.total < 0.1 ? 'danger' : undefined} count-in="off" />
        <ak-stat label={t('Last backup')} value={String(s.backups.length)} hint={s.lastBackupAt ? rel(s.lastBackupAt) : t('never')} href="/admin/v2/server/backups" count-in="off" />
      </ak-stats>
      <div className="ak-columns">
        <Card title={t('What is running')}>
          <dl className="s2k-kv">
            <dt>{t('Version')}</dt><dd>{s.version}{s.commit ? ` (${s.commit.slice(0, 7)})` : ''}{s.built ? ` · ${t('built {ago}', { ago: rel(s.built) })}` : ''}</dd>
            <dt>{t('Address')}</dt><dd>{s.publicUrl} {s.https ? <Chip tone="success">HTTPS</Chip> : <Chip tone="warn">{t('No HTTPS')}</Chip>}</dd>
            <dt>{t('Certificate')}</dt><dd>{s.cert.trusted ? t('{n} days left', { n: s.cert.daysLeft }) : <Chip tone="warn">{t('Self-signed')}</Chip>}</dd>
            <dt>{t('Database')}</dt><dd>{bytes(s.dbBytes)}</dd>
            <dt>{t('Meeting recorder')}</dt><dd>{!s.recorder.configured ? <Chip>{t('Not set up')}</Chip> : s.recorder.reachable ? <Chip tone="success">{t('Working')}</Chip> : <Chip tone="danger">{t('Not answering')}</Chip>}</dd>
          </dl>
        </Card>
        <Card title={t('Server settings (technical)')}>
          <details>
            <summary className="ak-muted">{tn(s.flags.length, '{n} setting', '{n} settings')} · {t('{n} not set', { n: s.flags.filter((f) => !f.set).length })}</summary>
            <div className="s2k-row">{s.flags.map((f) => <Chip key={f.key} tone={f.set ? 'success' : 'neutral'} plain>{f.key}</Chip>)}</div>
          </details>
        </Card>
      </div>
    </>
  );
}

function Errors() {
  const { may } = useAdmin();
  const act = useAct();
  const { data, error, reload } = useApi<{ errors: ErrorGroup[] }>('errors');
  const { el } = useKitList<ErrorGroup>(
    () => ({
      id: 'er',
      rowId: (e) => e.id,
      searchLabel: t('Search the error or address'),
      search: (e) => [e.message, e.path, e.companies.join(' ')].join(' '),
      views: [{ value: 'open', label: t('Still happening'), test: (e) => !e.resolvedAt, count: true }, { value: 'all', label: t('All') }],
      sort: { key: 'last', dir: -1 },
      columns: [
        { key: 'msg', label: t('Error'), primary: true, truncate: true, cell: (e) => `<b>${esc(e.message)}</b><br><span class="ak-muted">${esc(e.source === 'client' ? t('in the browser') : t('on the server'))}${e.path ? ' · ' + esc(e.path) : ''}</span>` },
        { key: 'count', label: t('Times'), align: 'end', sort: 'number', value: (e) => e.count, cell: (e) => String(e.count) },
        { key: 'who', label: t('People'), hidePhone: true, align: 'end', sort: 'number', value: (e) => e.users, cell: (e) => String(e.users) },
        { key: 'last', label: t('Last'), align: 'end', sort: 'date', value: (e) => e.lastAt, cell: (e) => esc(rel(e.lastAt)) },
      ],
      bulk: may('platform') ? [{ key: 'fix', label: t('Mark fixed'), run: (rows) => void act(() => post('error/resolve', { ids: rows.map((r) => r.id) }), tn(rows.length, '{n} marked fixed', '{n} marked fixed')).then(reload) }] : [],
      summary: (rows) => tn(rows.length, '{n} error', '{n} errors'),
      empty: { views: { open: `<b>${esc(t('Nothing failing.'))}</b>` } },
    }),
    data?.errors ?? null,
  );
  return <>{error && <Failed error={error} retry={reload} />}{el}</>;
}

function Switches() {
  const { may } = useAdmin();
  const act = useAct();
  const { data, error, reload } = useApi<Product>('product');
  const [msg, setMsg] = useState<string | null>(null);
  if (error) return <Failed error={error} retry={reload} />;
  if (!data) return <section className="ak-card"><ak-placeholder lines="4" /></section>;
  const can = may('product');
  const text = msg ?? data.maintenance.message;
  const flip = async (on: boolean) => {
    if (on && !(await window.AdminKit.confirm({ title: t('Turn on maintenance mode?'), body: t('Everyone sees the message and nobody can change anything until you turn it off.'), confirmLabel: t('Turn on'), tone: 'danger' }))) return;
    void act(() => post('maintenance', { on, message: text }), on ? t('Maintenance mode on') : t('Maintenance mode off')).then(reload);
  };
  return (
    <div className="ak-columns">
      <Card title={t('Maintenance mode')}>
        <div className="s2k-form">
          {data.maintenance.on && <div className="ak-banner" data-tone="danger"><div><strong>{t('On now')}</strong>{t('Customers can read but not change anything.')}</div></div>}
          <div className="ak-field"><label htmlFor="mt-msg">{t('What customers see')}</label><textarea id="mt-msg" className="ak-input" rows={3} disabled={!can} value={text} onChange={(e) => setMsg(e.target.value)} /></div>
          {can && <div className="s2k-row"><button className={`ak-btn ${data.maintenance.on ? '' : 'ak-btn--danger'}`} type="button" onClick={() => void flip(!data.maintenance.on)}>{data.maintenance.on ? t('Turn off') : t('Turn on…')}</button></div>}
        </div>
      </Card>
      <Card title={t('Feature switches')} aside={<span className="ak-muted">{t('For code that checks them')}</span>} flush>
        {Object.keys(data.flags).length === 0 ? <div className="ak-card__body ak-muted">{t('No switches yet. A developer adds one when new code should reach only some companies first.')}</div> : (
          <ul className="s2k-rows">
            {Object.entries(data.flags).map(([k, f]) => (
              <li key={k}>
                <span className="s2k-rows__main"><b>{k}</b><small>{f.description}</small></span>
                <Chip tone={f.mode === 'on' ? 'success' : f.mode === 'off' ? 'neutral' : 'info'}>{f.mode === 'on' ? t('On for everyone') : f.mode === 'off' ? t('Off') : f.mode === 'percent' ? t('{n}% of companies', { n: f.percent }) : tn(f.companies.length, '{n} company', '{n} companies')}</Chip>
                {can && <button className="ak-btn" type="button" onClick={() => void act(() => post('flag', { key: k, description: f.description, companies: f.companies, percent: f.percent, mode: f.mode === 'on' ? 'off' : 'on' }), t('Switch changed')).then(reload)}>{f.mode === 'on' ? t('Turn off') : t('Turn on for everyone')}</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
