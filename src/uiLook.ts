// Which look the app wears: the new one ("v2", the A+B workspace) or the classic one ("v1"). The new look is the
// default; Settings, Appearance switches back, and `?ui=v1` / `?ui=v2` in any address does the same (and remembers
// it), so the classic screens stay one click away for anyone who prefers them. Only the root's data-app attribute
// changes: every v2 rule in src/appv2.css is scoped to :root[data-app='v2'], so the classic look is untouched.
import { useEffect } from 'react';
import { usePersisted } from './settings';

export type UiLook = 'v2' | 'v1';
const KEY = 's2g-ui-look';

/** A `?ui=` in the address wins once and is remembered (a support link can switch someone's look). */
function fromUrl(): UiLook | null {
  try {
    const q = new URLSearchParams(location.search).get('ui');
    return q === 'v1' || q === 'v2' ? q : null;
  } catch {
    return null;
  }
}

export function useUiLook() {
  const [look, setLook] = usePersisted<UiLook>(KEY, fromUrl() ?? 'v2');
  useEffect(() => {
    const asked = fromUrl();
    if (asked && asked !== look) setLook(asked);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.app !== look) root.dataset.app = look;
  }, [look]);
  return [look, setLook] as const;
}
