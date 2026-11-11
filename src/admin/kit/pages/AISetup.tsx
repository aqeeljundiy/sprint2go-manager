// System › AI setup: our keys, the model for each job, and what each model costs. Setup, not business: whether the
// AI plan pays for itself is on Money › AI margin.
import { useState } from 'react';
import { post, rel, rp } from '../../api';
import { useAct, useAdmin, useApi } from '../../ui';
import { Card, Chip, Drawer, Dropdown, Failed, Page, Tabs } from '../parts';
import { t, tn } from '../../../i18n';

interface Choice { provider: string; model: string; providerName?: string; name?: string }
interface Opt { provider: string; providerName: string; model: string; name: string; hasKey: boolean; recommended?: boolean; gone?: boolean }
interface KeyRow { id: string; provider: string; name: string; source: 'saved' | 'server'; last4: string; on: boolean; inUse: boolean; addedBy: string | null; addedAt: string | null; jobs: string[]; testOk: boolean | null; testError: string | null; usedAt: string | null; failedAt: string | null; failError: string | null }
interface JobRow { id: string; name: string; hint: string; primary: Choice; fallback: Choice | null; state: 'ok' | 'fallback' | 'none'; gone: string | null; per100: number | null }
interface PriceRow { model: string; name: string; providers: string[]; price: [number, number] | null; uses: number; usedBy: string[] }
interface AIData { can: boolean; keys: KeyRow[]; providers: { id: string; name: string; keyHint: string; needsUrl: boolean; warn: string | null; supported: boolean; saved: boolean }[]; jobs: JobRow[]; options: { text: Opt[]; speech: Opt[] }; prices: PriceRow[]; problems: { kind: string; text: string; level: 'high' | 'normal' }[] }

const val = (c: Choice | null) => (c ? `${c.provider}|${c.model}` : '');
const choice = (v: string) => (v ? { provider: v.split('|')[0], model: v.split('|').slice(1).join('|') } : null);

export function AISetup({ tab }: { tab?: string }) {
  const [view, setView] = useState(['keys', 'models', 'prices'].includes(tab ?? '') ? tab! : 'keys');
  const { data, error, reload } = useApi<AIData>('ai');
  return (
    <Page title={t('AI setup')} sub={t('Our keys, the model for each job, and model prices. Only AI-plan companies, trials and free months use our keys.')}>
      {error && <Failed error={error} retry={reload} />}
      {data?.problems.map((p) => <div key={p.kind} className="ak-banner" data-tone={p.level === 'high' ? 'danger' : 'warn'}><div><strong>{p.text}</strong></div></div>)}
      <Tabs id="ai-tabs" value={view} onChange={(v) => (history.replaceState(null, '', `/admin/v2/ai/${v}`), setView(v))} items={[{ id: 'keys', label: t('Our keys'), count: data?.keys.length }, { id: 'models', label: t('Models per job') }, { id: 'prices', label: t('Model prices') }]} />
      {!data ? <section className="ak-card"><ak-placeholder kind="list" rows="4" /></section> : view === 'models' ? <Models d={data} reload={reload} /> : view === 'prices' ? <Prices d={data} /> : <Keys d={data} reload={reload} />}
    </Page>
  );
}

function Keys({ d, reload }: { d: AIData; reload: () => void }) {
  const { may } = useAdmin();
  const act = useAct();
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState('');
  const [key, setKey] = useState('');
  const can = may('platform') && d.can;
  const p = d.providers.find((x) => x.id === provider);
  return (
    <>
      <Card title={t('Our keys')} aside={can && <button className="ak-btn ak-btn--primary" type="button" onClick={() => setAdding(true)}>{t('Add a key')}</button>} flush>
        {d.keys.length === 0 ? <div className="ak-card__body ak-muted">{t('No key yet: AI-plan companies cannot use AI until one is added.')}</div> : (
          <ul className="s2k-rows">
            {d.keys.map((k) => (
              <li key={k.id}>
                <span className="s2k-rows__main"><b>{k.name} ···{k.last4}</b><small>{k.failedAt ? t('failed {ago}: {why}', { ago: rel(k.failedAt), why: k.failError ?? '' }) : k.usedAt ? t('last used {ago}', { ago: rel(k.usedAt) }) : t('not used yet')} · {tn(k.jobs.length, 'used for {n} job', 'used for {n} jobs')}</small></span>
                <Chip tone={!k.on ? 'neutral' : k.failedAt ? 'danger' : 'success'}>{!k.on ? t('Off') : k.failedAt ? t('Failing') : t('Working')}</Chip>
                {can && <label className="s2k-row"><span className="ak-muted">{t('On')}</span><input type="checkbox" className="ak-switch" role="switch" checked={k.on} onChange={() => void act(() => post('ai/key/switch', { provider: k.provider, source: k.source, on: !k.on }), k.on ? t('Key off') : t('Key on')).then(reload)} /></label>}
                {can && k.source === 'saved' && <button className="ak-btn ak-btn--ghost" type="button" onClick={() => void window.AdminKit.confirm({ title: t('Remove the {name} key?', { name: k.name }), body: t('Jobs that use it move to their fallback model.'), confirmLabel: t('Remove key'), tone: 'danger' }).then((ok) => ok && void act(() => post('ai/key/remove', { provider: k.provider }), t('Key removed')).then(reload))}>{t('Remove')}</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Drawer open={adding} onClose={() => setAdding(false)} heading={t('Add a key')}>
        <form className="s2k-form" onSubmit={(e) => (e.preventDefault(), void act(() => post('ai/key', { provider, key: key.trim() }), t('Key saved and tested')).then((ok) => ok && (setAdding(false), setKey(''), reload())))}>
          <div className="ak-field"><label>{t('Provider')}</label><Dropdown block label={t('Provider')} value={provider} onChange={setProvider} options={[{ value: '', label: t('Choose a provider') }, ...d.providers.filter((x) => x.supported && !x.needsUrl).map((x) => ({ value: x.id, label: x.name }))]} /></div>
          {p && <p className="ak-muted">{p.keyHint}{p.warn ? ` · ${p.warn}` : ''}</p>}
          <div className="ak-field"><label htmlFor="ai-key">{t('Key')}</label><input id="ai-key" className="ak-input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} /></div>
          <p className="ak-muted">{t('Providers that need an address as well are added from the v1 console for now.')}</p>
          <div className="s2k-row"><button className="ak-btn ak-btn--primary" disabled={!provider || key.trim().length < 8}>{t('Save key')}</button><button className="ak-btn ak-btn--ghost" type="button" onClick={() => setAdding(false)}>{t('Cancel')}</button></div>
        </form>
      </Drawer>
    </>
  );
}

function Models({ d, reload }: { d: AIData; reload: () => void }) {
  const { may } = useAdmin();
  const act = useAct();
  const can = may('platform') && d.can;
  const opts = d.options.text.map((o) => ({ value: `${o.provider}|${o.model}`, label: `${o.name} · ${o.providerName}${o.hasKey ? '' : ` (${t('no key')})`}` }));
  return (
    <Card flush>
      <ul className="s2k-rows">
        {d.jobs.map((j) => (
          <li key={j.id}>
            <span className="s2k-rows__main"><b>{j.name}</b><small>{j.hint}{j.per100 ? ` · ${t('{amount} per 100 uses', { amount: rp(j.per100) })}` : ''}{j.gone ? ` · ${j.gone}` : ''}</small></span>
            <Chip tone={j.state === 'ok' ? 'success' : j.state === 'fallback' ? 'warn' : 'danger'}>{j.state === 'ok' ? t('Working') : j.state === 'fallback' ? t('On its fallback') : t('No key')}</Chip>
            <Dropdown label={t('First choice for {job}', { job: j.name })} disabled={!can} value={val(j.primary)} options={opts} onChange={(v) => void act(() => post('ai/job', { job: j.id, primary: choice(v), fallback: j.fallback && { provider: j.fallback.provider, model: j.fallback.model } }), t('Saved')).then(reload)} />
            <Dropdown label={t('Fallback for {job}', { job: j.name })} disabled={!can} value={val(j.fallback)} options={[{ value: '', label: t('No fallback') }, ...opts]} onChange={(v) => void act(() => post('ai/job', { job: j.id, primary: { provider: j.primary.provider, model: j.primary.model }, fallback: choice(v) }), t('Saved')).then(reload)} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Prices({ d }: { d: AIData }) {
  return (
    <Card title={t('What each model costs us')} aside={<span className="ak-muted">{t('Per million tokens, in and out')}</span>} flush>
      <ul className="s2k-rows">
        {d.prices.map((p) => (
          <li key={p.model}>
            <span className="s2k-rows__main"><b>{p.name}</b><small>{p.providers.join(', ')} · {tn(p.uses, '{n} use this month', '{n} uses this month')}</small></span>
            <span className="s2k-num">{p.price ? `US$${p.price[0]} / US$${p.price[1]}` : <Chip tone="warn">{t('No price')}</Chip>}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
