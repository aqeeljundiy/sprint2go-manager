import { Fragment, useMemo, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react';
import type { User } from '../../types';
import { Avatar } from '../Avatar';
import { PersonName } from '../ui/PersonCard';
import { t } from '../../i18n';

/** "@Ana": a person's first name as one word, the way a mention is written (and how the app finds who to tell). */
const first = (u: User) => u.name.trim().split(/\s+/)[0] ?? '';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Teammates a comment mentions with "@Firstname". */
export function mentionedIn(text: string, users: User[]): User[] {
  return users.filter((u) => !u.deletedAt && first(u) && new RegExp(`(^|\\s)@${esc(first(u))}\\b`, 'i').test(text));
}

/** The "@word" being typed at the caret, if any. */
function triggerAt(text: string, cursor: number) {
  let i = cursor;
  while (i > 0 && !/\s/.test(text[i - 1])) i--;
  const word = text.slice(i, cursor);
  return word.startsWith('@') && !word.slice(1).includes('@') ? { query: word.slice(1), start: i } : null;
}

/**
 * "@" in a comment box: a short list of teammates under the field; arrows, Enter or a tap put "@Name " in the text.
 * Spread `field` on the textarea, render `list` next to it.
 */
export function useMentions({ text, setText, users, me, inputRef }: { text: string; setText: (v: string) => void; users: User[]; me: string; inputRef: RefObject<HTMLTextAreaElement | null> }) {
  const [cursor, setCursor] = useState(-1);
  const [hi, setHi] = useState(0);
  const trig = cursor >= 0 ? triggerAt(text, cursor) : null;
  const options = useMemo(() => {
    if (!trig) return [];
    const q = trig.query.toLowerCase();
    return users.filter((u) => !u.deletedAt && u.id !== me && (u.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || u.email.toLowerCase().startsWith(q))).slice(0, 6);
  }, [trig?.query, users, me]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (u: User) => {
    if (!trig) return;
    const ins = `@${first(u)} `;
    const next = text.slice(0, trig.start) + ins + text.slice(cursor).replace(/^\S*/, '').replace(/^\s/, '');
    setText(next);
    const at = trig.start + ins.length;
    setCursor(-1);
    setHi(0);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(at, at);
    });
  };
  const showing = !!trig && options.length > 0;
  const track = (el: HTMLTextAreaElement) => setCursor(el.selectionStart ?? -1);
  return {
    showing,
    /** Call first in the textarea's onKeyDown; true means the key was used by the list. */
    onKey: (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showing) return false;
      if (e.key === 'ArrowDown') return (e.preventDefault(), setHi((h) => Math.min(h + 1, options.length - 1)), true);
      if (e.key === 'ArrowUp') return (e.preventDefault(), setHi((h) => Math.max(h - 1, 0)), true);
      if (e.key === 'Enter' || e.key === 'Tab') return (e.preventDefault(), pick(options[Math.min(hi, options.length - 1)]), true);
      if (e.key === 'Escape') return (e.preventDefault(), e.stopPropagation(), setCursor(-1), true);
      return false;
    },
    field: {
      onChange: (e: ChangeEvent<HTMLTextAreaElement>) => (setText(e.target.value), track(e.target), setHi(0)),
      onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement>) => track(e.currentTarget),
      onBlur: () => setTimeout(() => setCursor(-1), 150),
    },
    list: showing ? (
      <div className="qa-suggest mention-list" role="listbox" aria-label={t('People')}>
        {options.map((u, i) => (
          <button key={u.id} type="button" role="option" aria-selected={i === hi} className={`qa-sug${i === hi ? ' hi' : ''}`} onPointerDown={(e) => e.preventDefault()} onClick={() => pick(u)}>
            <span className="qa-sug-icon">
              <Avatar person={u} size={20} />
            </span>
            <span className="mention-name">{u.name}</span>
          </button>
        ))}
      </div>
    ) : null,
  };
}

/** A comment's text with each "@Name" as a link that opens that person's card. */
export function MentionText({ text, users }: { text: string; users: User[] }) {
  const who = mentionedIn(text, users);
  if (!who.length) return <>{text}</>;
  const byName = new Map(who.map((u) => [first(u).toLowerCase(), u]));
  const re = new RegExp(`(^|\\s)(@(?:${who.map((u) => esc(first(u))).join('|')}))\\b`, 'gi');
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = (m.index ?? 0) + m[1].length;
    out.push(text.slice(last, at));
    const u = byName.get(m[2].slice(1).toLowerCase());
    out.push(
      u ? (
        <PersonName key={at} who={u.id} className="mention-chip">
          {m[2]}
        </PersonName>
      ) : (
        m[2]
      ),
    );
    last = at + m[2].length;
  }
  out.push(text.slice(last));
  return (
    <>
      {out.map((x, i) => (
        <Fragment key={i}>{x}</Fragment>
      ))}
    </>
  );
}
