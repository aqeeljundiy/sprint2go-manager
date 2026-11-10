import { ChevronRight, Rows3, Rows4, Search } from 'lucide-react';
import { t } from '../i18n';
import type { Density } from '../settings';

/**
 * The new look's top bar on desktop (src/uiLook.ts): where you are as a path (Company / App / Section), search with
 * Ctrl K, and the row density. The same bar on every app, so each screen starts from the same place.
 */
export function WorkBar({ company, app, section, onApp, onSearch, density, onDensity }: { company: string; app: string; section?: string; onApp?: () => void; onSearch: () => void; density: Density; onDensity: (d: Density) => void }) {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header className="v2-bar">
      <nav className="v2-path" aria-label={t('You are here')}>
        <span className="v2-path-co">{company}</span>
        <ChevronRight size={14} aria-hidden className="v2-path-sep" />
        {section ? (
          <>
            <button type="button" className="v2-path-app" onClick={onApp}>
              {app}
            </button>
            <ChevronRight size={14} aria-hidden className="v2-path-sep" />
            <strong className="v2-path-now">{section}</strong>
          </>
        ) : (
          <strong className="v2-path-now">{app}</strong>
        )}
      </nav>
      <div className="v2-bar-tools">
        <button type="button" className="v2-find" onClick={onSearch}>
          <Search size={15} aria-hidden />
          <span>{t('Search')}</span>
          <kbd>{mac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <div className="v2-density" role="group" aria-label={t('Row density')}>
          <button type="button" className={density === 'comfortable' ? 'on' : ''} aria-pressed={density === 'comfortable'} onClick={() => onDensity('comfortable')} title={t('Comfortable')} aria-label={t('Comfortable')}>
            <Rows3 size={15} />
          </button>
          <button type="button" className={density === 'compact' ? 'on' : ''} aria-pressed={density === 'compact'} onClick={() => onDensity('compact')} title={t('Compact')} aria-label={t('Compact')}>
            <Rows4 size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
