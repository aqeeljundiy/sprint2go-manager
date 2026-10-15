// One motion system: every layer has a home, and it enters from there and leaves back there, whatever opened it.
// The direction comes from where a thing lives, never from where you tapped (the one exception is a popover, which
// belongs to its button). Leaving reverses entering, a little faster. Pick a preset; don't write one-off keyframes.
//
//   layer     lives               enters                          leaves
//   launcher  underneath           settles 96% -> 100% (CSS)       settles back to 96%
//   app       over the launcher    rises from the centre           sinks back to the centre
//   screen    beside, to the right slides in from the right        slides out to the right
//   drawer    the left edge        from the left                   to the left
//   sheet     the bottom edge      from the bottom                 to the bottom
//   popover   its button           grows 4-8 px from the button    shrinks into it
//   toast     above the bar        up from the bottom              down and out
//
// The same values live in CSS as --dur-in, --dur-out, --ease-in-motion and --ease-out-motion (tokens.css).

export const DUR_IN = 240;
export const DUR_OUT = 180;
export const EASE_OUT = 'cubic-bezier(0.2, 0, 0, 1)'; // entering: quick start, soft landing
export const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)'; // leaving: soft start, quick exit

export type Layer = 'app' | 'screen' | 'drawer' | 'sheet' | 'popover' | 'toast';

// The "away" state of each layer: entering animates from it, leaving animates to it.
const AWAY: Record<Layer, Keyframe> = {
  app: { opacity: 0, transform: 'scale(0.96)' },
  screen: { opacity: 1, transform: 'translateX(100%)' },
  drawer: { opacity: 1, transform: 'translateX(-100%)' },
  sheet: { opacity: 1, transform: 'translateY(100%)' },
  popover: { opacity: 0, transform: 'scale(0.96)' },
  toast: { opacity: 0, transform: 'translateY(16px)' },
};
const HOME: Keyframe = { opacity: 1, transform: 'none' };

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Plays a layer's entrance or exit on `el`. Reduced motion: a 150 ms fade. The transform only lasts while it runs. */
export function play(el: HTMLElement, layer: Layer, way: 'in' | 'out'): Animation | null {
  if (typeof el.animate !== 'function') return null;
  if (reduced()) return el.animate(way === 'in' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease' });
  const frames = way === 'in' ? [AWAY[layer], HOME] : [HOME, AWAY[layer]];
  return el.animate(frames, way === 'in' ? { duration: DUR_IN, easing: EASE_OUT } : { duration: DUR_OUT, easing: EASE_IN });
}
