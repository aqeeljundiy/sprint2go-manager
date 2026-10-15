// The launcher's motion on phones, from the shared layer system (src/motion.ts): the app is the layer on top, so it
// rises from the centre over the launcher and sinks back into the centre when you leave, the same way for every app,
// whichever tile you tapped. The launcher settles between 96% and 100% underneath (launcher.css). Reduced motion: a
// 150 ms fade. The transform is only there while the animation runs, so nothing fixed inside the app stays trapped.
import { play } from '../motion';

const app = () => document.querySelector<HTMLElement>('.app');

/** While it rises or sinks, the app is lifted over the launcher (the launcher sits over the app's screen otherwise). */
function lift(el: HTMLElement, anim: Animation | null) {
  if (!anim) return;
  el.style.position = 'relative';
  el.style.zIndex = '41';
  const drop = () => (el.style.removeProperty('position'), el.style.removeProperty('z-index'));
  anim.addEventListener('finish', drop);
  anim.addEventListener('cancel', drop);
}

/** An app opened from the launcher: it rises on the next frame. (The tile argument is kept for callers; unused.) */
export function launchGrow(_tile?: Element | null) {
  requestAnimationFrame(() => {
    const el = app();
    if (el) lift(el, play(el, 'app', 'in'));
  });
}

/** Back to the launcher: the app on screen sinks back, showing the launcher beneath. */
export function launchShrink(_tile?: Element | null) {
  const el = app();
  if (el) lift(el, play(el, 'app', 'out'));
}
