import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import '../settingsSearch.css';
import { Search, X, type LucideIcon } from 'lucide-react';
import { t } from '../i18n';
import { flashOption, searchSettings } from '../settingsIndex';
import { Group, GRow } from './ui/Grouped';
import { EmptyState } from './ui/EmptyState';

type Page = { id: string; name: string; icon: LucideIcon };

/** A search field over Settings: page names and the options inside them. Empty, it shows the normal list. */
export function SettingsSearch({ pages, phone, onOpen, children }: { pages: Page[]; phone: boolean; onOpen: (id: string) => void; children: ReactNode }) {
  const [q, setQ] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchSettings(q, pages), [q, pages]);
  const iconOf = (id: string) => pages.find((p) => p.id === id)?.icon ?? Search;

  // "/" focuses the field on desktop, unless you're already typing somewhere.
  useEffect(() => {
    if (phone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (!field.current || !field.current.offsetParent) return;
      e.preventDefault();
      field.current.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phone]);

  const open = (id: string, option?: string) => {
    onOpen(id);
    setQ('');
    if (option) flashOption(option);
  };

  return (
    <div className={`set-search${q ? ' searching' : ''}`}>
      <label className="set-search-field">
        <Search size={16} aria-hidden />
        <input
          ref={field}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') return void (q ? setQ('') : field.current?.blur());
            if (e.key === 'Enter' && hits[0]) open(hits[0].id, hits[0].option);
          }}
          placeholder={t('Search settings')}
          aria-label={t('Search settings')}
          enterKeyHint="search"
        />
        {!phone && !q && <kbd aria-hidden>/</kbd>}
        {q && (
          <button type="button" className="set-search-clear" onClick={() => (setQ(''), field.current?.focus())} aria-label={t('Clear search')}>
            <X size={14} />
          </button>
        )}
      </label>
      {!q ? (
        <div className="set-search-list" key="list">{children}</div>
      ) : (
        <div className="set-search-results" key="results" role="list">
          {!hits.length ? (
            <EmptyState compact text={t('Nothing in Settings matches “{q}”', { q: q.trim() })} />
          ) : phone ? (
            <Group>
              {hits.map((h) => (
                <GRow key={h.id + (h.option ?? '')} icon={iconOf(h.id)} plainIcon label={h.option ?? h.page} sub={h.option ? h.page : undefined} onClick={() => open(h.id, h.option)} />
              ))}
            </Group>
          ) : (
            hits.map((h) => {
              const Icon = iconOf(h.id);
              return (
                <button key={h.id + (h.option ?? '')} type="button" role="listitem" className="set-search-hit" onClick={() => open(h.id, h.option)}>
                  <Icon size={16} />
                  <span>
                    <strong>{h.option ?? h.page}</strong>
                    {h.option && <small>{h.page}</small>}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
