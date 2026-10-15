// Settings, Mail & signature, "Design a signature": five ready-made layouts filled from your details and the brand
// (name, title, phone, website, logo, colour), previewed live, then put into the signature editor to adjust.
// Email-safe HTML only: tables and inline styles, so Gmail and Outlook show it as designed.
// On the free plan the signature ends with a small "Sent with sprint2go" line; paid plans don't have it.
import { useMemo, useState } from 'react';
import { PenLine, X } from 'lucide-react';
import type { Workspace } from '../../types';
import { primaryDomain } from '../../domains';
import { brandOf } from '../../brands';
import { Layer } from '../ui/Layer';
import { uploadFile } from '../../sync';
import { t } from '../../i18n';

type Fields = { name: string; title: string; company: string; phone: string; website: string };
type Tpl = { id: string; name: string; render: (f: Fields, look: { color: string; logo?: string }) => string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const href = (site: string) => (/^https?:\/\//i.test(site) ? site : `https://${site}`);
const FONT = "font-family:Arial,Helvetica,sans-serif";
const line = (parts: (string | false | undefined)[], sep = ' · ') => parts.filter(Boolean).join(sep);
const contact = (f: Fields, color: string) =>
  line([f.phone && esc(f.phone), f.website && `<a href="${esc(href(f.website))}" style="color:${color};text-decoration:none">${esc(f.website.replace(/^https?:\/\//i, ''))}</a>`]);
const logoImg = (logo: string | undefined, size: number) => (logo ? `<img src="${esc(logo)}" alt="" width="${size}" height="${size}" style="display:block;border-radius:8px;width:${size}px;height:${size}px">` : '');

const TEMPLATES: Tpl[] = [
  {
    id: 'classic',
    name: 'Classic',
    render: (f, l) =>
      `<table cellpadding="0" cellspacing="0" style="${FONT};font-size:13px;color:#3d404a;line-height:1.5"><tr><td>` +
      `<div style="font-size:14px;font-weight:bold;color:#0b0c10">${esc(f.name)}</div>` +
      `<div>${line([f.title && esc(f.title), f.company && esc(f.company)])}</div>` +
      `<div>${contact(f, l.color)}</div>` +
      (l.logo ? `<div style="padding-top:8px">${logoImg(l.logo, 40)}</div>` : '') +
      `</td></tr></table>`,
  },
  {
    id: 'side',
    name: 'Logo on the side',
    render: (f, l) =>
      `<table cellpadding="0" cellspacing="0" style="${FONT};font-size:13px;color:#3d404a;line-height:1.5"><tr>` +
      (l.logo ? `<td style="padding-right:12px;vertical-align:top">${logoImg(l.logo, 56)}</td>` : '') +
      `<td style="border-left:3px solid ${l.color};padding-left:12px;vertical-align:top">` +
      `<div style="font-size:15px;font-weight:bold;color:#0b0c10">${esc(f.name)}</div>` +
      `<div style="color:${l.color};font-weight:bold">${line([f.title && esc(f.title), f.company && esc(f.company)])}</div>` +
      `<div>${contact(f, l.color)}</div></td></tr></table>`,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    render: (f, l) =>
      `<div style="${FONT};font-size:13px;color:#6b6f7c;line-height:1.5"><span style="color:#0b0c10;font-weight:bold">${esc(f.name)}</span>` +
      `${f.title ? ` · ${esc(f.title)}` : ''}${f.company ? `, ${esc(f.company)}` : ''}<br>${contact(f, l.color)}</div>`,
  },
  {
    id: 'banner',
    name: 'Strong',
    render: (f, l) =>
      `<table cellpadding="0" cellspacing="0" style="${FONT};line-height:1.4"><tr><td style="border-top:4px solid ${l.color};padding-top:10px">` +
      `<div style="font-size:18px;font-weight:bold;color:#0b0c10">${esc(f.name)}</div>` +
      `<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${l.color};font-weight:bold;padding:2px 0 6px">${line([f.title && esc(f.title), f.company && esc(f.company)])}</div>` +
      `<div style="font-size:13px;color:#3d404a">${contact(f, l.color)}</div></td>` +
      (l.logo ? `<td style="padding-left:16px;vertical-align:bottom">${logoImg(l.logo, 48)}</td>` : '') +
      `</tr></table>`,
  },
  {
    id: 'compact',
    name: 'One line',
    render: (f, l) => `<div style="${FONT};font-size:12px;color:#6b6f7c">${line([`<b style="color:#0b0c10">${esc(f.name)}</b>`, f.title && esc(f.title), f.company && esc(f.company), contact(f, l.color)].filter((x) => x !== ''))}</div>`,
  },
];

/** The small line free plans carry under a designed signature. */
const WATERMARK = `<div style="${FONT};font-size:11px;color:#9aa0ab;padding-top:10px">Sent with <a href="https://sprint2go.com" style="color:#9aa0ab">sprint2go</a></div>`;

export function SignatureDesigner({ ws, address, me, onUse, onClose }: { ws: Workspace; address: string; me: { name: string; title?: string }; onUse: (html: string) => void; onClose: () => void }) {
  const brand = brandOf(ws, address);
  const [tpl, setTpl] = useState('side');
  const [f, setF] = useState<Fields>({ name: me.name, title: me.title ?? '', company: brand?.name ?? ws.name, phone: '', website: brand?.domains[0] ?? (primaryDomain(ws) || '') });
  // The brand's (or company's) logo as the picture itself: the mail engine sends pictures inside an email as attached
  // images, which Gmail and Outlook show (a link to another site would be stripped, sanitize.ts).
  // Only PNG, JPG, GIF or WebP: mail apps don't show SVG pictures, so an SVG logo would preview here and vanish there.
  const anyLogo = brand?.logo ?? ws.logo;
  const raster = !!anyLogo && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(anyLogo);
  const logo = raster ? anyLogo : undefined;
  const look = { color: brand?.color ?? ws.color ?? '#2448ff', logo };
  const free = !ws.plan || ws.plan.tier === 'free';
  const html = useMemo(() => (TEMPLATES.find((x) => x.id === tpl) ?? TEMPLATES[0]).render(f, look) + (free ? WATERMARK : ''), [tpl, f, look.color, look.logo, free]); // eslint-disable-line react-hooks/exhaustive-deps
  // The logo goes in as a company file (/api/files/…): the mail engine turns those into pictures attached to each email,
  // so they show in Gmail and Outlook (a picture written inside the HTML itself doesn't).
  const [busy, setBusy] = useState(false);
  const use = async () => {
    setBusy(true);
    let out = html;
    try {
      if (logo?.startsWith('data:')) {
        const blob = await (await fetch(logo)).blob();
        const up = await uploadFile(blob, ws.id, 'signature-logo.' + (blob.type.split('/')[1] ?? 'png'));
        if (!up.url.startsWith('data:')) out = out.split(logo).join(up.url);
      }
    } catch {
      /* the signature still works; the logo may not show in some mail apps */
    }
    setBusy(false);
    onUse(out);
    onClose();
  };
  const field = (k: keyof Fields, label: string, placeholder = '') => (
    <label className="field">
      <span>{label}</span>
      <input value={f[k]} placeholder={placeholder} onChange={(e) => setF({ ...f, [k]: e.target.value.slice(0, 80) })} />
    </label>
  );
  return (
    <Layer>
      <div className="modal-scrim" onMouseDown={onClose}>
        <div className="modal sigd-modal" role="dialog" aria-label={t('Design a signature')} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
          <header className="modal-head">
            <span className="dump-title">
              <PenLine size={15} /> {t('Design a signature')}
            </span>
            <button className="icon-btn sm" onClick={onClose} aria-label={t('Close')}>
              <X size={15} />
            </button>
          </header>
          <div className="modal-body sigd-body">
            <div className="sigd-tpls" role="radiogroup" aria-label={t('Layout')}>
              {TEMPLATES.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={tpl === x.id} className={`sigd-tpl${tpl === x.id ? ' on' : ''}`} onClick={() => setTpl(x.id)}>
                  {t(x.name)}
                </button>
              ))}
            </div>
            <div className="sigd-grid">
              <div className="sigd-fields">
                {field('name', t('Name'))}
                {field('title', t('Title'), t('Account manager'))}
                {field('company', t('Company'))}
                {field('phone', t('Phone'), '+62 812 3456 7890')}
                {field('website', t('Website'), 'yourcompany.com')}
              </div>
              <div className="sigd-preview">
                <small>{t('Preview')}</small>
                {/* The generated HTML is ours (escaped fields, fixed layouts), shown as it will be sent. */}
                <div className="sigd-paper" dangerouslySetInnerHTML={{ __html: html }} />
                {anyLogo && !raster && <small className="muted">{t('Your logo is an SVG, which mail apps don’t show. Add a PNG logo in Settings, General & email, Brands, to put it in your signature.')}</small>}
                {free && <small className="muted">{t('On the free plan the signature ends with “Sent with sprint2go”. Paid plans don’t have it.')}</small>}
              </div>
            </div>
          </div>
          <footer className="modal-foot">
            <button type="button" className="ghost-btn" onClick={onClose}>
              {t('Cancel')}
            </button>
            <button type="button" className="primary-btn" disabled={!f.name.trim() || busy} onClick={() => void use()}>
              {busy ? t('Saving…') : t('Use this signature')}
            </button>
          </footer>
        </div>
      </div>
    </Layer>
  );
}
