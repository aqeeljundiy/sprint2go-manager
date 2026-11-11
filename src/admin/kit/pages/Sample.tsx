// /admin/v2/_kit: every kit part in sprint2go's theme, with made-up data (theme step 5). Not in the sidebar.
import { useState } from 'react';
import { Card, Chip, Drawer, Dropdown, Menu, Page, Tabs } from '../parts';
import { ICON } from '../nav';

const COMPANIES = [
  { id: 'c1', name: 'Kopinara Studio', owner: 'laura@kopinara.test', plan: 'Team · yearly', mrr: 899000, state: 'Paying', tone: 'success' as const, seen: '12 Nov' },
  { id: 'c2', name: 'Tropis Digital', owner: 'andi@tropis.test', plan: 'Trial, ends 15 Nov', mrr: 0, state: 'Trial ending', tone: 'warn' as const, seen: '11 Nov' },
  { id: 'c3', name: 'Rimba Group', owner: 'ethan@rimba.test', plan: 'Business · monthly', mrr: 2450000, state: 'Paying', tone: 'success' as const, seen: '12 Nov' },
  { id: 'c4', name: 'Lumbung Kreatif', owner: 'sari@lumbung.test', plan: 'Team · monthly', mrr: 540000, state: 'Invoice late', tone: 'danger' as const, seen: '2 Nov' },
  { id: 'c5', name: 'Awan Partners', owner: 'budi@awan.test', plan: 'Unlimited', mrr: 0, state: 'Unlimited', tone: 'info' as const, seen: '9 Nov' },
];
const rp = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

export function Sample() {
  const [view, setView] = useState('open');
  const [who, setWho] = useState('');
  const [open, setOpen] = useState(false);
  const AK = () => window.AdminKit;
  return (
    <Page
      title="Kit sample"
      sub="Every part of the console in sprint2go's theme, with made-up companies"
      actions={
        <>
          <button className="ak-btn" type="button" onClick={() => AK().toast.success('Saved', { description: 'Reply target is now 4 hours.' })}>Show a toast</button>
          <button className="ak-btn ak-btn--danger" type="button" onClick={() => void AK().confirm({ title: 'Send 4 invoices?', body: 'Kopinara Studio, Rimba Group, Lumbung Kreatif and Tropis Digital get an email with their invoice, Rp 4.788.000 in total.', confirmLabel: 'Send 4 invoices', cancelLabel: 'Not yet' }).then((ok) => ok && AK().toast('Sent'))}>Ask first</button>
          <button className="ak-btn ak-btn--primary" type="button" onClick={() => setOpen(true)}>Reply to ticket</button>
        </>
      }
    >
      <ak-stats>
        <ak-stat label="Tickets waiting" value="5" hint="2 past the 4 h target" tone="warn" href="/admin/v2/tickets" spark="2,3,3,4,6,5,5" />
        <ak-stat label="Trials ending this week" value="3" href="/admin/v2/companies" spark="1,1,2,2,3,3,3" />
        <ak-stat label="Paying companies" value="42" delta="7.7" hint="vs October" spark="31,33,35,36,38,39,42" />
        <ak-stat label="Revenue this month" value="31400000" format="currency:IDR" delta="4.2" hint="vs October" spark="24,26,27,28,29,30,31" />
      </ak-stats>

      <div className="s2k-split">
        <Card title="Revenue per month" aside={<span className="ak-muted">Dashed: last year</span>}>
          <ak-chart type="area" format="currency:IDR" label="Revenue per month" values="18200000,21400000,22900000,25100000,27800000,30100000,31400000" compare="9100000,10400000,11900000,13600000,15000000,16200000,17900000" labels="May,Jun,Jul,Aug,Sep,Oct,Nov" partial="" />
        </Card>
        <Card title="Where sign-ups came from">
          <ak-chart type="bar" label="Sign-ups by source" values="64,41,23,12" labels="Google,Instagram,Referral,Direct" />
        </Card>
      </div>

      <Card title="Companies" aside={<Tabs id="sample-views" value={view} onChange={setView} items={[{ id: 'open', label: 'Customers', count: 5 }, { id: 'pay', label: 'Paying' }, { id: 'trial', label: 'Trial ending', count: 1 }]} />} flush>
        <div className="ak-card__body">
          <div className="ak-toolbar">
            <input className="ak-input" type="search" placeholder="Search company or owner" aria-label="Search company or owner" />
            <Dropdown label="Plan" value={who} onChange={setWho} options={[{ value: '', label: 'Any plan' }, { value: 'team', label: 'Team' }, { value: 'business', label: 'Business' }, { value: 'unlimited', label: 'Unlimited' }]} />
            <ak-date range presets clearable label="Signed up" />
          </div>
        </div>
        <ak-table selectable stack>
          <div slot="bulk">
            <div>
              <b><span data-count>0</span> selected</b>
              <button className="ak-btn" type="button">Make invoices</button>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th data-sort="text" data-primary>Company</th>
                <th data-hide-phone>Plan</th>
                <th data-sort="text">State</th>
                <th data-sort="number" data-align="end">Per month</th>
                <th data-hide-phone data-sort="text">Last here</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {COMPANIES.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.name}</b>
                    <br />
                    <span className="ak-muted">{c.owner}</span>
                  </td>
                  <td>{c.plan}</td>
                  <td><Chip tone={c.tone}>{c.state}</Chip></td>
                  <td data-value={c.mrr} className="s2k-num">{c.mrr ? rp(c.mrr) : <span className="ak-muted">none</span>}</td>
                  <td>{c.seen}</td>
                  <td>
                    <Menu label={`Actions for ${c.name}`} trigger={<span dangerouslySetInnerHTML={{ __html: ICON.more }} />} items={[{ label: 'Change plan', run: () => AK().toast('Change plan') }, { label: 'Give 14 more days', run: () => AK().toast('14 more days given') }, 'divider', { label: 'Sign in as owner…', danger: true, run: () => void AK().confirm({ title: 'Sign in as the owner?', body: 'Logged with your name and a ticket number.', confirmLabel: 'Sign in as them', tone: 'danger' }) }]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div slot="empty"><b>No company matches.</b><br />Clear a filter.</div>
        </ak-table>
      </Card>

      <div className="ak-columns">
        <Card title="Support settings">
          <div className="s2k-form">
            <div className="ak-field"><label htmlFor="k-first">First reply within</label><input id="k-first" className="ak-input" defaultValue="4 hours" /></div>
            <div className="ak-field"><label htmlFor="k-sign">Reply signature</label><textarea id="k-sign" className="ak-input" rows={3} defaultValue={'The sprint2go team'} /></div>
            <label className="s2k-row"><span>Email me when a ticket passes its target</span><input type="checkbox" className="ak-switch" role="switch" defaultChecked /></label>
            <div className="s2k-row"><button className="ak-btn ak-btn--primary" type="button" onClick={() => AK().toast.success('Saved')}>Save</button><button className="ak-btn ak-btn--ghost" type="button">Cancel</button></div>
          </div>
        </Card>
        <Card title="Notices">
          <div className="ak-stack">
            <div className="ak-banner" data-tone="warn"><div><strong>2 tickets past the 4 h target</strong>The oldest has waited 9 hours.</div><a className="ak-btn" href="/admin/v2/tickets">Open tickets</a></div>
            <div className="ak-banner" data-tone="info"><div><strong>Prices are live on the landing page</strong>Changing them here changes sprint2go.com at once.</div></div>
            <div className="s2k-row"><Chip tone="success">Paid</Chip><Chip tone="warn">Waiting on them</Chip><Chip tone="danger">Past target</Chip><Chip tone="info">Unlimited</Chip><Chip>Draft</Chip><ak-loader size="sm" label="Loading" /></div>
          </div>
        </Card>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)} heading="Ticket 1001: cannot share a drive folder">
        <div className="ak-stack">
          <dl className="s2k-kv"><dt>From</dt><dd>Laura, Kopinara Studio</dd><dt>Waiting</dt><dd>9 hours</dd></dl>
          <div className="ak-field"><label htmlFor="k-reply">Reply</label><textarea id="k-reply" className="ak-input" rows={6} /></div>
          <div className="s2k-row"><button className="ak-btn ak-btn--primary" type="button" onClick={() => (setOpen(false), AK().toast.success('Sent'))}>Send</button><button className="ak-btn" type="button">Send and resolve</button></div>
        </div>
      </Drawer>
    </Page>
  );
}
