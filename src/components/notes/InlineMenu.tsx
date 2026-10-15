import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../../i18n';

export interface InlineItem {
  key: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  group?: string;
  run: () => void;
}

type Trigger = '@' | '/';
interface At {
  kind: Trigger;
  q: string;
  node: Text;
  from: number; // where the @ or / sits in `node`
  x: number;
  top: number;
  bottom: number;
}

const MATCH = /(?:^|[\s ])([@/])([^\s @/]{0,30})$/;

/**
 * The menu that opens right at the caret while writing (Notion, Slack): "@" for people and notes, "/" for blocks.
 * It filters as you type; arrows move, Enter or Tab picks, Escape closes. What was typed (the @ or / and the
 * filter) goes before the pick runs. On a phone it sits just above the caret line, so it stays clear of the keyboard.
 */
export function InlineMenu({ root, active, items }: { root: () => HTMLElement | null; active: boolean; items: (kind: Trigger, q: string) => InlineItem[] }) {
  const [at, setAt] = useState<At | null>(null);
  const [leaving, setLeaving] = useState<At | null>(null);
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const shown = at ?? leaving;
  const list = shown ? items(shown.kind, shown.q) : [];
  const live = useRef({ at, list, sel });
  live.current = { at, list, sel };

  const close = () => {
    setAt((a) => {
      if (a) {
        setLeaving(a);
        setTimeout(() => setLeaving(null), 140);
      }
      return null;
    });
  };

  const pick = (it: InlineItem) => {
    const a = live.current.at;
    if (!a) return;
    const s = getSelection();
    if (a.node.isConnected && s) {
      const end = s.anchorNode === a.node ? s.anchorOffset : Math.min(a.node.length, a.from + 1 + a.q.length);
      const r = document.createRange();
      r.setStart(a.node, a.from);
      r.setEnd(a.node, end);
      s.removeAllRanges();
      s.addRange(r);
      document.execCommand('delete');
    }
    setAt(null);
    setLeaving(null);
    it.run();
  };

  useEffect(() => {
    const el = root();
    if (!el || !active) return;
    const onInput = (e: Event) => {
      const s = getSelection();
      const node = s?.anchorNode;
      if (!s?.isCollapsed || !node || node.nodeType !== 3) return close();
      const before = (node.textContent ?? '').slice(0, s.anchorOffset);
      const m = MATCH.exec(before);
      const typed = (e as InputEvent).data ?? '';
      if (!m || (!live.current.at && !typed.endsWith(m[1]))) return close();
      if (m[1] === '/' && node.parentElement?.closest('a, pre, code')) return close();
      const r = document.createRange();
      r.setStart(node, s.anchorOffset);
      r.collapse(true);
      const rect = r.getClientRects()[0] ?? (node.parentElement as HTMLElement).getBoundingClientRect();
      setAt((prev) => {
        if (!prev || prev.kind !== m[1] || prev.q !== m[2]) setSel(0);
        return { kind: m[1] as Trigger, q: m[2], node: node as Text, from: s.anchorOffset - m[2].length - 1, x: rect.left, top: rect.top, bottom: rect.bottom };
      });
      setLeaving(null);
    };
    const onKey = (e: KeyboardEvent) => {
      const { at: a, list: l, sel: i } = live.current;
      if (!a) return;
      if (e.key === 'Escape') return void (e.preventDefault(), e.stopPropagation(), close());
      if (!l.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSel((i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        pick(l[i]);
      }
    };
    const onBlur = () => setTimeout(() => !el.contains(document.activeElement) && close(), 120);
    el.addEventListener('input', onInput);
    el.addEventListener('keydown', onKey, true);
    el.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('keydown', onKey, true);
      el.removeEventListener('blur', onBlur);
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typing on with nothing left to show closes it (a sentence that just has an @ in it).
  useEffect(() => {
    if (at && !list.length && at.q.length > 2) close();
  }, [at, list.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Placed by the caret, kept on screen (above the caret line when there's no room below, and on phones always).
  const [pos, setPos] = useState<{ left: number; top: number; width: number }>({ left: 0, top: 0, width: 300 });
  useLayoutEffect(() => {
    if (!shown || !box.current) return;
    const vv = window.visualViewport;
    const vw = vv?.width ?? innerWidth;
    const vh = (vv?.height ?? innerHeight) + (vv?.offsetTop ?? 0);
    const width = Math.min(300, vw - 32);
    const h = box.current.offsetHeight;
    const phone = vw < 768;
    const below = shown.bottom + 6;
    const up = shown.top - 6 - h;
    const top = (phone || below + h > vh - 8) && up > 8 ? up : Math.min(below, vh - h - 8);
    setPos({ left: Math.max(16, Math.min(shown.x - 12, vw - width - 16)), top, width });
  }, [shown, list.length]);

  useEffect(() => {
    box.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!shown || (!list.length && !at)) return null;
  let group = '';
  return (
    <div
      ref={box}
      className={`note-inline${at ? '' : ' leaving'}`}
      role="listbox"
      aria-label={shown.kind === '@' ? t('Mention a person or a note') : t('Insert a block')}
      style={{ left: pos.left, top: pos.top, width: pos.width }}
      onPointerDown={(e) => e.preventDefault()}
    >
      {list.length ? (
        list.map((it, i) => {
          const head = it.group && it.group !== group ? (group = it.group) : null;
          return (
            <div key={it.key} role="presentation">
              {head && <div className="as-group">{head}</div>}
              <button type="button" role="option" aria-selected={i === sel} className={`as-item${i === sel ? ' on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => pick(it)}>
                <span className="ni-icon">{it.icon}</span>
                <span className="as-label">
                  {it.label}
                  {it.hint && <small>{it.hint}</small>}
                </span>
              </button>
            </div>
          );
        })
      ) : (
        <p className="sheet-empty">{t('Nothing matches “{query}”', { query: shown.q })}</p>
      )}
    </div>
  );
}
