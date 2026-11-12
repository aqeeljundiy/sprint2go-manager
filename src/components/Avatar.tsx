import type { Person } from '../types';
import { avatarColor, initials } from '../utils';
import { photoOf } from '../photos';
import { isPhone } from '../mobile/media';
import { cardTrigger, usePersonCard } from './ui/PersonCard';
import { t } from '../i18n';
import { adminV2, v2 } from '../surface';

/** v2: initials on the type scale (v1 drew them at 38% of the face, 9.9 px on a 26 px face, 11.4 on 30 px...); a face
 * under 24 px shows the first initial only, so it fits at the 12 px minimum. */
const STEPS = adminV2 ? [12, 13, 14, 15, 17, 24] : [12, 13, 15, 17, 24];
const initialsSize = (size: number) => (v2 ? STEPS.filter((s) => s <= size * 0.42).pop() ?? 12 : size * 0.38);

/** Phones keep to four picture sizes (docs/mobile-kit.md): 24 inline, 32 one-line rows, 40 two- and three-line rows, 56 headers. */
export const phoneAvatar = (size: number) => (size <= 26 ? 24 : size <= 35 ? 32 : size <= 47 ? 40 : 56);

/**
 * `card`: tapping the face opens the person's profile card (src/components/ui/PersonCard.tsx). The face becomes its own
 * button that stops the tap, so the row it sits in still opens its own item. Pass a user id when the email may not match.
 */
export function Avatar({ person, size: asked = 36, card }: { person: Person & { color?: string; photo?: string }; size?: number; card?: boolean | string }) {
  const api = usePersonCard();
  const size = isPhone() ? phoneAvatar(asked) : asked;
  const photo = person.photo ?? photoOf(person.email);
  const face = (
    <span
      className={`avatar ${photo ? 'has-photo' : ''}`}
      style={{ width: size, height: size, background: photo ? undefined : (person.color ?? avatarColor(person.email)), fontSize: initialsSize(size) }}
      aria-hidden="true"
    >
      {photo ? <img src={photo} alt="" /> : v2 && size < 24 ? initials(person.name).slice(0, 1) : initials(person.name)}
    </span>
  );
  if (!card || !api || !person.email) return face;
  const who = typeof card === 'string' ? { userId: card, email: person.email, name: person.name } : { email: person.email, name: person.name };
  return (
    <span className="avatar-btn" aria-label={t('Profile of {name}', { name: person.name })} {...cardTrigger(api, who)}>
      {face}
    </span>
  );
}
