import { TopBar, TopBarBack } from '../mobile/TopBar';
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { ArrowDown, ArrowUp, Camera, Check, ChevronRight, Download, Image as ImageIcon, Eye, Folder, FolderInput, FolderPlus, HardDrive, Info, LayoutGrid, Link2, List, Mail, Menu, MoreHorizontal, PenLine, Play, Plus, RotateCcw, Search, Star, Trash2, Upload, X } from 'lucide-react';
import type { DriveItem, DriveSection } from '../types';
import { fmtSize } from '../data/drive';
import { relative } from '../utils';
import { usePersisted } from '../settings';
import { DRIVE_SECTIONS } from './DriveSidebar';
import { FileIcon } from './FileIcon';
import { EmptyState } from './ui/EmptyState';
import { PersonName } from './ui/PersonCard';
import { useCreateAction } from '../mobile/chrome';
import { ActionSheet, useActionMenu, type SheetAction } from './ui/ActionSheet';
import { PushScreen } from './ui/PushScreen';
import { Sheet } from './ui/Sheet';
import { Group, GRow } from './ui/Grouped';
import { usePhone } from '../mobile/media';
import { fmtDay } from '../i18n/format';
import { mark, t, tn } from '../i18n';
import { toast } from '../toast';

interface Props {
  items: DriveItem[]; // everything, including attachments from email
  section: DriveSection;
  folderId: string | null;
  renamingId: string | null;
  senderOf: (threadId: string) => string;
  onFolder: (id: string | null) => void;
  onSection: (s: DriveSection) => void;
  onOpen: (item: DriveItem, list: DriveItem[]) => void;
  onStar: (id: string) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string | string[]) => void;
  onStartRename: (id: string) => void;
  onRename: (id: string, name: string | null) => void;
  onPickFiles: () => void;
  onDropFiles: (files: FileList) => void;
  onOpenThread: (threadId: string) => void;
  onMenu: () => void;
  // Phones (Google Drive's app): who's who for "You uploaded", a named new folder, moving into a folder.
  me?: string;
  nameOf?: (idOrEmail: string) => string;
  onMakeFolder?: (name: string) => void;
  onMove?: (id: string, parentId: string | null) => void;
}

const byName = (a: DriveItem, b: DriveItem) => a.name.localeCompare(b.name, undefined, { numeric: true });
const byDate = (a: DriveItem, b: DriveItem) => b.modified.localeCompare(a.modified);

/** Drive's Shared (phones): files that came from others, in a chat, by email or from a guest. */
const sharedWithMe = (i: DriveItem) => i.kind !== 'folder' && (!!i.channelId || !!i.uploadedBy || !!i.sharedWithClient || i.id.startsWith('att:'));

export function DriveView(props: Props) {
  const { items, section, folderId } = props;
  const phone = usePhone();
  const [newOpen, setNewOpen] = useState(false);
  const [naming, setNaming] = useState<{ kind: 'new' } | { kind: 'rename'; item: DriveItem } | null>(null);
  const [moving, setMoving] = useState<DriveItem | null>(null);
  const [details, setDetails] = useState<DriveItem | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  /** iPhone only opens the keyboard for focus given during the tap: render the sheet now, then focus its field. */
  const askName = (n: NonNullable<typeof naming>) => {
    flushSync(() => setNaming(n));
    document.querySelector<HTMLInputElement>('.dp-name-input')?.focus();
  };
  const newActions: SheetAction[] = [
    { label: t('Upload a file'), icon: Upload, run: props.onPickFiles },
    { label: t('Take a photo'), icon: Camera, run: () => photo.current?.click() },
    ...(props.onMakeFolder ? [{ label: t('Make a folder'), icon: FolderPlus, run: () => askName({ kind: 'new' }) }] : []),
  ];
  // Phones: "+" opens New (Drive's sheet); desktop and tablets keep Upload straight away.
  useCreateAction('drive', section !== 'trash' && (phone ? { label: t('New'), icon: Plus, run: () => setNewOpen(true), more: newActions } : { label: t('Upload'), icon: Upload, run: props.onPickFiles }));
  const [layout, setLayout] = usePersisted<'grid' | 'list'>('pm-drive-layout', 'grid');
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState(false);

  const live = items.filter((i) => !i.trashed);
  const q = query.trim().toLowerCase();
  // The same per-place order as phones (P115): Name, Modified or Size from the list header.
  const [sorts, setSorts] = usePersisted<Record<string, Sort>>('pm-drive-sorts', {});
  const sort: Sort = sorts[section] ?? defaultSort(section);
  const sortBy = (by: Sort['by']) => setSorts((x) => ({ ...x, [section]: sort.by === by ? { by, dir: sort.dir === 1 ? -1 : 1 } : { by, dir: by === 'name' ? 1 : -1 } }));
  const [recentAll, setRecentAll] = useState(false);
  const recentMore = section === 'recent' && !q && !recentAll && live.filter((i) => i.kind !== 'folder').length > RECENT;

  const shown = useMemo(() => {
    if (q) return live.filter((i) => i.name.toLowerCase().includes(q)).sort(sorter(sort));
    switch (section) {
      case 'my':
        return live.filter((i) => i.parentId === folderId && !i.id.startsWith('att:')).sort(sorter(sort));
      case 'recent':
        return live.filter((i) => i.kind !== 'folder').sort(byDate).slice(0, recentAll ? undefined : RECENT).sort(sorter(sort));
      case 'media':
        return live.filter((i) => i.kind === 'image' || i.kind === 'video').sort(sorter(sort));
      case 'email':
        return live.filter((i) => i.id.startsWith('att:')).sort(sorter(sort));
      case 'starred':
        return live.filter((i) => i.starred).sort(sorter(sort));
      case 'shared':
        return live.filter(sharedWithMe).sort(sorter(sort));
      case 'trash':
        return items.filter((i) => i.trashed).sort(byDate);
    }
  }, [items, section, folderId, q, sort.by, sort.dir, recentAll]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Where a file lives, for search results (P124). */
  const pathOf = (f: DriveItem) => {
    if (f.id.startsWith('att:')) return t('From email');
    const names: string[] = [t('My Drive')];
    for (let x = f.parentId, n = 0; x && n < 20; n++) {
      const p = items.find((i) => i.id === x);
      if (!p) break;
      names.splice(1, 0, p.name);
      x = p.parentId;
    }
    return names.join(' / ');
  };
  const emptyTrash = () => {
    const ids = items.filter((i) => i.trashed).map((i) => i.id);
    if (ids.length) props.onDeleteForever(ids);
    setConfirmEmpty(false);
  };
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const folders = shown.filter((i) => i.kind === 'folder');
  const files = shown.filter((i) => i.kind !== 'folder');

  // Breadcrumb for My Drive
  const crumbs: DriveItem[] = [];
  for (let id = folderId; id; ) {
    const f = items.find((i) => i.id === id);
    if (!f) break;
    crumbs.unshift(f);
    id = f.parentId;
  }

  const sectionName = t(DRIVE_SECTIONS.find((s) => s.id === section)!.name);
  const open = (item: DriveItem) => (item.kind === 'folder' ? props.onFolder(item.id) : props.onOpen(item, files));

  const meta = (i: DriveItem) =>
    section === 'email' && i.threadId
      ? `${props.senderOf(i.threadId)} · ${relative(i.modified)}`
      : i.kind === 'folder'
        ? tn(items.filter((x) => x.parentId === i.id && !x.trashed).length, '{n} item', '{n} items')
        : `${fmtSize(i.size)} · ${relative(i.modified)}`;

  const actions = (i: DriveItem) =>
    section === 'trash' ? (
      <>
        <button className="icon-btn sm" title={t('Restore')} onClick={() => props.onRestore(i.id)}>
          <RotateCcw size={14} />
        </button>
        <button className="icon-btn sm d-danger" title={t('Delete forever')} onClick={() => props.onDeleteForever(i.id)}>
          <Trash2 size={14} />
        </button>
      </>
    ) : i.id.startsWith('att:') ? (
      <button className="icon-btn sm" title={t('Open email')} onClick={() => props.onOpenThread(i.threadId!)}>
        <Mail size={14} />
      </button>
    ) : (
      <>
        <button className={`icon-btn sm ${i.starred ? 'starred' : ''}`} title={i.starred ? t('Unstar') : t('Star')} onClick={() => props.onStar(i.id)}>
          <Star size={14} />
        </button>
        <button className="icon-btn sm" title={t('Move to trash')} onClick={() => props.onTrash(i.id)}>
          <Trash2 size={14} />
        </button>
      </>
    );

  const shareLink = (i: DriveItem) => {
    const url = i.url && !i.url.startsWith('data:') ? new URL(i.url, location.href).href : '';
    if (!url) return;
    void navigator.clipboard?.writeText(url).then(() => toast({ text: t('Link copied') }));
  };
  const download = (i: DriveItem) => {
    if (!i.url) return;
    const a = document.createElement('a');
    a.href = i.url;
    a.download = i.name;
    a.rel = 'noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // The same actions as a list, for right-click and "…" on computers: Google Drive's order (open, share, download,
  // organise, trash), the same set the phone's sheet has.
  const menuFor = (i: DriveItem) => (): SheetAction[] => {
    if (section === 'trash')
      return [
        { label: t('Restore'), icon: RotateCcw, run: () => props.onRestore(i.id) },
        { label: t('Delete forever'), icon: Trash2, danger: true, group: 'end', run: () => props.onDeleteForever(i.id) },
      ];
    const own = !i.id.startsWith('att:');
    const canLink = !!i.url && !i.url.startsWith('data:');
    return [
      { label: t('Open'), icon: Eye, run: () => open(i) },
      ...(i.kind !== 'folder' && canLink ? [{ label: t('Share link'), icon: Link2, run: () => shareLink(i) }] : []),
      ...(i.kind !== 'folder' && i.url ? [{ label: t('Download'), icon: Download, run: () => download(i) }] : []),
      ...(i.threadId ? [{ label: t('Open the email'), icon: Mail, run: () => props.onOpenThread(i.threadId!) }] : []),
      ...(own ? [{ label: i.starred ? t('Remove star') : t('Star'), icon: Star, group: 'file', run: () => props.onStar(i.id) }] : []),
      ...(own ? [{ label: t('Rename'), icon: PenLine, group: 'file', run: () => props.onStartRename(i.id) }] : []),
      ...(own && props.onMove ? [{ label: t('Move to folder'), icon: FolderInput, group: 'file', run: () => setMoving(i) }] : []),
      { label: t('Details'), icon: Info, group: 'file', run: () => setDetails(i) },
      ...(own ? [{ label: t('Move to trash'), icon: Trash2, danger: true, group: 'end', run: () => props.onTrash(i.id) }] : []),
    ];
  };

  const name = (i: DriveItem) =>
    props.renamingId === i.id ? (
      <input
        className="rename-input"
        autoFocus
        defaultValue={i.name}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => props.onRename(i.id, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') props.onRename(i.id, null);
        }}
      />
    ) : (
      <span
        className="d-name"
        title={i.name}
        onDoubleClick={(e) => {
          if (section === 'trash' || i.id.startsWith('att:')) return;
          e.stopPropagation();
          props.onStartRename(i.id);
        }}
      >
        {i.name}
      </span>
    );

  if (phone) {
    const who = (i: DriveItem) => (i.uploadedBy ? (i.uploadedBy === props.me ? t('You') : (props.nameOf?.(i.uploadedBy) ?? '')) : '');
    const phoneMeta = (i: DriveItem) => {
      if (i.kind === 'folder') return tn(items.filter((x) => x.parentId === i.id && !x.trashed).length, '{n} item', '{n} items');
      if (i.threadId) return `${props.senderOf(i.threadId)} · ${fmtDay(i.modified)} · ${fmtSize(i.size)}`;
      const by = i.uploadedBy === props.me ? t('You uploaded') : who(i) ? t('{name} uploaded', { name: who(i) }) : '';
      return [by, fmtDay(i.modified), fmtSize(i.size)].filter(Boolean).join(' · ');
    };
    const phoneMenu = (i: DriveItem, list: DriveItem[]) => (): SheetAction[] => {
      if (section === 'trash') return menuFor(i)();
      const own = !i.id.startsWith('att:');
      const canLink = !!i.url && !i.url.startsWith('data:');
      return i.kind === 'folder'
        ? [
            { label: t('Rename'), icon: PenLine, run: () => askName({ kind: 'rename', item: i }) },
            ...(props.onMove ? [{ label: t('Move to folder'), icon: FolderInput, run: () => setMoving(i) }] : []),
            { label: i.starred ? t('Remove star') : t('Star'), icon: Star, run: () => props.onStar(i.id) },
            { label: t('Move to trash'), icon: Trash2, danger: true, group: 'end', run: () => props.onTrash(i.id) },
          ]
        : [
            { label: t('Open'), icon: Eye, run: () => props.onOpen(i, list.filter((x) => x.kind !== 'folder')) },
            ...(canLink ? [{ label: t('Share link'), icon: Link2, run: () => shareLink(i) }] : []),
            ...(i.url ? [{ label: t('Download'), icon: Download, run: () => download(i) }] : []),
            ...(own ? [{ label: i.starred ? t('Remove star') : t('Star'), icon: Star, run: () => props.onStar(i.id) }] : []),
            ...(i.threadId ? [{ label: t('Open the email'), icon: Mail, run: () => props.onOpenThread(i.threadId!) }] : []),
            ...(own ? [{ label: t('Rename'), icon: PenLine, group: 'file', run: () => askName({ kind: 'rename', item: i }) }] : []),
            ...(own && props.onMove ? [{ label: t('Move to folder'), icon: FolderInput, group: 'file', run: () => setMoving(i) }] : []),
            { label: t('Details'), icon: Info, group: 'file', run: () => setDetails(i) },
            ...(own ? [{ label: t('Move to trash'), icon: Trash2, danger: true, group: 'end', run: () => props.onTrash(i.id) }] : []),
          ];
    };
    return (
      <>
        <DrivePhone {...props} live={live} q={q} query={query} setQuery={setQuery} crumbs={crumbs} sectionName={sectionName} menuFor={phoneMenu} onNew={() => setNewOpen(true)} onEmptyTrash={() => setConfirmEmpty(true)} open={(i, list) => (i.kind === 'folder' ? props.onFolder(i.id) : props.onOpen(i, list))} meta={phoneMeta} />
        <ActionSheet open={newOpen} onClose={() => setNewOpen(false)} title={t('New')} actions={newActions} />
        {confirmEmpty && <EmptyTrashSheet count={items.filter((i) => i.trashed).length} onConfirm={emptyTrash} onClose={() => setConfirmEmpty(false)} />}
        {naming && (
          <NameSheet
            title={naming.kind === 'new' ? t('New folder') : t('Rename')}
            initial={naming.kind === 'new' ? t('Untitled folder') : naming.item.name}
            done={naming.kind === 'new' ? t('Create') : t('Save')}
            onDone={(n) => (naming.kind === 'new' ? props.onMakeFolder?.(n) : props.onRename(naming.item.id, n))}
            onClose={() => setNaming(null)}
          />
        )}
        {moving && <MoveSheet item={moving} items={items} onMove={(parentId) => props.onMove?.(moving.id, parentId)} onClose={() => setMoving(null)} />}
        {details && <DetailsScreen item={details} items={items} who={who(details)} from={details.threadId ? props.senderOf(details.threadId) : undefined} onBack={() => setDetails(null)} onOpen={() => (setDetails(null), props.onOpen(details, [details]))} onShare={details.url && !details.url.startsWith('data:') ? () => shareLink(details) : undefined} onDownload={details.url ? () => download(details) : undefined} />}
        <input
          ref={photo}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            if (e.target.files?.length) props.onDropFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </>
    );
  }

  const thumb = (i: DriveItem) =>
    i.thumb ? (
      <span className="d-thumb">
        <img src={i.thumb} alt="" loading="lazy" draggable={false} />
        {i.kind === 'video' && (
          <span className="play">
            <Play size={14} fill="currentColor" />
            {i.duration}
          </span>
        )}
      </span>
    ) : (
      <span className={`d-thumb icon-thumb k-${i.kind}`}>
        <FileIcon kind={i.kind} size={22} />
      </span>
    );

  return (
    <section
      className={`drive-pane view-enter ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        if (section === 'trash' || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) props.onDropFiles(e.dataTransfer.files);
      }}
    >
      <header className="drive-head">
        <button className="icon-btn menu-btn" onClick={props.onMenu} aria-label={t('Open menu')}>
          <Menu size={18} />
        </button>
        <div className="crumbs">
          {q ? (
            <h1>{t('Search results')}</h1>
          ) : section === 'my' ? (
            <>
              <button className={crumbs.length ? 'crumb' : 'crumb cur'} onClick={() => props.onFolder(null)}>
                {t('My Drive')}
              </button>
              {crumbs.map((c, idx) => (
                <span key={c.id} className="crumb-wrap">
                  <ChevronRight size={16} />
                  <button className={`crumb ${idx === crumbs.length - 1 ? 'cur' : ''}`} onClick={() => props.onFolder(c.id)}>
                    {c.name}
                  </button>
                </span>
              ))}
            </>
          ) : (
            <h1 className="drive-sec-title">{sectionName}</h1>
          )}
        </div>
        <label className="search drive-search">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search in Drive')} />
          {query && (
            <button onClick={() => setQuery('')} aria-label={t('Clear search')}>
              <X size={14} />
            </button>
          )}
        </label>
        {layout === 'grid' && section !== 'trash' && <SortButton sort={sort} onSort={sortBy} />}
        <div className="segmented icon-seg">
          <button className={layout === 'grid' ? 'on' : ''} onClick={() => setLayout('grid')} title={t('Grid')}>
            <LayoutGrid size={15} />
          </button>
          <button className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')} title={t('List')}>
            <List size={15} />
          </button>
        </div>
        {/* No Upload or New here on computers: the sidebar has Upload and New folder already (one primary per screen). */}
      </header>

      <div className="drive-scroll" key={`${section}:${folderId}:${layout}`}>
        {section === 'email' && !q && (
          <p className="drive-note">
            <Mail size={14} /> {t('Attachments from your emails appear here automatically.')}
          </p>
        )}
        {section === 'trash' && shown.length > 0 && (
          <p className="drive-note d-trash-note">
            <span>{t('Items in trash are deleted forever after 30 days.')}</span>
            <button type="button" className="link-btn d-empty-trash" onClick={() => setConfirmEmpty(true)}>
              {t('Empty trash')}
            </button>
          </p>
        )}

        {shown.length === 0 ? (
          <EmptyState
            icon={q ? <Search size={22} /> : section === 'trash' ? <Trash2 size={22} /> : <Upload size={22} />}
            title={q ? t('No files found') : section === 'trash' ? t('Trash is empty') : t('Nothing here yet')}
            // Phones have no Upload button and no dragging: the + is how files get in there.
            text={q ? t('Nothing matches “{q}”.', { q: query.trim() }) : section === 'trash' ? '' : phone ? t('Tap + to add files.') : t('Drag files here or press Upload.')}
          />
        ) : layout === 'list' ? (
          <div className={`d-table ${q ? 'd-search' : ''}`}>
            <div className="d-tr d-th">
              {([['name', t('Name')], ...(q ? [['loc', t('Location')]] : []), ['modified', t('Modified')], ['size', t('Size')]] as [Sort['by'] | 'loc', string][]).map(([by, label]) =>
                by === 'loc' || section === 'trash' ? (
                  <span key={by} className={by === 'name' ? '' : 'hide-mobile'}>{label}</span>
                ) : (
                  <button key={by} type="button" className={`d-sort-h ${by === 'name' ? '' : 'hide-mobile'} ${sort.by === by ? 'on' : ''}`} onClick={() => sortBy(by)} aria-sort={sort.by === by ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                    {label}
                    {sort.by === by && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                ),
              )}
              <span />
            </div>
            {shown.map((i, n) => (
              <DriveItemCard key={i.id} className="d-tr" style={{ ['--i' as string]: Math.min(n, 12) }} label={i.name} actions={menuFor(i)} onOpen={() => open(i)}>
                <span className="d-cell-name">
                  {i.thumb ? <img className="mini-thumb" src={i.thumb} alt="" /> : <FileIcon kind={i.kind} size={14} />}
                  {name(i)}
                  {i.starred && section !== 'starred' && <Star size={12} className="star-mark" />}
                </span>
                {q && <span className="muted hide-mobile d-loc" title={pathOf(i)}>{pathOf(i)}</span>}
                <span className="muted hide-mobile">{relative(i.modified)}</span>
                <span className="muted hide-mobile">{i.kind === 'folder' ? '' : fmtSize(i.size)}</span>
                <span className="d-actions" onClick={(e) => e.stopPropagation()}>
                  {actions(i)}
                </span>
              </DriveItemCard>
            ))}
          </div>
        ) : (
          <>
            {folders.length > 0 && (
              <>
                <div className="d-heading">{t('Folders')}</div>
                <div className="folder-grid">
                  {folders.map((f, n) => (
                    <DriveItemCard key={f.id} className="folder-card" style={{ ['--i' as string]: n }} label={f.name} actions={menuFor(f)} onOpen={() => open(f)}>
                      <FileIcon kind="folder" size={16} />
                      <span className="fc-text">
                        {name(f)}
                        <small>{meta(f)}</small>
                      </span>
                      <span className="d-actions" onClick={(e) => e.stopPropagation()}>
                        {actions(f)}
                      </span>
                    </DriveItemCard>
                  ))}
                </div>
              </>
            )}
            {files.length > 0 && (
              <>
                {folders.length > 0 && <div className="d-heading">{t('Files')}</div>}
                <div className={section === 'media' && !q ? 'media-grid' : 'file-grid'}>
                  {files.map((f, n) => (
                    <DriveItemCard key={f.id} className="file-card" style={{ ['--i' as string]: Math.min(n, 16) }} label={f.name} actions={menuFor(f)} onOpen={() => open(f)}>
                      {thumb(f)}
                      {section !== 'media' || q ? (
                        <span className="fc-text">
                          {name(f)}
                          <small>{meta(f)}</small>
                          {q && <small className="d-loc">{t('in {place}', { place: pathOf(f) })}</small>}
                        </span>
                      ) : null}
                      <span className="d-actions" onClick={(e) => e.stopPropagation()}>
                        {actions(f)}
                      </span>
                    </DriveItemCard>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {recentMore && shown.length > 0 && (
          <button type="button" className="ghost-btn d-show-more" onClick={() => setRecentAll(true)}>
            {t('Show more')}
          </button>
        )}
      </div>

      {dragging && (
        <div className="drop-overlay">
          <Upload size={28} />
          <strong>{t('Drop to upload')}</strong>
          <span>{section === 'my' && crumbs.length ? t('to {folder}', { folder: crumbs[crumbs.length - 1].name }) : t('to My Drive')}</span>
        </div>
      )}
      {naming && (
        <NameSheet
          title={naming.kind === 'new' ? t('New folder') : t('Rename')}
          initial={naming.kind === 'new' ? t('Untitled folder') : naming.item.name}
          done={naming.kind === 'new' ? t('Create') : t('Save')}
          onDone={(n) => (naming.kind === 'new' ? props.onMakeFolder?.(n) : props.onRename(naming.item.id, n))}
          onClose={() => setNaming(null)}
        />
      )}
      {moving && <MoveSheet item={moving} items={items} onMove={(parentId) => props.onMove?.(moving.id, parentId)} onClose={() => setMoving(null)} />}
      {details && (
        <Sheet title={t('Details')} onClose={() => setDetails(null)}>
          <div className="d-details">
            <DetailsBody item={details} items={items} who={details.uploadedBy ? (details.uploadedBy === props.me ? t('You') : (props.nameOf?.(details.uploadedBy) ?? '')) : ''} from={details.threadId ? props.senderOf(details.threadId) : undefined} />
          </div>
        </Sheet>
      )}
      {confirmEmpty && <EmptyTrashSheet count={items.filter((i) => i.trashed).length} onConfirm={emptyTrash} onClose={() => setConfirmEmpty(false)} />}
    </section>
  );
}

/**
 * A file, folder or row you can act on: tap opens it; long-press (phones), right-click or the "…" button (always there
 * on phones) open the same list of actions. The menu renders next to the card, not inside it, so a tap in the menu
 * never reaches the card.
 */
function DriveItemCard({ className, style, label, actions, onOpen, children, header }: { className: string; style?: CSSProperties; label: string; actions: () => SheetAction[]; onOpen: () => void; children: ReactNode; header?: ReactNode }) {
  const menu = useActionMenu(actions, header ? { header } : { title: label });
  const dots = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div className={`${className} lp`} style={style} onClick={onOpen} role="button" tabIndex={0} aria-label={label} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), onOpen())} {...menu.bind}>
        {children}
        <button
          ref={dots}
          type="button"
          className="icon-btn d-more"
          aria-label={t('More for {name}', { name: label })}
          onClick={(e) => {
            e.stopPropagation();
            menu.openFrom(dots);
          }}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
      {menu.menu}
    </>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
   Phones: Google Drive's iPhone app. A search pill, a sort row, plain 64 px rows with a meta line, folders first and
   pushed full screen, "+" opens New (Upload, Take a photo, Make a folder), and the file menu from "…" or a hold.
   --------------------------------------------------------------------------------------------------------------- */

type Sort = { by: 'name' | 'modified' | 'size'; dir: 1 | -1 };
const SORTS: { by: Sort['by']; label: string }[] = [
  { by: 'name', label: mark('Name') },
  { by: 'modified', label: mark('Last modified') },
  { by: 'size', label: mark('Size') },
];

/** My Drive and Starred by name, the rest newest first (Google Drive does the same). */
const defaultSort = (section: DriveSection): Sort => (section === 'my' || section === 'starred' ? { by: 'name', dir: 1 } : { by: 'modified', dir: -1 });
/** Recent shows this many, then "Show more" (P125). */
const RECENT = 30;

function sorter(s: Sort) {
  return (a: DriveItem, b: DriveItem) => {
    // Folders first, whichever way it's sorted (Drive does the same).
    const f = Number(b.kind === 'folder') - Number(a.kind === 'folder');
    if (f) return f;
    const d = s.by === 'name' ? byName(a, b) : s.by === 'size' ? a.size - b.size || byName(a, b) : a.modified.localeCompare(b.modified);
    return d * s.dir;
  };
}

/** "Proposal Rata Cof….pdf": a long name is cut before its type, which stays (Drive does the same). */
function Middle({ name }: { name: string }) {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : '';
  return (
    <span className="dp-name" title={name}>
      <span className="dp-stem">{ext ? name.slice(0, dot) : name}</span>
      {ext && <span className="dp-ext">{ext}</span>}
    </span>
  );
}

const TYPE_WORDS: Record<DriveItem['kind'], string> = {
  folder: mark('Folder'),
  image: mark('Image'),
  video: mark('Video'),
  pdf: mark('PDF'),
  doc: mark('Document'),
  sheet: mark('Spreadsheet'),
  slides: mark('Slides'),
  zip: mark('Archive'),
  audio: mark('Audio'),
  other: mark('File'),
};

function DrivePhone(props: Props & { live: DriveItem[]; q: string; query: string; setQuery: (q: string) => void; crumbs: DriveItem[]; sectionName: string; menuFor: (i: DriveItem, list: DriveItem[]) => () => SheetAction[]; onNew: () => void; onEmptyTrash: () => void; open: (i: DriveItem, list: DriveItem[]) => void; meta: (i: DriveItem) => string }) {
  const { items, section, live, q, crumbs } = props;
  const [layout, setLayout] = usePersisted<'grid' | 'list'>('pm-drive-layout-phone', 'list');
  // Each place keeps its own order: My Drive and Starred by name, the rest newest first (Google Drive does the same).
  const [sorts, setSorts] = usePersisted<Record<string, Sort>>('pm-drive-sorts', {});
  const sort: Sort = sorts[section] ?? defaultSort(section);
  const setSort = (s: Sort) => setSorts((x) => ({ ...x, [section]: s }));
  const [sortOpen, setSortOpen] = useState(false);
  const [recentAll, setRecentAll] = useState(false);

  const listIn = (folder: string | null): DriveItem[] => {
    if (q) return live.filter((i) => i.name.toLowerCase().includes(q)).sort(sorter(sort));
    switch (section) {
      case 'my':
        return live.filter((i) => i.parentId === folder && !i.id.startsWith('att:')).sort(sorter(sort));
      case 'recent':
        return live.filter((i) => i.kind !== 'folder').sort(byDate).slice(0, recentAll ? undefined : RECENT).sort(sorter(sort));
      case 'media':
        return live.filter((i) => i.kind === 'image' || i.kind === 'video').sort(sorter(sort));
      case 'email':
        return live.filter((i) => i.id.startsWith('att:')).sort(sorter(sort));
      case 'starred':
        return live.filter((i) => i.starred).sort(sorter(sort));
      case 'shared':
        return live.filter(sharedWithMe).sort(sorter(sort));
      case 'trash':
        return items.filter((i) => i.trashed).sort(byDate);
    }
  };
  const sortable = section !== 'trash'; // every list can be ordered (Trash keeps its 30-day order)

  const icon = (i: DriveItem) =>
    i.thumb ? (
      <span className="dp-icon dp-photo">
        <img src={i.thumb} alt="" loading="lazy" draggable={false} />
      </span>
    ) : (
      <span className="dp-icon">
        <FileIcon kind={i.kind} size={20} />
      </span>
    );

  const where = (f: DriveItem) => {
    if (f.id.startsWith('att:')) return t('From email');
    const names: string[] = [t('My Drive')];
    for (let x = f.parentId, n = 0; x && n < 20; n++) {
      const p = items.find((i) => i.id === x);
      if (!p) break;
      names.splice(1, 0, p.name);
      x = p.parentId;
    }
    return names.join(' / ');
  };
  const body = (folder: string | null) => {
    const list = listIn(folder);
    const files = list.filter((i) => i.kind !== 'folder');
    const recentMore = section === 'recent' && !q && !recentAll && live.filter((i) => i.kind !== 'folder').length > RECENT;
    // The sort row stays when a place is empty, so switching places never shifts the page (MA6-19).
    const sortRow = (
      <div className="dp-sort">
        {sortable ? (
          <button type="button" className="dp-sort-btn" disabled={!list.length} onClick={() => setSortOpen(true)}>
            {t(SORTS.find((s) => s.by === (sort.by === 'size' && !files.length ? 'name' : sort.by))!.label)}
            {sort.dir === 1 ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
          </button>
        ) : (
          <span className="dp-sort-note">{t('Deleted forever after 30 days')}</span>
        )}
        {section === 'trash' && list.length > 0 ? (
          <button type="button" className="dp-sort-btn dp-empty-trash" onClick={props.onEmptyTrash}>
            {t('Empty trash')}
          </button>
        ) : (
          <button type="button" className="icon-btn dp-layout" disabled={!list.length} onClick={() => setLayout(layout === 'list' ? 'grid' : 'list')} aria-label={layout === 'list' ? t('Show as a grid') : t('Show as a list')}>
            {layout === 'list' ? <LayoutGrid size={20} /> : <List size={20} />}
          </button>
        )}
      </div>
    );
    if (!list.length)
      return (
        <>
          {sortRow}
          <EmptyState
            icon={section === 'trash' ? <Trash2 size={24} /> : q ? <Search size={24} /> : section === 'starred' ? <Star size={24} /> : section === 'media' ? <ImageIcon size={24} /> : section === 'email' ? <Mail size={24} /> : <Folder size={24} />}
            title={q ? t('No files found') : section === 'trash' ? t('Trash is empty') : section === 'my' ? t('This folder is empty') : section === 'starred' ? t('No starred files') : section === 'media' ? t('No photos or videos yet') : t('Nothing here yet')}
            action={
              !q && section === 'my' ? (
                <button type="button" className="primary-btn" onClick={props.onNew}>
                  <Plus size={16} /> {t('New')}
                </button>
              ) : undefined
            }
            text={
              q
                ? t('Nothing matches “{q}”.', { q: props.query.trim() })
                : section === 'my'
                  ? folder
                    ? t('Add files or folders here')
                    : t('Upload files or make a folder to get started.')
                  : section === 'media'
                    ? t('Photos and videos you upload or receive show here.')
                    : section === 'email'
                      ? t('Attachments from your emails appear here automatically.')
                      : section === 'starred'
                        ? t('Star a file from its menu and it waits for you here.')
                        : section === 'trash'
                          ? t('Deleted files stay here for 30 days.')
                          : section === 'shared'
                            ? t('Files people send you in chat, by email or from a guest show here.')
                            : t('Files you upload or open show here, newest first.')
            }
          />
        </>
      );
    return (
      <>
        {sortRow}
        {layout === 'list' ? (
          <div className="dp-list" key="list">
            {list.map((i, n) => (
              <DriveItemCard key={i.id} className="dp-row" style={{ ['--i' as string]: Math.min(n, 12) }} label={i.name} header={<DriveMenuHead i={i} meta={props.meta(i)} />} actions={props.menuFor(i, list)} onOpen={() => props.open(i, files)}>
                {icon(i)}
                <span className="dp-text">
                  <Middle name={i.name} />
                  <span className="dp-meta">
                    {i.starred && <Star size={12} className="dp-star" fill="currentColor" />}
                    {q ? `${where(i)} · ${fmtDay(i.modified)}` : props.meta(i)}
                  </span>
                </span>
              </DriveItemCard>
            ))}
          </div>
        ) : (
          <div className={section === 'media' && !q ? 'media-grid' : 'dp-grid drv-grid'} key="grid">
            {list.map((i, n) => (
              <DriveItemCard key={i.id} className="file-card dp-tile" style={{ ['--i' as string]: Math.min(n, 16) }} label={i.name} header={<DriveMenuHead i={i} meta={props.meta(i)} />} actions={props.menuFor(i, list)} onOpen={() => props.open(i, files)}>
                {i.thumb ? (
                  <span className="d-thumb">
                    <img src={i.thumb} alt="" loading="lazy" draggable={false} />
                  </span>
                ) : (
                  <span className={`d-thumb icon-thumb k-${i.kind}`}>
                    <FileIcon kind={i.kind} size={22} />
                  </span>
                )}
                {(section !== 'media' || q) && (
                  <span className="fc-text">
                    <span className="dp-tile-text">
                      <span className="d-name" title={i.name}>
                        {i.starred && <Star size={12} className="dp-star" fill="currentColor" />}
                        {i.name}
                      </span>
                      <span className="dp-tile-date">{q ? where(i) : fmtDay(i.modified)}</span>
                    </span>
                  </span>
                )}
              </DriveItemCard>
            ))}
          </div>
        )}
        {recentMore && (
          <button type="button" className="dp-show-more" onClick={() => setRecentAll(true)}>
            {t('Show more')}
          </button>
        )}
      </>
    );
  };

  return (
    <section className="drive-pane drive-phone view-enter">
      {/* One search: the field under the bar (Google Drive). No magnifier on top of it. */}
      <TopBar app="drive" search={false} lead={!q && (section === 'media' || section === 'email' || section === 'trash') ? <TopBarBack onClick={() => props.onSection('recent')} /> : undefined} />
      <div className="drive-scroll" key={`${section}:${layout}`}>
        <label className="dp-search">
          <Search size={20} />
          <input value={props.query} onChange={(e) => props.setQuery(e.target.value)} placeholder={t('Search in Drive')} aria-label={t('Search in Drive')} enterKeyHint="search" />
          {props.query && (
            <button type="button" onClick={() => props.setQuery('')} aria-label={t('Clear search')}>
              <X size={16} />
            </button>
          )}
        </label>
        {/* A search looks through all of Drive, whatever the title says the place is (MJ6-1). */}
        {q && <p className="drive-note dp-caption">{t('Results from all of Drive')}</p>}
        {section === 'email' && !q && live.some((i) => i.id.startsWith('att:')) && <p className="drive-note dp-caption">{t('Email attachments land here automatically.')}</p>}
        {body(null)}
      </div>
      {section === 'my' &&
        !q &&
        crumbs.map((c, idx) => (
          <PushScreen
            key={c.id}
            title={c.name}
            backLabel={idx ? crumbs[idx - 1].name : t('My Drive')}
            onBack={() => props.onFolder(c.parentId)}
            className="drive-push"
            actions={
              <button type="button" className="icon-btn dp-push-new" onClick={props.onNew} aria-label={t('New in {folder}', { folder: c.name })}>
                <Plus size={22} />
              </button>
            }
          >
            <div className="drive-scroll dp-in">{body(c.id)}</div>
          </PushScreen>
        ))}
      {sortOpen && (
        <Sheet title={t('Sort by')} onClose={() => setSortOpen(false)}>
          <div className="as-list">
            {SORTS.map((s) => (
              <button
                key={s.by}
                type="button"
                className="as-item"
                onClick={() => {
                  setSort(sort.by === s.by ? { by: s.by, dir: sort.dir === 1 ? -1 : 1 } : { by: s.by, dir: s.by === 'name' ? 1 : -1 });
                  setSortOpen(false);
                }}
              >
                <span className="as-label">{t(s.label)}</span>
                {sort.by === s.by && (sort.dir === 1 ? <ArrowUp size={16} className="as-check" /> : <ArrowDown size={16} className="as-check" />)}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </section>
  );
}

/** The top of a file's menu: its icon, name and what it is (Drive's quiet header row). */
function DriveMenuHead({ i, meta }: { i: DriveItem; meta: string }) {
  return (
    <div className="dp-menu-head">
      {i.thumb ? (
        <span className="dp-icon dp-photo">
          <img src={i.thumb} alt="" />
        </span>
      ) : (
        <span className="dp-icon">
          <FileIcon kind={i.kind} size={20} />
        </span>
      )}
      <span className="dp-text">
        <span className="dp-name">{i.name}</span>
        <span className="dp-meta">{i.kind === 'folder' ? meta : `${t(TYPE_WORDS[i.kind])} · ${fmtSize(i.size)}`}</span>
      </span>
    </div>
  );
}

/** A name for a new folder or a rename: one field, focused, with the name selected. */
export function NameSheet({ title, initial, done, onDone, onClose }: { title: string; initial: string; done: string; onDone: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial);
  const ok = name.trim().length > 0;
  return (
    <Sheet
      title={title}
      onClose={onClose}
      className="dp-name-sheet"
      head={
        <button type="button" className="dp-done" disabled={!ok} onClick={() => ok && (onDone(name.trim()), onClose())}>
          {done}
        </button>
      }
    >
      <form
        className="dp-name-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) (onDone(name.trim()), onClose());
        }}
      >
        <input className="dp-name-input" value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} aria-label={title} enterKeyHint="done" />
      </form>
    </Sheet>
  );
}

/** Where a file or folder can go: My Drive and every folder that isn't the thing itself or inside it. */
function MoveSheet({ item, items, onMove, onClose }: { item: DriveItem; items: DriveItem[]; onMove: (parentId: string | null) => void; onClose: () => void }) {
  const inside = (id: string | null): boolean => {
    for (let x = id; x; x = items.find((i) => i.id === x)?.parentId ?? null) if (x === item.id) return true;
    return false;
  };
  const pathOf = (f: DriveItem) => {
    const names: string[] = [];
    for (let x = f.parentId; x; ) {
      const p = items.find((i) => i.id === x);
      if (!p) break;
      names.unshift(p.name);
      x = p.parentId;
    }
    return names.length ? names.join(' / ') : t('My Drive');
  };
  const folders = items.filter((i) => i.kind === 'folder' && !i.trashed && !inside(i.id)).sort(byName);
  return (
    <Sheet title={t('Move “{name}”', { name: item.name })} onClose={onClose} size="tall">
      <div className="as-list">
        <button type="button" className="as-item" onClick={() => (onMove(null), onClose())}>
          <HardDrive size={18} className="as-icon" />
          <span className="as-label">{t('My Drive')}</span>
          {item.parentId === null && <Check size={16} className="as-check" />}
        </button>
        {folders.map((f) => (
          <button key={f.id} type="button" className="as-item" onClick={() => (onMove(f.id), onClose())}>
            <Folder size={18} className="as-icon" />
            <span className="as-label">
              {f.name}
              {f.parentId && <small>{pathOf(f)}</small>}
            </span>
            {item.parentId === f.id && <Check size={16} className="as-check" />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** Details & activity: what it is, how big, where it lives, who put it there and when. */
function DetailsBody({ item, items, who, from }: { item: DriveItem; items: DriveItem[]; who: string; from?: string }) {
  const where: string[] = [];
  for (let x = item.parentId; x; ) {
    const p = items.find((i) => i.id === x);
    if (!p) break;
    where.unshift(p.name);
    x = p.parentId;
  }
  return (
    <>
      <DriveMenuHead i={item} meta={tn(items.filter((x) => x.parentId === item.id && !x.trashed).length, '{n} item', '{n} items')} />
      <Group>
        {!from && <GRow label={t('Location')} value={item.id.startsWith('att:') ? t('From email') : [t('My Drive'), ...where].join(' / ')} />}
        <GRow label={t('Modified')} value={fmtDay(item.modified)} />
        {item.kind !== 'folder' && <GRow label={t('Size')} value={fmtSize(item.size)} />}
        {who && <GRow label={t('Uploaded by')} value={item.uploadedBy ? <PersonName who={item.uploadedBy}>{who}</PersonName> : who} />}
        {from && <GRow label={t('Saved from an email by')} value={from} />}
        {item.starred && <GRow label={t('Starred')} value={t('Yes')} />}
      </Group>
    </>
  );
}

/** Computers in grid view: the same Name / Modified / Size order as the list header, from one button (P115). */
function SortButton({ sort, onSort }: { sort: Sort; onSort: (by: Sort['by']) => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useActionMenu(() => SORTS.map((s) => ({ label: t(s.label), checked: sort.by === s.by, run: () => onSort(s.by) })), { menu: true, width: 200 });
  return (
    <>
      <button ref={btn} type="button" className="ghost-btn d-sort-btn" onClick={() => menu.openFrom(btn)} title={t('Sort by')}>
        {t(SORTS.find((s) => s.by === sort.by)!.label)}
        {sort.dir === 1 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
      </button>
      {menu.menu}
    </>
  );
}

/** Empty trash: one question, then everything in it goes (one Undo toast comes from App). */
function EmptyTrashSheet({ count, onConfirm, onClose }: { count: number; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet title={t('Empty trash?')} onClose={onClose}>
      <div className="d-confirm">
        <p>{tn(count, '{n} item will be deleted forever.', '{n} items will be deleted forever.')}</p>
        <div className="d-confirm-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="button" className="danger-btn" onClick={onConfirm}>
            <Trash2 size={16} /> {t('Empty trash')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function DetailsScreen({ item, items, who, from, onBack, onOpen, onShare, onDownload }: { item: DriveItem; items: DriveItem[]; who: string; from?: string; onBack: () => void; onOpen: () => void; onShare?: () => void; onDownload?: () => void }) {
  return (
    <PushScreen title={t('Details')} backLabel={t('Drive')} onBack={onBack} className="g-page dp-details">
      <div className="dp-details-body">
        <DetailsBody item={item} items={items} who={who} from={from} />
        <div className="dp-details-actions">
          <button type="button" className="primary-btn" onClick={onOpen}>
            <Eye size={16} /> {t('Open')}
          </button>
          {(onShare || onDownload) && (
            <div className="dp-details-more">
              {onShare && (
                <button type="button" className="ghost-btn" onClick={onShare}>
                  <Link2 size={16} /> {t('Share link')}
                </button>
              )}
              {onDownload && (
                <button type="button" className="ghost-btn" onClick={onDownload}>
                  <Download size={16} /> {t('Download')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </PushScreen>
  );
}
