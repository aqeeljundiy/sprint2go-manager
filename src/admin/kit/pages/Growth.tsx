// Business › Growth: are more people signing up, where do they come from, do companies stay.
// Every funnel step shows what was lost on the way (layout.md: "the loss between steps written out").
import { useApi } from '../../ui';
import { Card, Failed, Page } from '../parts';
import { t, tn } from '../../../i18n';

interface GrowthData {
  days: number;
  funnel: { key: string; label: string; n: number }[];
  sources: { source: string; visits: number; signups: number }[];
  cohorts: { week: string; companies: number; weeks: (number | null)[] }[];
  apps: { total: number; rows: { label: string; companies: number }[] };
}

export function Growth() {
  const { data, error, reload } = useApi<GrowthData>('growth');
  if (error) return <Page title={t('Growth')}><Failed error={error} retry={reload} /></Page>;
  const f = data?.funnel ?? [];
  const top = Math.max(1, ...f.map((s) => s.n));
  return (
    <Page title={t('Growth')} sub={data ? t('The last {n} days.', { n: data.days }) : undefined}>
      <ak-stats>
        {f.filter((s) => ['started', 'company', 'used', 'paid'].includes(s.key)).map((s) => <ak-stat key={s.key} label={s.label} value={String(s.n)} count-in="off" />)}
      </ak-stats>
      <div className="s2k-split">
        <Card title={t('From visit to paying')} flush>
          {!data ? <ak-placeholder lines="6" /> : (
            <ul className="s2k-rows">
              {f.map((s, i) => {
                const prev = i ? f[i - 1].n : 0;
                const lost = i && prev > 0 ? Math.round((1 - s.n / prev) * 100) : null;
                return (
                  <li key={s.key}>
                    <span className="s2k-rows__main">
                      <b>{s.label}</b>
                      <small>{i === 0 ? t('the start') : lost === null ? t('no one at the step before: counted from companies made another way (operators, invites)') : lost > 0 ? t('{pct}% lost after the step before', { pct: lost }) : t('nobody lost')}</small>
                    </span>
                    <span className="s2k-bar" style={{ ['--w' as string]: `${(s.n / top) * 100}%` }} aria-hidden="true" />
                    <span className="s2k-num">{s.n}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title={t('Where sign-ups come from')}>
          {!data ? <ak-placeholder lines="4" /> : data.sources.length === 0 ? <p className="ak-muted">{t('No visits counted yet. Links with ?ref= or utm_source show up here.')}</p> : <ak-chart type="bar" label={t('Sign-ups by source')} values={data.sources.map((s) => s.signups).join(',')} labels={data.sources.map((s) => s.source).join(',')} />}
        </Card>
      </div>
      <div className="ak-columns">
        <Card title={t('Do they come back?')} aside={<span className="ak-muted">{t('Companies still active, by the week they started')}</span>} flush>
          <ul className="s2k-rows">
            {(data?.cohorts ?? []).filter((c) => c.companies > 0).map((c) => (
              <li key={c.week}><span className="s2k-rows__main"><b>{t('Week of {day}', { day: c.week.slice(5) })}</b><small>{tn(c.companies, '{n} company', '{n} companies')}</small></span><span className="s2k-num">{c.weeks.map((w) => (w === null ? '·' : `${w}%`)).join('  ')}</span></li>
            ))}
          </ul>
        </Card>
        <Card title={t('Which apps companies use')} flush>
          <ul className="s2k-rows">{(data?.apps.rows ?? []).map((a) => <li key={a.label}><span className="s2k-rows__main"><b>{a.label}</b></span><span className="s2k-num">{a.companies} / {data!.apps.total}</span></li>)}</ul>
        </Card>
      </div>
    </Page>
  );
}
