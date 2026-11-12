import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { AppWindow, PanelRight } from 'lucide-react';
import { usePersisted } from '../../settings';
import { v2 } from '../../surface';
import { t } from '../../i18n';

/**
 * One way to hold a panel that sits next to your work (Ask AI, a chat thread, a task, a table row, a contact), on
 * /v2: drag its edge to make it wider or narrower, and switch it between a side panel and a pop-up window. Both are
 * remembered per person (s2g-panel:<id> follows them between devices, src/settings.ts SYNCED).
 *
 *   const fp = useFlexPanel('thread', { width: 360 });
 *   <aside className={`chat-side ${fp.className}`} style={fp.style}>{fp.edges} … {fp.modeButton} … </aside>
 *
 * The panel's CSS reads --fp-w (and --fp-h in a window); src/v2-flex.css has the look of both modes, the edges and
 * the switch. On v1 (/) the hook changes nothing: no edges, no button, no class, so v1 stays the backup as it was.
 * Phones keep the panel as it was (a full screen or a sheet): there is no room to resize, so the edges hide there.
 */
export type PanelMode = 'side' | 'window';
interface Saved {
  mode: PanelMode;
  w: number; // side panel width
  ww: number; // window width
  wh: number; // window height
}
interface Opts {
  /** Side panel width when nobody has resized it. */
  width: number;
  min?: number;
  max?: number;
  /** Window size when nobody has resized it. */
  window?: { width: number; height: number };
  /** Where the window sits: the middle of the page (panels with a scrim) or the bottom-right corner (companions). */
  anchor?: 'center' | 'corner';
  mode?: PanelMode;
  /** A companion with no scrim (Ask AI): docked at the side, it makes room instead of covering the page. */
  dock?: boolean;
}

type Edge = 'l' | 'r' | 't' | 'b' | 'tl' | 'bl' | 'br' | 'tr';

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

export function useFlexPanel(id: string, o: Opts) {
  const min = o.min ?? 320;
  const max = o.max ?? 960;
  const win = o.window ?? { width: 640, height: 720 };
  const anchor = o.anchor ?? 'center';
  const base: Saved = { mode: o.mode ?? 'side', w: o.width, ww: win.width, wh: win.height };
  const [saved, setSaved] = usePersisted<Partial<Saved>>(`s2g-panel:${id}`, base);
  const s: Saved = { ...base, ...saved };
  const live = useRef(s);
  live.current = s;

  const startDrag = useCallback(
    (edge: Edge) => (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const start = { x: e.clientX, y: e.clientY, ...live.current };
      const el = (e.currentTarget as HTMLElement).closest<HTMLElement>('.fp');
      // Centred windows grow on both sides at once, so the edge stays under the pointer.
      const k = start.mode === 'window' && anchor === 'center' ? 2 : 1;
      const sx = edge.includes('l') ? -k : edge.includes('r') ? k : 0;
      const sy = edge.includes('t') ? -k : edge.includes('b') ? k : 0;
      document.body.classList.add('resizing', sy && !sx ? 'resizing-y' : 'resizing-x');
      el?.classList.add('fp-dragging');
      let next = start;
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        next =
          start.mode === 'side'
            ? { ...start, w: Math.round(clamp(start.w + sx * dx, min, Math.min(max, innerWidth - 120))) }
            : { ...start, ww: Math.round(clamp(start.ww + sx * dx, min, innerWidth - 32)), wh: Math.round(clamp(start.wh + sy * dy, 320, innerHeight - 32)) };
        // While dragging, only the CSS variable moves (no React render per pixel); the size is saved on release.
        if (o.dock && next.mode === 'side') document.documentElement.style.setProperty('--fp-dock', `${next.w}px`);
        if (el) {
          el.style.setProperty('--fp-w', `${next.mode === 'side' ? next.w : next.ww}px`);
          if (next.mode === 'window') el.style.setProperty('--fp-h', `${next.wh}px`);
        }
      };
      const up = () => {
        document.body.classList.remove('resizing', 'resizing-x', 'resizing-y');
        el?.classList.remove('fp-dragging');
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        removeEventListener('pointercancel', up);
        setSaved(next);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
    },
    [anchor, min, max, setSaved, o.dock],
  );

  // Double-click an edge: back to the size it started at.
  const reset = () => setSaved({ ...live.current, ...(live.current.mode === 'side' ? { w: o.width } : { ww: win.width, wh: win.height }) });

  // Docked: the page gets narrower by the panel's width (src/v2-flex.css, :root.fp-docked), and back when it closes.
  const docked = v2 && !!o.dock && s.mode === 'side';
  useEffect(() => {
    if (!docked) return;
    const root = document.documentElement;
    root.style.setProperty('--fp-dock', `${s.w}px`);
    root.classList.add('fp-docked');
    return () => root.classList.remove('fp-docked');
  }, [docked, s.w]);

  if (!v2)
    return { on: false, mode: 'side' as PanelMode, className: '', style: undefined as CSSProperties | undefined, edges: null as ReactNode, modeButton: null as ReactNode, scrimClass: '' };

  const edgeList: Edge[] = s.mode === 'side' ? ['l'] : anchor === 'center' ? ['l', 'r', 'b', 'bl', 'br'] : ['l', 't', 'tl'];
  const label = t('Drag to resize');
  const edges = (
    <>
      {edgeList.map((e) => (
        <span key={e} className={`fp-edge fp-${e}`} onPointerDown={startDrag(e)} onDoubleClick={reset} title={label} aria-hidden="true" />
      ))}
    </>
  );
  const toWindow = s.mode === 'side';
  const modeButton = (
    <button
      type="button"
      className="icon-btn sm fp-mode"
      onClick={() => setSaved({ ...live.current, mode: toWindow ? 'window' : 'side' })}
      title={toWindow ? t('Open as a pop-up window') : t('Dock as a side panel')}
      aria-label={toWindow ? t('Open as a pop-up window') : t('Dock as a side panel')}
    >
      {toWindow ? <AppWindow size={15} /> : <PanelRight size={15} />}
    </button>
  );
  const style = { '--fp-w': `${s.mode === 'side' ? s.w : s.ww}px`, ...(s.mode === 'window' ? { '--fp-h': `${s.wh}px` } : {}) } as CSSProperties;
  return {
    on: true,
    mode: s.mode,
    className: `fp fp-${s.mode} fp-at-${anchor}`,
    style,
    edges,
    modeButton,
    /** For panels that sit in a scrim: the scrim centres the window. */
    scrimClass: `fp-scrim-${s.mode}`,
  };
}
