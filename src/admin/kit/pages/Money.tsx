// Business › Money: what we earn per month and who pays what; this month's invoices; the price list; whether the AI
// plan pays for itself; our invoice details and the unpaid-invoice rule (moved here from Team & settings).
// Revenue is defined once: the monthly revenue booked from every company's plan now (the server's `mrr`). The old
// chart's "Nov: Rp 118 rb" was the movement worked out from the month's first daily snapshot, not revenue.
import { useEffect, useState } from 'react';
import { day, monthName, planLabel, post, rp, rpShort, STATE_LABEL, type CompanyRow } from '../../api';
import { useAct, useAdmin, useApi } from '../../ui';
import { Card, Chip, Drawer, Dropdown, Failed, Page, Tabs, esc, useKitList, type Tone } from '../parts';
import { t, tn } from '../../../i18n';

type Tab = 'revenue' | 'invoices' | 'prices' | 'ai' | 'settings';

export function Money({ tab }: { tab?: string }) {
  const [view, setView] = useState<Tab>((['revenue', 'invoices', 'prices', 'ai', 'settings'].includes(tab ?? '') ? tab : 'revenue') as Tab);
  const pick = (v: Tab) => (history.replaceState(null, '', `/admin/v2/money/${v}`), setView(v));
  return (
    <Page title={t('Money')} sub={t('Revenue is the monthly amount booked from every company’s plan today.')}>
      <Tabs id="money-tabs" value={view} onChange={pick} items={[{ id: 'revenue', label: t('Revenue') }, { id: 'invoices', label: t('Invoices') }, { id: 'prices', label: t('Prices & coupons') }, { id: 'ai', label: t('AI margin') }, { id: 'settings', label: t('Invoice settings') }]} />
      {view === 'revenue' && <Revenue />}
      {view === 'invoices' && <Invoices />}
      {view === 'prices' && <Prices />}
      {view === 'ai' && <AIMargin />}
      {view === 'settings' && <InvoiceSettings />}
    </Page>
  );
}

interface RevenueData {
  mrr: number; paying: number; trials: { count: number; after: number }; comped: number; paused: number; unlimited?: number;
  movement: { month: string; mrr: number; new: number; expansion: number; contraction: number; churn: number }[];
  byTier: Record<string, { companies: number; mrr: number }>;
  invoiced: { month: string; total: number; paid: number; overdue: number };
  companies: CompanyRow[];
}
function Revenue() {
  const { data, error, reload } = useApi<RevenueData>('revenue');
  if (error) return <Failed error={error} retry={reload} />;
  const m = data?.movement ?? [];
  const before = m.length > 1 ? m[m.length - 2].mrr : 0;
  const tiers = Object.entries(data?.byTier ?? {}).filter(([, x]) => x.mrr > 0).sort((a, b) => b[1].mrr - a[1].mrr);
  return (
    <>
      <ak-stats>
        <ak-stat label={t('Monthly revenue')} value={String(data?.mrr ?? '')} format="currency:IDR" {...(before ? { delta: String(((data!.mrr - before) / before) * 100), hint: t('vs last month') } : { hint: t('{amount} a year', { amount: rpShort((data?.mrr ?? 0) * 12) }) })} count-in="off" />
        <ak-stat label={t('Paying companies')} value={String(data?.paying ?? '')} hint={data ? t('{n} on free months · {p} paused', { n: data.comped, p: data.paused }) : ''} href="/admin/v2/companies?view=paying" count-in="off" />
        <ak-stat label={t('On trial')} value={String(data?.trials.count ?? '')} hint={data ? t('{amount}/month if all of them pay', { amount: rpShort(data.trials.after) }) : ''} href="/admin/v2/companies?view=trial" count-in="off" />
        <ak-stat label={data ? t('Invoiced for {month}', { month: monthName(data.invoiced.month) }) : t('Invoiced')} value={String(data?.invoiced.total ?? '')} format="currency:IDR" hint={data ? t('with PPN 11% · {amount} paid', { amount: rpShort(data.invoiced.paid) }) : ''} tone={data?.invoiced.overdue ? 'warn' : undefined} href="/admin/v2/money/invoices" count-in="off" />
      </ak-stats>
      <div className="s2k-split">
        <Card title={t('Monthly revenue, last 6 months')} aside={<span className="ak-muted">{t('This month: booked today')}</span>}>
          <ak-chart type="area" format="currency:IDR" label={t('Monthly revenue')} values={m.map((x) => x.mrr).join(',')} labels={m.map((x) => monthName(x.month)).join(',')} partial="" />
        </Card>
        <Card title={t('By plan')} flush>
          {tiers.length === 0 ? <div className="ak-card__body ak-muted">{t('Nobody on a paid plan yet.')}</div> : <ul className="s2k-rows">{tiers.map(([name, x]) => <li key={name}><span className="s2k-rows__main"><b>{name}</b><small>{tn(x.companies, '{n} company', '{n} companies')}</small></span><span className="s2k-num">{rpShort(x.mrr)}</span></li>)}{data?.unlimited ? <li><span className="s2k-rows__main"><b>{t('Unlimited')}</b><small>{t('never billed')}</small></span><span className="s2k-num">Rp 0</span></li> : null}</ul>}
        </Card>
      </div>
      <Card title={t('Who pays what')} flush>
        <ul className="s2k-rows">{(data?.companies ?? []).filter((c) => c.mrr > 0).sort((a, b) => b.mrr - a.mrr).map((c) => <li key={c.id}><span className="s2k-rows__main"><a className="s2k-link" href={`/admin/v2/companies/${c.id}/billing`}>{c.name}</a><small>{planLabel(c.plan)} · {STATE_LABEL[c.state]}</small></span><span className="s2k-num">{rp(c.mrr)}</span></li>)}</ul>
      </Card>
    </>
  );
}

interface InvoiceRow { id: string; number: string; workspaceId: string; company?: string; period: string; total: number; status: 'draft' | 'sent' | 'paid' | 'void'; dueAt: string; paidAt: string | null; overdue?: boolean; billTo?: { company?: string; emails?: string[] } }
const INV_TONE: Record<InvoiceRow['status'], Tone> = { draft: 'neutral', sent: 'warn', paid: 'success', void: 'neutral' };
const invWord = (i: InvoiceRow) => (i.overdue ? t('Overdue') : i.status === 'draft' ? t('To send') : i.status === 'sent' ? t('Waiting for payment') : i.status === 'paid' ? t('Paid') : t('Void'));
const whoOf = (i: InvoiceRow) => i.company ?? i.billTo?.company ?? i.workspaceId;

function Invoices() {
  const { may } = useAdmin();
  const act = useAct();
  const { data, error, reload } = useApi<{ invoices: InvoiceRow[] }>('invoices');
  // Sending emails each invoice to the customer: always ask first, naming who gets what and the total (the why review).
  const send = async (rows: InvoiceRow[]) => {
    const todo = rows.filter((i) => i.status === 'draft' || i.status === 'sent');
    if (!todo.length) return window.AdminKit.toast(t('Nothing to send in what you ticked.'));
    const total = todo.reduce((s, i) => s + i.total, 0);
    const names = todo.slice(0, 6).map((i) => `${whoOf(i)} (${rp(i.total)})`).join(', ') + (todo.length > 6 ? t(' and {n} more', { n: todo.length - 6 }) : '');
    const ok = await window.AdminKit.confirm({ title: tn(todo.length, 'Email {n} invoice?', 'Email {n} invoices?'), body: t('{names} get an email with their invoice. {total} in total.', { names, total: rp(total) }), confirmLabel: tn(todo.length, 'Send {n} invoice', 'Send {n} invoices'), cancelLabel: t('Not yet') });
    if (ok) void act(() => Promise.all(todo.map((i) => post('invoice/status', { id: i.id, status: 'sent' }))), tn(todo.length, '{n} invoice sent', '{n} invoices sent')).then(reload);
  };
  const paid = async (rows: InvoiceRow[]) => {
    const todo = rows.filter((i) => i.status !== 'paid' && i.status !== 'void');
    if (todo.length && (await window.AdminKit.confirm({ title: tn(todo.length, 'Mark {n} invoice paid?', 'Mark {n} invoices paid?'), body: t('Paid by bank transfer, {total} in total.', { total: rp(todo.reduce((s, i) => s + i.total, 0)) }), confirmLabel: t('Mark paid') })))
      void act(() => Promise.all(todo.map((i) => post('invoice/status', { id: i.id, status: 'paid', method: 'bank transfer' }))), t('Marked paid')).then(reload);
  };
  const { el } = useKitList<InvoiceRow>(
    () => ({
      id: 'inv',
      rowId: (i) => i.id,
      searchLabel: t('Search number or company'),
      search: (i) => [i.number, whoOf(i)].join(' '),
      views: [
        { value: 'todo', label: t('To send'), test: (i) => i.status === 'draft', count: true },
        { value: 'overdue', label: t('Overdue'), test: (i) => !!i.overdue, count: true },
        { value: 'sent', label: t('Waiting for payment'), test: (i) => i.status === 'sent' && !i.overdue },
        { value: 'all', label: t('All') },
      ],
      sort: { key: 'due', dir: 1 },
      columns: [
        { key: 'number', label: t('Invoice'), primary: true, sort: 'text', value: (i) => i.number, cell: (i) => `<a class="s2k-link" href="/api/admin/invoice.html?id=${esc(i.id)}" target="_blank" rel="noreferrer">${esc(i.number)}</a><br><span class="ak-muted">${esc(whoOf(i))}</span>` },
        { key: 'status', label: t('State'), cell: (i) => `<ak-chip tone="${i.overdue ? 'danger' : INV_TONE[i.status]}">${esc(invWord(i))}</ak-chip>` },
        { key: 'due', label: t('Due'), hidePhone: true, sort: 'date', value: (i) => i.dueAt, cell: (i) => esc(day(i.dueAt)) },
        { key: 'total', label: t('Total'), align: 'end', sort: 'number', value: (i) => i.total, cell: (i) => esc(rp(i.total)) },
      ],
      bulk: may('billing') ? [{ key: 'send', label: t('Send…'), run: (rows) => void send(rows) }, { key: 'paid', label: t('Mark paid…'), run: (rows) => void paid(rows) }] : [],
      summary: (rows) => `${tn(rows.length, '{n} invoice', '{n} invoices')} · ${rp(rows.reduce((s, i) => s + i.total, 0))}`,
      empty: { views: { todo: `<b>${esc(t('Nothing to send.'))}</b><br>${esc(t('Make this month’s invoices to fill this list.'))}` } },
    }),
    data?.invoices ?? null,
  );
  return (
    <>
      {error && <Failed error={error} retry={reload} />}
      {may('billing') && (
        <div className="s2k-row">
          <button className="ak-btn ak-btn--primary" type="button" onClick={() => void act(() => post<{ made: number }>('invoice/generate'), t('Drafts made for every paying company without one this month')).then(reload)}>{t('Make this month’s invoices')}</button>
          <span className="ak-muted">{t('Drafts first: nothing is emailed until you send them.')}</span>
        </div>
      )}
      {el}
    </>
  );
}

type Prices = Record<'own' | 'ai', Record<'small' | 'studio' | 'agency' | 'business', { base: number; included: number; extra: number }>>;
interface Coupon { code: string; kind: 'percent' | 'amount' | 'months'; value: number; months: number | null; maxUses: number | null; used: number; expiresAt: string | null; note: string | null; active: boolean }
const TIERS = ['small', 'studio', 'agency', 'business'] as const;
const gives = (c: Coupon) => (c.kind === 'months' ? tn(c.value, '{n} free month', '{n} free months') : c.kind === 'percent' ? (c.months ? t('{pct}% off for {n} months', { pct: c.value, n: c.months }) : t('{pct}% off, for good', { pct: c.value })) : c.months ? t('{amount} off a month for {n} months', { amount: rp(c.value), n: c.months }) : t('{amount} off a month, for good', { amount: rp(c.value) }));

function Prices() {
  const { may } = useAdmin();
  const act = useAct();
  const pricing = useApi<{ prices: Prices; addons: Record<string, number>; topUp: number; overridden: boolean }>('pricing');
  const coupons = useApi<{ coupons: Coupon[] }>('coupons');
  const [draft, setDraft] = useState<{ prices: Prices; addons: Record<string, number>; topUp: number } | null>(null);
  const [making, setMaking] = useState(false);
  useEffect(() => {
    if (pricing.data) setDraft(JSON.parse(JSON.stringify({ prices: pricing.data.prices, addons: pricing.data.addons, topUp: pricing.data.topUp })));
  }, [pricing.data]);
  const can = may('billing');
  const changed = !!draft && !!pricing.data && JSON.stringify(draft) !== JSON.stringify({ prices: pricing.data.prices, addons: pricing.data.addons, topUp: pricing.data.topUp });
  const ADDON: Record<string, string> = { mailboxes: t('Hosted mailbox'), storage50: t('Extra 50 GB'), meetHours10: t('Bot hours ×10'), branding: t('Branding') };
  const num = (v: number, set: (n: number) => void, label: string, disabled = !can) => <input className="ak-input s2k-num" inputMode="numeric" aria-label={label} disabled={disabled} value={String(v)} onChange={(e) => set(Number(e.target.value.replace(/\D/g, '')) || 0)} />;
  const save = async () => {
    if (await window.AdminKit.confirm({ title: t('Change the live prices?'), body: t('The landing page and the app show the new prices at once, and every company, including those already paying, is billed the new price on its next invoice.'), confirmLabel: t('Save prices') })) void act(() => post('pricing', draft), t('Prices saved: the app and landing page use them now')).then(pricing.reload);
  };
  if (pricing.error) return <Failed error={pricing.error} retry={pricing.reload} />;
  return (
    <>
      <Card title={t('Prices per month')} aside={<span className="ak-muted">{pricing.data?.overridden ? t('Changed from the defaults') : t('The defaults')}</span>}>
        {!draft ? <ak-placeholder lines="6" /> : (
          <div className="ak-stack">
            <div className="ak-banner" data-tone="warn"><div><strong>{t('These are live')}</strong>{t('Saving changes the prices on the landing page and in the app at once.')}</div></div>
            <div className="ak-columns">
              {(['own', 'ai'] as const).map((track) => (
                <div key={track} className="ak-stack">
                  <h3>{track === 'ai' ? t('AI included') : t('Own AI keys')}</h3>
                  {TIERS.map((tier) => {
                    const v = draft.prices[track][tier];
                    const set = (k: 'base' | 'included' | 'extra') => (n: number) => setDraft((d) => (d ? { ...d, prices: { ...d.prices, [track]: { ...d.prices[track], [tier]: { ...d.prices[track][tier], [k]: n } } } } : d));
                    const plan = tier[0].toUpperCase() + tier.slice(1);
                    return (
                      <div key={tier} className="s2k-price">
                        <b>{plan}</b>
                        <div className="ak-field"><label>{t('Per month (Rp)')}</label>{num(v.base, set('base'), t('{plan} per month', { plan }))}</div>
                        <div className="ak-field"><label>{t('People in it')}</label>{num(v.included, set('included'), t('{plan} people included', { plan }), !can || tier === 'small')}</div>
                        <div className="ak-field"><label>{t('Each extra (Rp)')}</label>{num(v.extra, set('extra'), t('{plan} each extra person', { plan }))}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="s2k-price">
              {Object.entries(draft.addons).map(([k, v]) => <div key={k} className="ak-field"><label>{ADDON[k] ?? k} (Rp)</label>{num(v, (n) => setDraft((d) => (d ? { ...d, addons: { ...d.addons, [k]: n } } : d)), ADDON[k] ?? k)}</div>)}
              <div className="ak-field"><label>{t('AI top-up')} (Rp)</label>{num(draft.topUp, (n) => setDraft((d) => (d ? { ...d, topUp: n } : d)), t('AI top-up'))}</div>
            </div>
            {can && (
              <div className="s2k-row">
                <button className="ak-btn ak-btn--primary" type="button" disabled={!changed} onClick={() => void save()}>{t('Save prices')}</button>
                {changed && <button className="ak-btn ak-btn--ghost" type="button" onClick={() => setDraft(JSON.parse(JSON.stringify({ prices: pricing.data!.prices, addons: pricing.data!.addons, topUp: pricing.data!.topUp })))}>{t('Undo changes')}</button>}
                {pricing.data?.overridden && <button className="ak-btn ak-btn--ghost" type="button" onClick={() => void window.AdminKit.confirm({ title: t('Go back to the default prices?'), body: t('The landing page and the app change at once.'), confirmLabel: t('Use the defaults') }).then((ok) => ok && void act(() => post('pricing', { reset: true }), t('Back to the default prices')).then(pricing.reload))}>{t('Back to the defaults')}</button>}
              </div>
            )}
          </div>
        )}
      </Card>
      <Card title={t('Coupons')} aside={can && <button className="ak-btn" type="button" onClick={() => setMaking(true)}>{t('New coupon')}</button>} flush>
        {!coupons.data ? <ak-placeholder lines="3" /> : coupons.data.coupons.length === 0 ? <div className="ak-card__body ak-muted">{t('No coupons yet. Companies enter a code under Plan & billing.')}</div> : (
          <ul className="s2k-rows">
            {coupons.data.coupons.map((c) => (
              <li key={c.code}>
                <span className="s2k-rows__main"><b>{c.code}</b><small>{gives(c)} · {t('used {n} times', { n: c.used })}{c.maxUses ? ` / ${c.maxUses}` : ''}{c.expiresAt ? ` · ${t('until {day}', { day: day(c.expiresAt) })}` : ''}</small></span>
                <Chip tone={c.active ? 'success' : 'neutral'}>{c.active ? t('On') : t('Off')}</Chip>
                {can && <button className="ak-btn" type="button" onClick={() => void act(() => post('coupon', { ...c, active: !c.active }), c.active ? t('Coupon switched off') : t('Coupon on')).then(coupons.reload)}>{c.active ? t('Switch off') : t('Switch on')}</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <NewCoupon open={making} onClose={() => setMaking(false)} onDone={() => (setMaking(false), coupons.reload())} />
    </>
  );
}

function NewCoupon({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const act = useAct();
  const [c, setC] = useState({ code: '', kind: 'percent', value: '20', months: '3', maxUses: '', note: '' });
  const valid = c.code.trim().length >= 3 && Number(c.value) > 0 && (c.kind !== 'percent' || Number(c.value) <= 100);
  return (
    <Drawer open={open} onClose={onClose} heading={t('New coupon')}>
      <form className="s2k-form" onSubmit={(e) => (e.preventDefault(), void act(() => post('coupon', { code: c.code, kind: c.kind, value: Number(c.value), months: c.kind === 'months' ? null : Number(c.months) || null, maxUses: Number(c.maxUses) || null, note: c.note || null, active: true }), t('Coupon made')).then((ok) => ok && onDone()))}>
        <div className="ak-field"><label htmlFor="cp-code">{t('Code')}</label><input id="cp-code" className="ak-input" value={c.code} onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase().replace(/\s/g, '') })} /></div>
        <div className="ak-field"><label>{t('What it gives')}</label><Dropdown block label={t('What it gives')} value={c.kind} onChange={(v) => setC({ ...c, kind: v })} options={[{ value: 'percent', label: t('A percentage off') }, { value: 'amount', label: t('An amount off a month') }, { value: 'months', label: t('Free months') }]} /></div>
        <div className="ak-field"><label htmlFor="cp-value">{c.kind === 'percent' ? t('Percent off') : c.kind === 'amount' ? t('Rupiah off a month') : t('Free months')}</label><input id="cp-value" className="ak-input" inputMode="numeric" value={c.value} onChange={(e) => setC({ ...c, value: e.target.value.replace(/\D/g, '') })} /></div>
        {c.kind !== 'months' && <div className="ak-field"><label htmlFor="cp-months">{t('For how many months (empty: for good)')}</label><input id="cp-months" className="ak-input" inputMode="numeric" value={c.months} onChange={(e) => setC({ ...c, months: e.target.value.replace(/\D/g, '') })} /></div>}
        <div className="ak-field"><label htmlFor="cp-max">{t('Most uses (empty: no limit)')}</label><input id="cp-max" className="ak-input" inputMode="numeric" value={c.maxUses} onChange={(e) => setC({ ...c, maxUses: e.target.value.replace(/\D/g, '') })} /></div>
        <div className="ak-field"><label htmlFor="cp-note">{t('Note for the team')}</label><input id="cp-note" className="ak-input" value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} /></div>
        <div className="s2k-row"><button className="ak-btn ak-btn--primary" disabled={!valid}>{t('Make coupon')}</button><button className="ak-btn ak-btn--ghost" type="button" onClick={onClose}>{t('Cancel')}</button></div>
      </form>
    </Drawer>
  );
}

interface AIMoney { verdict: { tone: string; text: string }; money: { month: string; daysLeft: number; companies: number; earned: number; cost: number; forecast: number; margin: number; otherCost: number; unlimitedCost: number } }
function AIMargin() {
  const { data, error, reload } = useApi<AIMoney>('ai');
  if (error) return <Failed error={error} retry={reload} />;
  const m = data?.money;
  const tone = data?.verdict.tone === 'bad' ? 'danger' : data?.verdict.tone === 'good' ? 'success' : data?.verdict.tone === 'warn' ? 'warn' : 'info';
  return (
    <>
      {data && <div className="ak-banner" data-tone={tone}><div><strong>{t('Does the AI plan pay for itself?')}</strong>{data.verdict.text}</div></div>}
      <ak-stats>
        <ak-stat label={t('Earned from AI plans')} value={String(m?.earned ?? '')} format="currency:IDR" hint={m ? tn(m.companies, '{n} company on an AI plan', '{n} companies on an AI plan') : ''} count-in="off" />
        <ak-stat label={t('What their AI cost us')} value={String(m?.cost ?? '')} format="currency:IDR" hint={m ? t('{n} days left this month', { n: m.daysLeft }) : ''} count-in="off" />
        <ak-stat label={t('Margin so far')} value={String(m?.margin ?? '')} format="currency:IDR" tone={m && m.margin < 0 ? 'danger' : undefined} count-in="off" />
        <ak-stat label={t('Trials, free months and Unlimited')} value={String(m ? m.otherCost + m.unlimitedCost : '')} format="currency:IDR" hint={t('AI we pay for, not billed')} count-in="off" />
      </ak-stats>
      <p className="ak-muted">{t('Keys, the model for each job and model prices are under System › AI setup.')} <a className="s2k-link" href="/admin/v2/ai">{t('Open AI setup')}</a></p>
    </>
  );
}

interface SettingsData { settings: { homeWorkspace: string | null; internal: string[]; slaHours: { urgent: number; paid: number; other: number }; autoSuspendDays: number; supportName: string; billing: { name: string; address: string; npwp: string; bank: string; email: string } } }
export function useSettingsForm() {
  const { data, error, reload } = useApi<SettingsData>('settings');
  const act = useAct();
  const [s, setS] = useState<SettingsData['settings'] | null>(null);
  useEffect(() => {
    if (data) setS(JSON.parse(JSON.stringify(data.settings)));
  }, [data]);
  const changed = !!s && !!data && JSON.stringify(s) !== JSON.stringify(data.settings);
  const save = () => void act(() => post('settings', s), t('Settings saved')).then(reload);
  const undo = () => data && setS(JSON.parse(JSON.stringify(data.settings)));
  return { s, setS, changed, save, undo, error, reload };
}
function InvoiceSettings() {
  const { may } = useAdmin();
  const { s, setS, changed, save, undo, error, reload } = useSettingsForm();
  if (error) return <Failed error={error} retry={reload} />;
  if (!s) return <section className="ak-card"><ak-placeholder lines="6" /></section>;
  const can = may('billing');
  const b = (k: keyof typeof s.billing, label: string, area = false) => (
    <div className="ak-field"><label htmlFor={`bl-${k}`}>{label}</label>{area ? <textarea id={`bl-${k}`} className="ak-input" rows={3} disabled={!can} value={s.billing[k]} onChange={(e) => setS({ ...s, billing: { ...s.billing, [k]: e.target.value } })} /> : <input id={`bl-${k}`} className="ak-input" disabled={!can} value={s.billing[k]} onChange={(e) => setS({ ...s, billing: { ...s.billing, [k]: e.target.value } })} />}</div>
  );
  return (
    <div className="ak-columns">
      <Card title={t('Our details on every invoice')}>
        <div className="s2k-form">
          {b('name', t('Company name'))}
          {b('address', t('Address'), true)}
          {b('npwp', 'NPWP')}
          {b('bank', t('Bank account for transfers'))}
          {b('email', t('Billing email'))}
          {can && <div className="s2k-row"><button className="ak-btn ak-btn--primary" type="button" disabled={!changed} onClick={save}>{t('Save')}</button>{changed && <button className="ak-btn ak-btn--ghost" type="button" onClick={undo}>{t('Undo changes')}</button>}</div>}
        </div>
      </Card>
      <Card title={t('Unpaid invoices')}>
        <div className="s2k-form">
          <div className="ak-field"><label htmlFor="bl-susp">{t('Suspend a company this many days after an invoice is due (0: never)')}</label><input id="bl-susp" className="ak-input" inputMode="numeric" disabled={!can} value={String(s.autoSuspendDays)} onChange={(e) => setS({ ...s, autoSuspendDays: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></div>
          <p className="ak-muted">{t('A suspended company can still read everything, but not change anything, until it pays.')}</p>
          {can && <div className="s2k-row"><button className="ak-btn ak-btn--primary" type="button" disabled={!changed} onClick={save}>{t('Save')}</button></div>}
        </div>
      </Card>
    </div>
  );
}
