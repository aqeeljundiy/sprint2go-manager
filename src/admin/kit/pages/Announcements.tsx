// Business › Announcements: talking to customers. A notice in the app, or an email to company owners.
// (Was "Product"; feature switches and maintenance moved to System › Server.)
import { useEffect, useRef, useState } from 'react';
import { day, post, rel } from '../../api';
import { useAct, useAdmin, useApi } from '../../ui';
import { Card, Chip, Drawer, Dropdown, Failed, Page } from '../parts';
import { t, tn } from '../../../i18n';

interface Announcement { id: string; text: string; link?: string; kind: 'news' | 'warning'; audience: 'all' | 'owners' | 'paying' | 'trial' | 'list'; companies: string[]; from: string; until?: string; createdBy: string }
interface Data { announcements: Announcement[]; broadcasts: { id: string; subject: string; audience: string; sent: number; at: string; by: string }[] }
const AUDIENCE = (): Record<string, string> => ({ all: t('Everyone'), owners: t('Company owners'), paying: t('Paying companies'), trial: t('Companies on trial'), list: t('Chosen companies') });
const OWNERS = (): Record<string, string> => ({ all: t('All company owners'), paying: t('Owners of paying companies'), trial: t('Owners of companies on trial'), risk: t('Owners of companies at risk') });

export function Announcements() {
  const { may } = useAdmin();
  const act = useAct();
  const { data, error, reload } = useApi<Data>('product');
  const [edit, setEdit] = useState<{ id?: string; text: string; link: string; kind: string; audience: string; from: string; until: string } | null>(null);
  const [mail, setMail] = useState({ audience: 'all', subject: '', body: '' });
  const can = may('product');
  const sendMail = async () => {
    const pre = await post<{ count: number; sample: string[] }>('broadcast/preview', { audience: mail.audience }).catch((e: Error) => (window.AdminKit.toast.error(e.message), null));
    if (!pre) return;
    if (!pre.count) return window.AdminKit.toast(t('Nobody matches this audience.'));
    const ok = await window.AdminKit.confirm({ title: tn(pre.count, 'Email {n} owner?', 'Email {n} owners?'), body: t('“{subject}” goes to {who}, for example {sample}. It cannot be taken back.', { subject: mail.subject, who: OWNERS()[mail.audience].toLowerCase(), sample: pre.sample.slice(0, 3).join(', ') }), confirmLabel: tn(pre.count, 'Send to {n} owner', 'Send to {n} owners') });
    if (ok) void act(() => post('broadcast/send', mail), tn(pre.count, 'Sent to {n} owner', 'Sent to {n} owners')).then((done) => done && (setMail({ ...mail, subject: '', body: '' }), reload()));
  };
  if (error) return <Page title={t('Announcements')}><Failed error={error} retry={reload} /></Page>;
  return (
    <Page title={t('Announcements')} sub={t('Tell customers something: a notice in the app, or an email to company owners.')} actions={can && <button className="ak-btn ak-btn--primary" type="button" onClick={() => setEdit({ text: '', link: '', kind: 'news', audience: 'all', from: '', until: '' })}>{t('New notice')}</button>}>
      <div className="ak-columns">
        <Card title={t('Notices in the app')} flush>
          {!data ? <ak-placeholder lines="3" /> : data.announcements.length === 0 ? <div className="ak-card__body ak-muted">{t('No notices. A notice shows at the top of the app for the people you choose.')}</div> : (
            <ul className="s2k-rows">
              {data.announcements.map((a) => (
                <li key={a.id}>
                  <span className="s2k-rows__main"><b>{a.text}</b><small>{AUDIENCE()[a.audience]} · {t('from {day}', { day: day(a.from) })}{a.until ? ` ${t('until {day}', { day: day(a.until) })}` : ''}</small></span>
                  <Chip tone={a.kind === 'warning' ? 'warn' : 'info'}>{a.kind === 'warning' ? t('Warning') : t('News')}</Chip>
                  {can && <button className="ak-btn" type="button" onClick={() => setEdit({ id: a.id, text: a.text, link: a.link ?? '', kind: a.kind, audience: a.audience, from: a.from.slice(0, 10), until: a.until?.slice(0, 10) ?? '' })}>{t('Edit')}</button>}
                  {can && <button className="ak-btn ak-btn--ghost" type="button" onClick={() => void act(() => post('announcement', { delete: a.id }), t('Notice removed')).then(reload)}>{t('Remove')}</button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t('Email to company owners')}>
          <div className="s2k-form">
            <div className="ak-field"><label>{t('Who gets it')}</label><Dropdown block label={t('Who gets it')} value={mail.audience} onChange={(v) => setMail({ ...mail, audience: v })} options={Object.entries(OWNERS()).map(([value, label]) => ({ value, label }))} /></div>
            <div className="ak-field"><label htmlFor="bc-subject">{t('Subject')}</label><input id="bc-subject" className="ak-input" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} /></div>
            <div className="ak-field"><label htmlFor="bc-body">{t('Message')}</label><textarea id="bc-body" className="ak-input" rows={6} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} /></div>
            {can && <div className="s2k-row"><button className="ak-btn" type="button" disabled={!mail.subject.trim() || !mail.body.trim()} onClick={() => void sendMail()}>{t('Send…')}</button><span className="ak-muted">{t('You see who gets it before it goes.')}</span></div>}
          </div>
        </Card>
        {data && data.broadcasts.length > 0 && (
          <Card title={t('Emails sent')} flush>
            <ul className="s2k-rows">{data.broadcasts.map((b) => <li key={b.id}><span className="s2k-rows__main"><b>{b.subject}</b><small>{tn(b.sent, '{n} owner', '{n} owners')} · {b.by} · {rel(b.at)}</small></span></li>)}</ul>
          </Card>
        )}
      </div>
      <Drawer open={!!edit} onClose={() => setEdit(null)} heading={edit?.id ? t('Edit notice') : t('New notice')}>
        {edit && (
          <form className="s2k-form" onSubmit={(e) => (e.preventDefault(), void act(() => post('announcement', { id: edit.id, text: edit.text, link: edit.link, kind: edit.kind, audience: edit.audience, companies: [], from: edit.from ? new Date(edit.from + 'T00:00:00').toISOString() : undefined, until: edit.until ? new Date(edit.until + 'T23:59:59').toISOString() : undefined }), t('Notice saved')).then((ok) => ok && (setEdit(null), reload())))}>
            <div className="ak-field"><label htmlFor="an-text">{t('What it says')}</label><textarea id="an-text" className="ak-input" rows={3} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} /></div>
            <div className="ak-field"><label htmlFor="an-link">{t('Link (optional)')}</label><input id="an-link" className="ak-input" value={edit.link} onChange={(e) => setEdit({ ...edit, link: e.target.value })} /></div>
            <div className="ak-field"><label>{t('Kind')}</label><Dropdown block label={t('Kind')} value={edit.kind} onChange={(v) => setEdit({ ...edit, kind: v })} options={[{ value: 'news', label: t('News') }, { value: 'warning', label: t('Warning (maintenance, a problem)') }]} /></div>
            <div className="ak-field"><label>{t('Who sees it')}</label><Dropdown block label={t('Who sees it')} value={edit.audience} onChange={(v) => setEdit({ ...edit, audience: v })} options={Object.entries(AUDIENCE()).filter(([k]) => k !== 'list').map(([value, label]) => ({ value, label }))} /></div>
            <DateField label={t('Show from')} value={edit.from} onChange={(v) => setEdit({ ...edit, from: v })} />
            <DateField label={t('Show until (optional)')} value={edit.until} onChange={(v) => setEdit({ ...edit, until: v })} />
            <div className="s2k-row"><button className="ak-btn ak-btn--primary" disabled={!edit.text.trim()}>{t('Save notice')}</button><button className="ak-btn ak-btn--ghost" type="button" onClick={() => setEdit(null)}>{t('Cancel')}</button></div>
          </form>
        )}
      </Drawer>
    </Page>
  );
}

/** The kit's date picker, with its change sent back to React. */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    const el = ref.current;
    const on = (e: Event) => latest.current((e as CustomEvent).detail.value ?? '');
    el?.addEventListener('change', on);
    return () => el?.removeEventListener('change', on);
  }, []);
  return (
    <div className="ak-field">
      <label>{label}</label>
      <ak-date ref={ref} block clearable label={label} value={value} />
    </div>
  );
}
