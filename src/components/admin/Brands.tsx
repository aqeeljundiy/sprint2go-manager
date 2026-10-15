// Settings, General & email, Brands: a group's brands, each with its own name, colour, logo and domains.
// Mailboxes on a brand's domains are that brand's (src/brands.ts): the inbox list marks them, compose names the brand.
import { useState } from 'react';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import type { Brand, Workspace } from '../../types';
import { ACCENTS } from '../../settings';
import { freeDomains } from '../../brands';
import { orderedDomains } from '../../domains';
import { MultiSelect } from '../ui/MultiSelect';
import { SmoothHeight, useLeaving } from '../ui/Smooth';
import { toast } from '../../toast';
import { t } from '../../i18n';

const newId = () => 'br-' + Math.random().toString(36).slice(2, 9);

function readLogo(file: File): Promise<string | null> {
  if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) return Promise.resolve((toast({ text: t('Use a PNG, JPG, WebP or SVG image.') }), null));
  if (file.size > 300_000) return Promise.resolve((toast({ text: t('Use a logo under 300 KB.') }), null));
  return new Promise((ok) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => ok(null);
    r.readAsDataURL(file);
  });
}

export function BrandsSettings({ ws, canManage, onWorkspace, onDomains }: { ws: Workspace; canManage: boolean; onWorkspace: (p: Partial<Workspace>) => void; onDomains?: () => void }) {
  const brands = ws.brands ?? [];
  const rows = useLeaving(brands, (b) => b.id);
  const [open, setOpen] = useState<string | null>(null);
  const save = (next: Brand[]) => onWorkspace({ brands: next.length ? next : undefined });
  const patch = (id: string, p: Partial<Brand>) => save(brands.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const add = () => {
    const b: Brand = { id: newId(), name: t('New brand'), color: ACCENTS[brands.length % ACCENTS.length], domains: freeDomains(ws).slice(0, brands.length ? 0 : 1) };
    save([...brands, b]);
    setOpen(b.id);
  };
  return (
    <>
      <h3>{t('Brands')}</h3>
      <small className="set-hint">{t('Optional, for a group with several brands under one company. Each brand sends from some of the company’s domains with its own name and logo; mailboxes on those domains are marked with its colour. One team, one bill.')}</small>
      {brands.length > 0 && (
        <div className="acct-list brand-list">
          {rows.map(({ item: b, leaving }) => (
            <div key={b.id} className={`acct-block${leaving ? ' row-leaving' : ''}`}>
              <button type="button" className="acct-row brand-row" onClick={() => setOpen((x) => (x === b.id ? null : b.id))} aria-expanded={open === b.id}>
                <span className="brand-swatch" style={{ background: b.logo ? `center / cover no-repeat url("${b.logo}")` : b.color }} aria-hidden />
                <span className="acct-info">
                  <strong>{b.name}</strong>
                  <small>{b.domains.length ? b.domains.join(', ') : t('No domain yet')}</small>
                </span>
              </button>
              <SmoothHeight>
                {open === b.id && canManage && (
                  <div className="brand-edit">
                    <label className="field">
                      <span>{t('Name')}</span>
                      <input value={b.name} onChange={(e) => patch(b.id, { name: e.target.value.slice(0, 60) })} />
                    </label>
                    <div className="field">
                      <span>{t('Colour')}</span>
                      <div className="brand-colors">
                        {ACCENTS.map((c) => (
                          <button key={c} type="button" className={`swatch ${b.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => patch(b.id, { color: c })} aria-label={t('Colour {color}', { color: c })} />
                        ))}
                      </div>
                    </div>
                    <div className="field">
                      <span>{t('Logo')}</span>
                      <div className="brand-logo-row">
                        <label className="ghost-btn outline sm">
                          <ImagePlus size={14} /> {b.logo ? t('Change logo') : t('Add logo')}
                          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { const url = await readLogo(f); if (url) patch(b.id, { logo: url }); } }} />
                        </label>
                        {b.logo && (
                          <button type="button" className="link-btn" onClick={() => patch(b.id, { logo: undefined })}>
                            {t('Remove logo')}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="field">
                      <span>{t('Domains')}</span>
                      {/* A pick-list of the company's own domains: domains are added in Settings, Domains, never here. */}
                      <MultiSelect<string>
                        values={b.domains}
                        onChange={(next) => patch(b.id, { domains: next })}
                        label={t('Domains')}
                        title={t('Domains')}
                        none={t('No domain yet')}
                        options={orderedDomains(ws)
                          .filter((d) => b.domains.includes(d) || freeDomains(ws, b.id).includes(d))
                          .map((d) => ({ value: d, label: d }))}
                      />
                      <small className="set-hint">
                        {ws.domains.length ? t('A domain belongs to one brand at most.') : t('Add the company’s domains first.')}{' '}
                        {onDomains && (
                          <button type="button" className="link-btn" onClick={onDomains}>
                            {t('Settings, Domains')}
                          </button>
                        )}
                      </small>
                    </div>
                    <div className="brand-actions">
                      <button type="button" className="ghost-btn sm danger" onClick={() => (setOpen(null), save(brands.filter((x) => x.id !== b.id)), toast({ text: t('Brand removed') }))}>
                        <Trash2 size={14} /> {t('Remove brand')}
                      </button>
                    </div>
                  </div>
                )}
              </SmoothHeight>
            </div>
          ))}
        </div>
      )}
      {canManage && (
        <button className="acct-add" onClick={add}>
          <Plus size={16} /> <span>{brands.length ? t('Add a brand') : t('Add your first brand')}</span>
        </button>
      )}
    </>
  );
}
