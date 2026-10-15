import { isPhone } from '../mobile/media';
import { useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, Pencil, UserRound, X } from 'lucide-react';
import { useActionMenu, type SheetAction } from './ui/ActionSheet';
import { usePersonCard } from './ui/PersonCard';
import type { Person } from '../types';
import { Avatar } from './Avatar';
import { t } from '../i18n';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

interface Props {
  label: string;
  value: Person[];
  contacts: Person[];
  autoFocus?: boolean;
  onChange: (p: Person[]) => void;
  trailing?: React.ReactNode;
  /** Which field this is, so a chip can offer to move to the others (Gmail: To, Cc and Bcc). */
  field?: Field;
  onMove?: (p: Person, to: Field) => void;
}

export type Field = 'to' | 'cc' | 'bcc';
const FIELD_NAME: Record<Field, () => string> = { to: () => t('To'), cc: () => 'Cc', bcc: () => 'Bcc' };

export function RecipientInput({ label, value, contacts, autoFocus, onChange, trailing, field, onMove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [hi, setHi] = useState(0);

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return contacts
      .filter((c) => !value.some((v) => v.email === c.email))
      .filter((c) => c.name.toLowerCase().includes(q) || c.email.includes(q))
      // Names or emails that start with what you typed come first.
      .map((c) => ({ c, rank: c.name.toLowerCase().split(' ').some((w) => w.startsWith(q)) || c.email.startsWith(q) ? 0 : 1 }))
      .sort((a, b) => a.rank - b.rank)
      .map(({ c }) => c)
      .slice(0, 5);
  }, [text, contacts, value]);

  const add = (p: Person) => {
    if (!value.some((v) => v.email === p.email)) onChange([...value, p]);
    setText('');
    setHi(0);
  };

  const commit = () => {
    const typed = text.trim().replace(/[,;]$/, '');
    if (suggestions[hi] && !isEmail(typed)) return add(suggestions[hi]);
    if (isEmail(typed)) add(contacts.find((c) => c.email === typed) ?? { name: typed.split('@')[0], email: typed });
  };

  return (
    <div className="recip">
      <span className="recip-label">{label}</span>
      <div className="recip-chips">
        {value.map((p) => (
          <Chip
            key={p.email}
            p={p}
            field={field}
            onMove={onMove}
            onRemove={() => onChange(value.filter((v) => v.email !== p.email))}
            onEdit={() => {
              // Back into the field as text, to fix a typo (Gmail's double-click).
              onChange(value.filter((v) => v.email !== p.email));
              setText(p.email);
              requestAnimationFrame(() => input.current?.focus());
            }}
          />
        ))}
        <input
          ref={input}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setHi(0);
          }}
          onKeyDown={(e) => {
            if (['Enter', ',', ';', 'Tab'].includes(e.key) && text.trim()) {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && !text && value.length) {
              onChange(value.slice(0, -1));
            } else if (e.key === 'ArrowDown' && suggestions.length) {
              e.preventDefault();
              setHi((h) => (h + 1) % suggestions.length);
            } else if (e.key === 'ArrowUp' && suggestions.length) {
              e.preventDefault();
              setHi((h) => (h - 1 + suggestions.length) % suggestions.length);
            }
          }}
          onBlur={() => isEmail(text.trim()) && commit()}
          placeholder={value.length ? '' : t('Name or email')}
        />
      </div>
      {trailing}
      {suggestions.length > 0 && (
        <div className="recip-suggest">
          {suggestions.map((c, i) => (
            <button
              key={c.email}
              className={i === hi ? 'hi' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                add(c);
              }}
            >
              <Avatar person={c} size={isPhone() ? 40 : 26} />
              <span>
                <strong>{c.name}</strong>
                <small>{c.email}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One recipient: tap the face for its menu (profile, edit, move to Cc or Bcc, remove); the X removes. */
function Chip({ p, field, onMove, onRemove, onEdit }: { p: Person; field?: Field; onMove?: (p: Person, to: Field) => void; onRemove: () => void; onEdit: () => void }) {
  const face = useRef<HTMLButtonElement>(null);
  const card = usePersonCard();
  const menu = useActionMenu(
    (): SheetAction[] => [
      ...(card ? [{ label: t('Profile'), icon: UserRound, run: () => card.open(p, face.current) }] : []),
      { label: t('Edit address'), icon: Pencil, run: onEdit },
      ...(onMove && field ? (['to', 'cc', 'bcc'] as Field[]).filter((f) => f !== field).map((f) => ({ label: t('Move to {field}', { field: FIELD_NAME[f]() }), icon: ArrowRightLeft, group: 'move', run: () => onMove(p, f) })) : []),
      { label: t('Remove'), icon: X, group: 'end', danger: true, run: onRemove },
    ],
    { title: p.name || p.email, menu: true },
  );
  return (
    <span className="recip-chip" title={p.email}>
      <button ref={face} type="button" className="recip-face" onClick={() => menu.openFrom(face)} onDoubleClick={onEdit} aria-haspopup="menu" aria-expanded={menu.open} aria-label={t('Options for {name}', { name: p.name || p.email })}>
        <Avatar person={p} size={18} />
        {p.name}
      </button>
      <button type="button" onClick={onRemove} aria-label={t('Remove {name}', { name: p.name })}>
        <X size={12} />
      </button>
      {menu.menu}
    </span>
  );
}
