import { useEffect, useState } from 'react';
import type { User } from '../types';
import { PersonSelect } from './ui/PeoplePicker';
import { ChoiceRow, Group, TextRow } from './ui/Grouped';
import { t } from '../i18n';

/** The optional details on your profile card. Each shows on the card only when it's filled in. */
export type ProfilePatch = Partial<Pick<User, 'phone' | 'pronouns' | 'location' | 'department' | 'reportsTo'>>;

const FIELDS = () =>
  [
    { key: 'pronouns', label: t('Pronouns'), placeholder: t('e.g. she/her') },
    { key: 'phone', label: t('Phone'), placeholder: t('e.g. +62 812 3456 7890') },
    { key: 'department', label: t('Department'), placeholder: t('e.g. Design') },
    { key: 'location', label: t('Location'), placeholder: t('e.g. Jakarta') },
  ] as const;

/** A text field that saves when you leave it. */
function Field({ label, value, placeholder, type, onSave }: { label: string; value: string; placeholder: string; type?: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="field">
      <label>{label}</label>
      <input value={v} type={type} placeholder={placeholder} maxLength={80} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() !== value && onSave(v.trim())} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </div>
  );
}

/** Desktop: plain fields under Display name and Title. */
export function ProfileDetailsFields({ me, people, onSave }: { me?: User; people: User[]; onSave: (p: ProfilePatch) => void }) {
  if (!me) return null;
  const others = people.filter((u) => u.id !== me.id && !u.deletedAt);
  return (
    <>
      {FIELDS().map((f) => (
        <Field key={f.key} label={f.label} value={me[f.key] ?? ''} placeholder={f.placeholder} type={f.key === 'phone' ? 'tel' : undefined} onSave={(v) => onSave({ [f.key]: v })} />
      ))}
      <div className="field">
        <label>{t('Reports to')}</label>
        <PersonSelect value={me.reportsTo ?? null} users={others} onChange={(id) => onSave({ reportsTo: id })} label={t('Reports to')} placeholder={t('No one')} extra={[{ value: '', label: t('No one') }]} />
      </div>
    </>
  );
}

/** Phones: one row each, tap to edit. */
export function ProfileDetailsPhone({ me, people, onSave }: { me?: User; people: User[]; onSave: (p: ProfilePatch) => void }) {
  if (!me) return null;
  const others = people.filter((u) => u.id !== me.id && !u.deletedAt);
  return (
    <Group title={t('About you')} footer={t('Shown on your profile card when filled in.')}>
      {FIELDS().map((f) => (
        <TextRow key={f.key} label={f.label} value={me[f.key] ?? ''} placeholder={f.placeholder} onSave={(v) => onSave({ [f.key]: v.trim() })} />
      ))}
      <ChoiceRow<string> label={t('Reports to')} value={me.reportsTo ?? ''} onChange={(v) => onSave({ reportsTo: v })} options={[{ value: '', label: t('No one') }, ...others.map((u) => ({ value: u.id, label: u.name }))]} />
    </Group>
  );
}
