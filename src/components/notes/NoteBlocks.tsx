import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, Plus } from 'lucide-react';
import { lineText } from './noteHtml';
import { t } from '../../i18n';

/*
 * Notes as blocks (Notion): every line of a note is a block you can grab and move. The note is still saved as the
 * same simple HTML (v1 reads it unchanged): a block is a top-level paragraph, heading, quote, code block, divider or
 * image, or one item of a top-level list (a bullet, a number, a to-do). Moving a list item out of its list wraps it in
 * a list of its own kind; lists of the same kind that end up next to each other join again.
 */

export type BlockKind = 'p' | 'h1' | 'h2' | 'h3' | 'quote' | 'callout' | 'pre' | 'ul' | 'ol' | 'check';
type ListKind = { tag: 'UL' | 'OL'; check: boolean } | null;

const BLOCKISH = 'p, div, h1, h2, h3, blockquote, pre, hr';
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The note's blocks, top to bottom. */
export function blocksOf(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of root.children) {
    if (el.tagName === 'UL' || el.tagName === 'OL') {
      for (const li of el.children) if (li.tagName === 'LI') out.push(li as HTMLElement);
    } else if (el.matches(BLOCKISH)) out.push(el as HTMLElement);
  }
  return out;
}

/** The block a node sits in (the top-level list item for a nested list). */
export function blockFor(node: Node | null, root: HTMLElement): HTMLElement | null {
  let el: Node | null = node;
  while (el && el.parentNode !== root) {
    if (el instanceof HTMLElement && el.tagName === 'LI' && el.parentElement?.parentElement === root) return el;
    el = el.parentNode;
  }
  return el instanceof HTMLElement && el.matches(BLOCKISH) ? el : null;
}

export function kindOf(b: HTMLElement): BlockKind | 'hr' | 'img' {
  if (b.tagName === 'LI') {
    const l = b.parentElement!;
    return l.tagName === 'OL' ? 'ol' : l.classList.contains('checklist') ? 'check' : 'ul';
  }
  if (b.tagName === 'HR') return 'hr';
  if (b.tagName === 'BLOCKQUOTE') return b.classList.contains('callout') ? 'callout' : 'quote';
  if (b.tagName === 'H1' || b.tagName === 'H2' || b.tagName === 'H3' || b.tagName === 'PRE') return b.tagName.toLowerCase() as BlockKind;
  if (b.querySelector('img') && !lineText(b)) return 'img';
  return 'p';
}

const listKind = (b: HTMLElement): ListKind => (b.tagName === 'LI' ? { tag: b.parentElement!.tagName as 'UL' | 'OL', check: b.parentElement!.classList.contains('checklist') } : null);

function newList(k: NonNullable<ListKind>) {
  const l = document.createElement(k.tag);
  if (k.check) l.className = 'checklist';
  return l;
}

/** Splits a list so `from` and everything after it go into a new list right after it. */
function splitAt(list: HTMLElement, from: Element) {
  const second = list.cloneNode(false) as HTMLElement;
  for (let n: Node | null = from; n; ) {
    const next: Node | null = n.nextSibling;
    second.appendChild(n);
    n = next;
  }
  list.after(second);
  return second;
}

/** Lists left empty go; next-door lists of the same kind join. */
export function normalize(root: HTMLElement) {
  for (const l of [...root.querySelectorAll<HTMLElement>(':scope > ul, :scope > ol')]) {
    if (!l.isConnected) continue;
    if (!l.querySelector(':scope > li')) {
      l.remove();
      continue;
    }
    let next = l.nextElementSibling;
    while (next && next.tagName === l.tagName && next.classList.contains('checklist') === l.classList.contains('checklist')) {
      while (next.firstChild) l.appendChild(next.firstChild);
      const after: Element | null = next.nextElementSibling;
      next.remove();
      next = after;
    }
  }
  if (!root.firstElementChild) root.innerHTML = '<p><br></p>';
}

/** Puts `unit` (a block, or a list holding one item) right after `b`, splitting b's list when b is a list item. */
function putAfter(b: HTMLElement, unit: HTMLElement) {
  if (b.tagName !== 'LI') return void b.after(unit);
  const list = b.parentElement!;
  if (b.nextElementSibling) splitAt(list, b.nextElementSibling);
  list.after(unit);
}

/** Moves block `b` before or after `target`. */
export function placeBlock(root: HTMLElement, b: HTMLElement, target: HTMLElement, after: boolean) {
  if (b === target || b.contains(target)) return;
  const k = listKind(b);
  const from = b.parentElement;
  b.remove();
  if (k && from && !from.querySelector(':scope > li')) from.remove();
  const tk = listKind(target);
  if (tk) {
    if (k && k.tag === tk.tag && k.check === tk.check) {
      if (after) target.after(b);
      else target.before(b);
    } else {
      const list = target.parentElement!;
      const ref = after ? target.nextElementSibling : target;
      if (ref) splitAt(list, ref);
      let unit: HTMLElement = b;
      if (k) (unit = newList(k)).appendChild(b);
      list.after(unit);
    }
  } else {
    const unit = k ? newList(k) : b;
    if (k) unit.appendChild(b);
    if (after) target.after(unit);
    else target.before(unit);
  }
  normalize(root);
}

/** Runs a change and slides every block from where it was to where it is now (FLIP). */
export function flip(root: HTMLElement, change: () => void) {
  const before = new Map(blocksOf(root).map((e) => [e, e.getBoundingClientRect().top]));
  change();
  if (reduced()) return;
  for (const e of blocksOf(root)) {
    const was = before.get(e);
    if (was == null) continue;
    const dy = was - e.getBoundingClientRect().top;
    if (Math.abs(dy) > 0.5) e.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }
}

/** A block coming in: fades and drops into place. */
export function enter(el: HTMLElement) {
  if (!reduced()) el.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
}

/** A block going: folds away, then leaves the note. */
export function leave(el: HTMLElement, done: () => void) {
  if (reduced()) return void (el.remove(), done());
  const h = el.getBoundingClientRect().height;
  const a = el.animate(
    [
      { opacity: 1, height: `${h}px`, overflow: 'hidden' },
      { opacity: 0, height: '0px', marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px', overflow: 'hidden' },
    ],
    { duration: 180, easing: 'ease-in' },
  );
  a.onfinish = () => (el.remove(), done());
}

export function caretTo(el: Node, atEnd: boolean) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(!atEnd);
  const s = getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}

/** A block's own words and inline bits (a list item's nested list stays behind). */
function takeInline(b: HTMLElement, into: HTMLElement) {
  for (const n of [...b.childNodes]) {
    if (n instanceof HTMLElement && (n.tagName === 'UL' || n.tagName === 'OL')) continue;
    into.appendChild(n);
  }
  if (!into.childNodes.length) into.appendChild(document.createElement('br'));
}

/** Turns a block into another kind, keeping its words. Returns the new block. */
export function turnInto(root: HTMLElement, b: HTMLElement, kind: BlockKind): HTMLElement {
  const now = kindOf(b);
  if (now === kind || now === 'hr' || now === 'img') return b;
  let el: HTMLElement;
  let unit: HTMLElement;
  if (kind === 'ul' || kind === 'ol' || kind === 'check') {
    el = document.createElement('li');
    unit = newList({ tag: kind === 'ol' ? 'OL' : 'UL', check: kind === 'check' });
    unit.appendChild(el);
  } else {
    el = document.createElement(kind === 'quote' || kind === 'callout' ? 'blockquote' : kind);
    if (kind === 'callout') el.className = 'callout';
    unit = el;
  }
  takeInline(b, el);
  const nested = [...b.children].filter((c) => c.tagName === 'UL' || c.tagName === 'OL') as HTMLElement[];
  if (b.tagName === 'LI') {
    const list = b.parentElement!;
    const second = splitAt(list, b);
    second.before(unit);
    b.remove();
    if (!list.querySelector(':scope > li')) list.remove();
  } else b.replaceWith(unit);
  // A nested list keeps going under the line it hung from (as its own list after it).
  if (nested.length) unit.after(...nested);
  normalize(root);
  return el;
}

/** A new empty paragraph right after `b` (a list item's list is split there). */
export function addAfter(root: HTMLElement, b: HTMLElement, html = '<br>') {
  const p = document.createElement('p');
  p.innerHTML = html;
  putAfter(b, p);
  normalize(root);
  return p;
}

/** The same block again, right after it. */
export function duplicate(root: HTMLElement, b: HTMLElement) {
  const copy = b.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.note-task').forEach((x) => x.remove()); // a task belongs to the line it was made from
  b.after(copy);
  normalize(root);
  return copy;
}

/** Moves the block one place up or down (Alt+Shift+arrows, the menu's Move up / Move down). */
export function moveBy(root: HTMLElement, b: HTMLElement, dir: -1 | 1) {
  const all = blocksOf(root);
  const target = all[all.indexOf(b) + dir];
  if (!target) return false;
  const sel = getSelection();
  const keep = sel?.anchorNode && b.contains(sel.anchorNode) ? { node: sel.anchorNode, at: sel.anchorOffset } : null;
  flip(root, () => placeBlock(root, b, target, dir > 0));
  if (keep?.node.isConnected) sel?.collapse(keep.node, keep.at);
  b.scrollIntoView({ block: 'nearest' });
  return true;
}

const atStart = (b: HTMLElement, r: Range) => {
  const x = document.createRange();
  x.selectNodeContents(b);
  x.setEnd(r.startContainer, r.startOffset);
  return x.toString().length === 0 && !x.cloneContents().querySelector('img');
};
const atEnd = (b: HTMLElement, r: Range) => {
  const x = document.createRange();
  x.selectNodeContents(b);
  x.setStart(r.endContainer, r.endOffset);
  return x.toString().trim().length === 0;
};

interface GutterProps {
  doc: RefObject<HTMLDivElement | null>;
  root: () => HTMLElement | null;
  /** Blocks are on (desktop, can edit). */
  active: boolean;
  /** The blocks were changed from here: save them. */
  onChanged: () => void;
  /** The handle was clicked: the block's menu. */
  onMenu: (b: HTMLElement, x: number, y: number) => void;
}

/**
 * The handle next to the block under the pointer: "+" adds a line below and opens the block menu, the dots drag the
 * block (or, clicked, open its menu). Also the keyboard: Alt+Shift+Up/Down moves the line with the caret, and
 * Backspace at the start of a heading, quote or list item turns it back into text first (Notion).
 */
export function BlockGutter({ doc, root, active, onChanged, onMenu }: GutterProps) {
  const [at, setAt] = useState<{ b: HTMLElement; top: number; left: number } | null>(null);
  const [drop, setDrop] = useState<{ top: number; left: number; width: number } | null>(null);
  const [ghost, setGhost] = useState<{ text: string; x: number; y: number } | null>(null);
  const drag = useRef<{ b: HTMLElement; x: number; y: number; on: boolean; target: { b: HTMLElement; after: boolean } | null; raf: number; vy: number } | null>(null);
  const grip = useRef<HTMLButtonElement>(null);
  const cb = useRef({ onChanged, onMenu });
  cb.current = { onChanged, onMenu };

  const place = (b: HTMLElement | null) => {
    const d = doc.current;
    const r = root();
    if (!b || !d || !r) return setAt(null);
    const dr = d.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(b).lineHeight) || 26;
    const top = br.top - dr.top + (Math.min(br.height, lh) - 28) / 2 + (b.tagName === 'BLOCKQUOTE' && b.classList.contains('callout') ? 12 : 0);
    const left = r.getBoundingClientRect().left - dr.left - 52;
    setAt((a) => (a && a.b === b && Math.abs(a.top - top) < 1 && a.left === left ? a : { b, top, left }));
  };

  // Which block the pointer is on: by height, so the margin next to a line counts as the line.
  const blockAtY = (y: number) => {
    const r = root();
    if (!r) return null;
    let best: HTMLElement | null = null;
    for (const b of blocksOf(r)) {
      const br = b.getBoundingClientRect();
      if (y >= br.top - 3 && y <= br.bottom + 3) best = b;
      if (br.top > y) break;
    }
    return best;
  };

  useEffect(() => {
    const d = doc.current;
    if (!d || !active) return setAt(null);
    const move = (e: MouseEvent) => {
      if (drag.current?.on) return;
      if ((e.target as HTMLElement).closest('.blk-gutter')) return;
      const r = root();
      const x = e.clientX;
      const rr = r?.getBoundingClientRect();
      if (!rr || x < rr.left - 80 || x > rr.right + 24) return setAt(null);
      place(blockAtY(e.clientY));
    };
    const out = (e: MouseEvent) => !d.contains(e.relatedTarget as Node) && !drag.current?.on && setAt(null);
    d.addEventListener('mousemove', move);
    d.addEventListener('mouseleave', out);
    return () => {
      d.removeEventListener('mousemove', move);
      d.removeEventListener('mouseleave', out);
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // The keyboard, and the hint on the empty line the caret is on.
  useEffect(() => {
    const r = root();
    if (!r || !active) return;
    r.classList.add('blocks');
    r.style.setProperty('--blk-hint', JSON.stringify(t('Type / for blocks')));
    let here: HTMLElement | null = null;
    const unmark = () => {
      if (!here?.classList.contains('is-caret')) return;
      here.classList.remove('is-caret');
      if (!here.classList.length) here.removeAttribute('class');
    };
    const mark = () => {
      const s = getSelection();
      const b = s?.anchorNode && r.contains(s.anchorNode) && document.activeElement === r ? blockFor(s.anchorNode, r) : null;
      if (b === here) return;
      unmark();
      here = b;
      if (b && !b.classList.contains('is-caret')) b.classList.add('is-caret');
    };
    const blur = () => {
      unmark();
      here = null;
    };
    const key = (e: KeyboardEvent) => {
      const s = getSelection();
      if (!s?.rangeCount || !s.anchorNode || !r.contains(s.anchorNode)) return;
      const b = blockFor(s.anchorNode, r);
      if (!b) return;
      if (e.altKey && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (moveBy(r, b, e.key === 'ArrowUp' ? -1 : 1)) cb.current.onChanged();
        return;
      }
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      const range = s.getRangeAt(0);
      if (e.key === 'Backspace' && s.isCollapsed && atStart(b, range)) {
        const k = kindOf(b);
        // A heading, quote, code block or list item turns into text first; the next Backspace joins it to the line above.
        if (k === 'h1' || k === 'h2' || k === 'h3' || k === 'quote' || k === 'callout' || k === 'pre' || k === 'ul' || k === 'ol' || k === 'check') {
          e.preventDefault();
          const el = turnInto(r, b, 'p');
          caretTo(el, false);
          cb.current.onChanged();
        }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && s.isCollapsed) {
        const k = kindOf(b);
        // Enter at the end of a quote or a callout starts a plain line below (Shift+Enter: a new line inside it).
        if ((k === 'quote' || k === 'callout') && atEnd(b, range)) {
          e.preventDefault();
          const p = addAfter(r, b);
          caretTo(p, false);
          enter(p);
          cb.current.onChanged();
        }
      }
    };
    // A click under the last line, when that line is a picture or a divider: a new line to write on (Notion).
    const below = (e: MouseEvent) => {
      if (e.target !== r) return;
      const all = blocksOf(r);
      const last = all[all.length - 1];
      if (!last || e.clientY < last.getBoundingClientRect().bottom) return;
      const k = kindOf(last);
      if (k !== 'img' && k !== 'hr') return;
      e.preventDefault();
      const p = addAfter(r, last);
      r.focus({ preventScroll: true });
      caretTo(p, false);
      enter(p);
      cb.current.onChanged();
    };
    document.addEventListener('selectionchange', mark);
    r.addEventListener('mousedown', below);
    r.addEventListener('keydown', key);
    r.addEventListener('blur', blur);
    return () => {
      blur();
      r.classList.remove('blocks');
      document.removeEventListener('selectionchange', mark);
      r.removeEventListener('mousedown', below);
      r.removeEventListener('keydown', key);
      r.removeEventListener('blur', blur);
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- dragging ---------- */
  const target = (y: number) => {
    const r = root();
    const d = doc.current;
    const g = drag.current;
    if (!r || !d || !g) return;
    const all = blocksOf(r).filter((b) => b !== g.b && !g.b.contains(b));
    if (!all.length) return;
    let pick = { b: all[all.length - 1], after: true };
    for (const b of all) {
      const br = b.getBoundingClientRect();
      if (y < br.top + br.height / 2) {
        pick = { b, after: false };
        break;
      }
    }
    g.target = pick;
    const dr = d.getBoundingClientRect();
    const tr = pick.b.getBoundingClientRect();
    const rr = r.getBoundingClientRect();
    const prev = pick.after ? null : all[all.indexOf(pick.b) - 1];
    const lineY = pick.after ? tr.bottom + 2 : prev ? (prev.getBoundingClientRect().bottom + tr.top) / 2 : tr.top - 2;
    setDrop({ top: lineY - dr.top, left: rr.left - dr.left, width: rr.width });
  };

  const scrollLoop = () => {
    const g = drag.current;
    if (!g?.on) return;
    const sc = doc.current?.closest('.note-scroll');
    if (sc && g.vy) {
      sc.scrollTop += g.vy;
      target(g.y);
    }
    g.raf = requestAnimationFrame(scrollLoop);
  };

  const endDrag = (commit: boolean) => {
    const g = drag.current;
    if (!g) return;
    cancelAnimationFrame(g.raf);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onEsc, true);
    document.body.classList.remove('blk-drag-on');
    g.b.classList.remove('blk-dragging');
    setDrop(null);
    setGhost(null);
    drag.current = null;
    const r = root();
    if (commit && g.on && g.target && r) {
      const moved = g.b;
      const tgt = g.target;
      const before = blocksOf(r);
      flip(r, () => placeBlock(r, moved, tgt.b, tgt.after));
      if (blocksOf(r).some((b, i) => b !== before[i])) cb.current.onChanged();
      place(moved);
    }
  };

  function onMove(e: PointerEvent) {
    const g = drag.current;
    if (!g) return;
    if (!g.on) {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < 4) return;
      g.on = true;
      g.b.classList.add('blk-dragging');
      document.body.classList.add('blk-drag-on');
      getSelection()?.removeAllRanges();
      g.raf = requestAnimationFrame(scrollLoop);
    }
    g.y = e.clientY;
    const sc = doc.current?.closest('.note-scroll')?.getBoundingClientRect();
    g.vy = sc ? (e.clientY < sc.top + 48 ? -Math.ceil((sc.top + 48 - e.clientY) / 6) : e.clientY > sc.bottom - 48 ? Math.ceil((e.clientY - sc.bottom + 48) / 6) : 0) : 0;
    setGhost({ text: lineText(g.b) || t('Line'), x: e.clientX, y: e.clientY });
    target(e.clientY);
  }
  function onUp() {
    const g = drag.current;
    if (g && !g.on) {
      endDrag(false);
      const r = grip.current?.getBoundingClientRect();
      if (r) cb.current.onMenu(g.b, r.left, r.bottom + 4);
      return;
    }
    endDrag(true);
  }
  function onEsc(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    endDrag(false);
  }

  if (!active || !at) return null;
  return (
    <>
      <div className="blk-gutter" style={{ top: at.top, left: at.left }} key="gutter">
        <button
          type="button"
          className="blk-btn"
          aria-label={t('Add a line below')}
          title={t('Add a line below')}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            const r = root();
            if (!r || !at.b.isConnected) return;
            const p = addAfter(r, at.b);
            enter(p);
            r.focus({ preventScroll: true });
            caretTo(p, false);
            // Typing the "/" opens the block menu right there.
            document.execCommand('insertText', false, '/');
            place(p);
          }}
        >
          <Plus size={16} />
        </button>
        <button
          ref={grip}
          type="button"
          className="blk-btn blk-grip"
          aria-label={t('Drag to move, click for the line’s options')}
          title={t('Drag to move, click for options')}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            drag.current = { b: at.b, x: e.clientX, y: e.clientY, on: false, target: null, raf: 0, vy: 0 };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('keydown', onEsc, true);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            const r = grip.current!.getBoundingClientRect();
            onMenu(at.b, r.left, r.bottom + 4);
          }}
        >
          <GripVertical size={16} />
        </button>
      </div>
      {drop && <div className="blk-drop" style={{ top: drop.top, left: drop.left, width: drop.width }} />}
      {ghost &&
        createPortal(
          <div className="blk-ghost" style={{ transform: `translate(${ghost.x + 12}px, ${ghost.y - 14}px)` }}>
            {ghost.text.slice(0, 80)}
          </div>,
          document.body,
        )}
    </>
  );
}
