import type { Person } from '../types';
import { avatarColor, initials } from '../utils';
import { photoOf } from '../photos';
import { isPhone } from '../mobile/media';
import { cardTrigger, usePersonCard } from './ui/PersonCard';
import { t } from '../i18n';

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
      style={{ width: size, height: size, background: photo ? undefined : (person.color ?? avatarColor(person.email)), fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {photo ? <img src={photo} alt="" /> : initials(person.name)}
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
