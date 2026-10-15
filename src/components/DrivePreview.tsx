import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Link2, Mail, Star, Trash2, X } from 'lucide-react';
import type { DriveItem } from '../types';
import { fmtSize } from '../data/drive';
import { fullDate } from '../utils';
import { FileIcon } from './FileIcon';
import { t } from '../i18n';
import { toast } from '../toast';
import { useFocusedScreen } from '../mobile/chrome';

interface Props {
  item: DriveItem;
  list: DriveItem[];
  onNav: (item: DriveItem) => void;
  onClose: () => void;
  onStar: (id: string) => void;
  onTrash: (id: string) => void;
  onOpenThread: (threadId: string) => void;
}

/** Full-screen preview with ←/→ (or a sideways swipe on phones) to flip through the folder; a swipe down closes it. */
export function DrivePreview({ item, list, onNav, onClose, onStar, onTrash, onOpenThread }: Props) {
  const idx = list.findIndex((i) => i.id === item.id);
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
  const fromEmail = item.id.startsWith('att:');
  const isBlob = item.thumb?.startsWith('blob:');
  const href = item.url ?? (isBlob ? item.thumb : undefined);
  const link = item.url && !item.url.startsWith('data:') && !item.url.startsWith('blob:') ? new URL(item.url, location.href).href : '';
  useFocusedScreen(true, onClose); // phones: the tab bar and the create button step aside under the viewer

  // The next file slides in from the side it comes from; the first open zooms (P120).
  const [dir, setDir] = useState<'' | 'from-left' | 'from-right'>('');
  const go = (to: DriveItem | null, way: 'from-left' | 'from-right') => {
    if (!to) return;
    setDir(way);
    onNav(to);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && prev) (setDir('from-left'), onNav(prev));
      if (e.key === 'ArrowRight' && next) (setDir('from-right'), onNav(next));
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [prev, next, onNav, onClose]);

  // Sideways flips to the next or previous file; down closes, with the picture following the finger (P121).
  const touch = useRef<{ x: number; y: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const follow = (dy: number) => {
    const s = stage.current;
    const b = box.current;
    if (s) (s.style.transform = dy > 0 ? `translateY(${dy}px)` : ''), (s.style.transition = dy ? 'none' : '');
    if (b) b.style.backgroundColor = dy > 0 ? `rgb(8 8 12 / ${Math.max(0.3, 1 - dy / 400)})` : '';
  };
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => {
      touch.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    },
    onTouchMove: (e: React.TouchEvent) => {
      const start = touch.current;
      if (!start) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (dy > 0 && dy > Math.abs(dx) * 1.5) follow(dy);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const start = touch.current;
      touch.current = null;
      if (!start) return;
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      if (dy > 100 && dy > Math.abs(dx) * 1.5) return onClose();
      if (stage.current) stage.current.style.transition = '';
      follow(0);
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) go(next, 'from-right');
      if (dx > 0) go(prev, 'from-left');
    },
  };

  return (
    <div className="lightbox" ref={box} onClick={onClose} {...swipe}>
      <header className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <FileIcon kind={item.kind} size={14} />
        <div className="lb-title">
          <strong>{item.name}</strong>
          <small>
            {fmtSize(item.size)} · {fullDate(item.modified)}
          </small>
        </div>
        {item.threadId && (
          <button className="lb-btn" onClick={() => onOpenThread(item.threadId!)} title={t('Open related email')}>
            <Mail size={17} />
          </button>
        )}
        {link && (
          <button className="lb-btn" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast({ text: t('Link copied') }))} title={t('Copy link')}>
            <Link2 size={17} />
          </button>
        )}
        {href && (
          <a className="lb-btn" href={href} download={item.name} rel="noreferrer" title={t('Download')}>
            <Download size={17} />
          </a>
        )}
        {!fromEmail && (
          <>
            <button className={`lb-btn ${item.starred ? 'starred' : ''}`} onClick={() => onStar(item.id)} title={item.starred ? t('Unstar') : t('Star')}>
              <Star size={17} />
            </button>
            <button
              className="lb-btn"
              onClick={() => {
                // Move on to the next file, as Drive and Photos do; close only when nothing is left (P118).
                const to = next ?? prev;
                if (to) go(to, next ? 'from-right' : 'from-left');
                onTrash(item.id);
                if (!to) onClose();
              }}
              title={t('Move to trash')}
            >
              <Trash2 size={17} />
            </button>
          </>
        )}
        <button className="lb-btn" onClick={onClose} title={t('Close (Esc)')}>
          <X size={19} />
        </button>
      </header>

      <div className={`lb-stage ${dir}`} key={item.id} ref={stage}>
        {item.kind === 'video' && (isBlob || item.url) ? (
          <video src={isBlob ? item.thumb : item.url} controls autoPlay onClick={(e) => e.stopPropagation()} />
        ) : item.kind === 'pdf' && item.url ? (
          // PDFs open in the browser's own viewer: pages, zoom and search, nothing to install.
          <div className="lb-pdf" onClick={(e) => e.stopPropagation()}>
            <iframe src={item.url} title={item.name} />
          </div>
        ) : item.url && textKind(item.name) ? (
          <TextView url={item.url} name={item.name} />
        ) : item.thumb ? (
          <div className="lb-media" onClick={(e) => e.stopPropagation()}>
            <img src={item.thumb} alt={item.name} />
          </div>
        ) : (
          <div className="lb-doc" onClick={(e) => e.stopPropagation()}>
            <FileIcon kind={item.kind} size={40} />
            <strong>{item.name}</strong>
            <span>{fmtSize(item.size)}</span>
            <small>{t('No preview for this file type')}</small>
            {item.url ? (
              <a className="primary-btn lb-action" href={item.url} download={item.name} rel="noreferrer">
                <Download size={16} /> {t('Download')}
              </a>
            ) : item.threadId ? (
              <button type="button" className="primary-btn lb-action" onClick={() => onOpenThread(item.threadId!)}>
                <Mail size={16} /> {t('Open the email')}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* Previous and next come as a pair: the one with nowhere to go stays, dimmed. */}
      {list.length > 1 && (
        <>
          <button className="lb-nav left" disabled={!prev} onClick={(e) => (e.stopPropagation(), go(prev, 'from-left'))} aria-label={t('Previous file')}>
            <ChevronLeft size={24} />
          </button>
          <button className="lb-nav right" disabled={!next} onClick={(e) => (e.stopPropagation(), go(next, 'from-right'))} aria-label={t('Next file')}>
            <ChevronRight size={24} />
          </button>
        </>
      )}
      {list.length > 1 && idx >= 0 && (
        <div className="lb-count">
          {idx + 1} / {list.length}
        </div>
      )}
    </div>
  );
}

const TEXT_TYPES = /\.(txt|md|markdown|csv|tsv|json|log|xml|ya?ml|ini|env|toml|html?|css|scss|js|jsx|mjs|ts|tsx|py|rb|go|rs|java|kt|swift|c|h|cpp|cs|php|sh|sql)$/i;
/** Plain text and code read as text in the viewer. */
const textKind = (name: string) => TEXT_TYPES.test(name);
/** Big files stop here: the rest is one Download away. */
const TEXT_MAX = 200_000;

/** Text and code, shown as they are, with line numbers off and wrapping on; a short note while it loads. */
function TextView({ url, name }: { url: string; name: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setText(null);
    setFailed(false);
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((x) => live && setText(x))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <div className="lb-text" onClick={(e) => e.stopPropagation()}>
      {failed ? (
        <div className="lb-doc">
          <FileIcon kind="other" size={40} />
          <strong>{name}</strong>
          <small>{t('This file could not be read. Download it to open it.')}</small>
          <a className="primary-btn lb-action" href={url} download={name} rel="noreferrer">
            <Download size={16} /> {t('Download')}
          </a>
        </div>
      ) : (
        <pre className={text === null ? 'loading' : ''}>
          {text === null ? t('Loading…') : text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}\n\n${t('The rest is in the download.')}` : text}
        </pre>
      )}
    </div>
  );
}