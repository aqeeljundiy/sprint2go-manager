import { Sheet } from '../ui/Sheet';
import { useState } from 'react';
import { ChevronRight, Link2, Menu, Pencil, Plus, Table2, Trash2, X } from 'lucide-react';
import { useActionMenu } from '../ui/ActionSheet';
import { toast } from '../../toast';
import { Group } from '../ui/Grouped';
import { usePhone } from '../../mobile/media';
import type { Client, DataTable, TableRow } from '../../types';
import { term } from '../../terms';
import { relative, uid } from '../../utils';
import { SmoothHeight } from '../ui/Smooth';
import { ProjectPicker } from '../ProjectPicker';
import { TABLE_COLORS, TEMPLATES, templateFields, type TemplateId } from './fields';
import { EmptyState } from '../ui/EmptyState';
import { IconTile } from '../ui/IconTile';
import { useCreateAction } from '../../mobile/chrome';
import { tableLink, useTableLinkOpen } from './hooks';
import { t, tn } from '../../i18n';

/* ---------- sidebar ---------- */

/** The Tables sidebar: the company's tables, then each project's. */
export function TablesSidebar({ tables, clients, current, onOpen, onNew }: { tables: DataTable[]; clients: Client[]; current: string | null; onOpen: (id: string) => void; onNew: () => void }) {
  const company = tables.filter((t) => !t.clientId);
  const byProject = clients.map((c) => ({ c, list: tables.filter((t) => t.clientId === c.id) })).filter((g) => g.list.length);
  const item = (tb: DataTable) => (
    <button key={tb.id} className={`nav-item ${current === tb.id ? 'active' : ''}`} onClick={() => onOpen(tb.id)} title={tb.name}>
      <span className="client-dot" style={{ background: tb.color }}>
        {tb.name.charAt(0).toUpperCase()}
      </span>
      <span className="sb-label">{tb.name}</span>
    </button>
  );
  return (
    <>
      <button className="compose-btn" onClick={onNew} title={t('New table')}>
        <Plus size={16} />
        <span className="sb-label">{t('New table')}</span>
      </button>
      {company.length > 0 && (
        <>
          <div className="nav-heading sb-label">{t('Company')}</div>
          <nav className="nav">{company.map(item)}</nav>
        </>
      )}
      {byProject.map(({ c, list }) => (
        <div key={c.id}>
          <div className="nav-heading sb-label">{c.name}</div>
          <nav className="nav">{list.map(item)}</nav>
        </div>
      ))}
      {!tables.length && <p className="muted small sb-note sb-label">{t('No tables yet. Make one for leads, a content pipeline, anything you track in rows.')}</p>}
    </>
  );
}

/* ---------- new table ---------- */

export function NewTableDialog({ clients, clientId: startClient, onCreate, onClose }: { clients: Client[]; clientId?: string; onCreate: (d: { name: string; clientId?: string; template: TemplateId }) => void; onClose: () => void }) {
  const phoneSheet = usePhone();
  const [template, setTemplate] = useState<TemplateId>('blank'); // a quick list starts blank, as in Notion; the templates sit right there
  const [clientId, setClientId] = useState(startClient ?? '');
  const tplName = TEMPLATES.find((x) => x.id === template)!.name;
  const project = clients.find((c) => c.id === clientId);
  const suggested = template === 'blank' ? t('Untitled table') : project ? t('{project} {template}', { project: project.name, template: tplName.toLowerCase() }) : tplName;
  const [name, setName] = useState('');
  const create = () => onCreate({ name: name.trim() || suggested, clientId: clientId || undefined, template });
  // The form itself, shared by the phone's sheet and the computer's dialog.
  const body = (
    <>
            <div className="field">
              <span>{t('Start from')}</span>
              <div className="cat-pick two tb-tpl-pick">
                {TEMPLATES.map((x) => (
                  <button key={x.id} type="button" className={template === x.id ? 'on' : ''} onClick={() => setTemplate(x.id)}>
                    <strong>{x.name}</strong>
                    <small>{x.hint}</small>
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>{t('Name')}</span>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested} onKeyDown={(e) => e.key === 'Enter' && create()} />
            </label>
            <div className="field">
              <span>{t('Belongs to')}</span>
              <ProjectPicker value={clientId} onChange={setClientId} projects={clients} none={t('The whole company')} label={t('Belongs to')} />
            </div>
            <p className="muted small">{clientId ? t('It shows in the {project}’s Tables tab too. Every column can be changed later.', { project: term.one }) : t('Everyone in the company can open it. Every column can be changed later.')}</p>
          </>
  );
  // Phones: a bottom sheet with the name field focused (it rides above the keyboard), not a centred dialog.
  if (phoneSheet)
    return (
      <Sheet title={t('New table')} onClose={onClose} className="new-sheet" footer={<button type="button" className="primary-btn new-sheet-go" disabled={false} onClick={create}>{t('Create table')}</button>}>
        {body}
      </Sheet>
    );
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label={t('New table')} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && !document.querySelector('.pop') && onClose()}>
        <header className="modal-head">
          <span className="dump-title">
            <Table2 size={15} /> {t('New table')}
          </span>
          <button className="icon-btn sm" onClick={onClose} aria-label={t('Close')}>
            <X size={15} />
          </button>
        </header>
        <div className="modal-body connect-form">
          <SmoothHeight>
            {body}
          </SmoothHeight>
        </div>
        <footer className="modal-foot">
          <span className="spacer" />
          <button className="ghost-btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className="primary-btn" onClick={create}>
            {t('Create table')}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** A new table's document, from a template. */
export function makeTable(d: { name: string; clientId?: string; template: TemplateId }, workspaceId: string, me: string, color?: string): DataTable {
  const { fields, views } = templateFields(d.template);
  return { id: uid(), workspaceId, name: d.name, color: color ?? TABLE_COLORS[Math.floor(Math.random() * TABLE_COLORS.length)], clientId: d.clientId, fields, views, createdBy: me, createdAt: new Date().toISOString() };
}

/* ---------- a project's tables (its Tables tab) ---------- */

/** What a table's card or row offers when right-clicked or held: open, copy a link, rename, delete (with Undo). */
type TableActions = { onOpen: (id: string) => void; onRename?: (id: string, name: string) => void; onDelete?: (id: string) => void };
function useTableMenu({ onOpen, onRename, onDelete }: TableActions) {
  const [hit, setHit] = useState<DataTable | null>(null);
  const [renaming, setRenaming] = useState<DataTable | null>(null);
  const menu = useActionMenu(
    () =>
      !hit
        ? []
        : [
            { label: t('Open'), icon: ChevronRight, run: () => onOpen(hit.id) },
            { label: t('Copy link'), icon: Link2, run: () => void navigator.clipboard?.writeText(tableLink(hit.id)).then(() => toast({ text: t('Link copied') })) },
            ...(onRename ? [{ label: t('Rename'), icon: Pencil, run: () => setRenaming(hit) }] : []),
            ...(onDelete ? [{ label: t('Delete'), icon: Trash2, danger: true, group: 'end', run: () => onDelete(hit.id) }] : []),
          ],
    { title: hit?.name },
  );
  const bind = (tb: DataTable) => ({ ...menu.bind, onContextMenu: (e: React.MouseEvent<HTMLElement>) => (setHit(tb), menu.bind.onContextMenu(e)), onPointerDown: (e: React.PointerEvent<HTMLElement>) => (setHit(tb), menu.bind.onPointerDown?.(e)) });
  const extra = (
    <>
      {menu.menu}
      {renaming && onRename && <RenameSheet name={renaming.name} onSave={(name) => onRename(renaming.id, name)} onClose={() => setRenaming(null)} />}
    </>
  );
  return { bind, extra };
}

function RenameSheet({ name, onSave, onClose }: { name: string; onSave: (name: string) => void; onClose: () => void }) {
  const [v, setV] = useState(name);
  const save = () => (v.trim() && v.trim() !== name && onSave(v.trim()), onClose());
  return (
    <Sheet
      title={t('Rename table')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="ghost-btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="button" className="primary-btn" disabled={!v.trim()} onClick={save}>
            {t('Save')}
          </button>
        </>
      }
    >
      <input className="input" autoFocus value={v} aria-label={t('Table name')} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
    </Sheet>
  );
}

/** "Edited 2 hours ago": the newest row change, or when the table was made. */
function editedAgo(tb: DataTable, rows: TableRow[]) {
  const last = rows.reduce((m, r) => (r.tableId === tb.id && r.updatedAt > m ? r.updatedAt : m), tb.createdAt);
  return t('Edited {when}', { when: relative(last) });
}

export function ProjectTables({ tables, rows, onOpen, onNew, onRename, onDelete, bare }: { tables: DataTable[]; rows: TableRow[]; onOpen: (id: string) => void; onNew: () => void; bare?: boolean } & Omit<TableActions, 'onOpen'>) {
  // Right-click a table's card: open it, copy a link to it, rename or delete it.
  const cardMenu = useTableMenu({ onOpen, onRename, onDelete });
  if (!tables.length)
    return (
      <EmptyState
        icon={<Table2 size={20} />}
        title={t('No tables for this {project} yet', { project: term.one })}
        text={t('Leads, a content pipeline, a list of anything: your own columns, as a grid or a board.')}
        action={
          <button className="primary-btn sm" onClick={onNew}>
            <Plus size={14} /> {t('New table')}
          </button>
        }
      />
    );
  return (
    <div className="tb-project">
      {!bare && <div className="tb-project-head">
        <span className="spacer" />
        <button className="ghost-btn sm" onClick={onNew}>
          <Plus size={13} /> {t('New table')}
        </button>
      </div>}
      <div className="tb-cards">
        {tables.map((tb, i) => {
          return (
            <button key={tb.id} className="tb-table-card" style={{ ['--i' as string]: i }} onClick={() => onOpen(tb.id)} {...cardMenu.bind(tb)}>
              <span className="client-badge" style={{ background: tb.color }}>
                {tb.name.charAt(0).toUpperCase()}
              </span>
              <span className="tb-tc-text">
                <strong>{tb.name}</strong>
                <small>{tb.description || editedAgo(tb, rows)}</small>
              </span>
            </button>
          );
        })}
      </div>
      {cardMenu.extra}
    </div>
  );
}

/* ---------- the table screen ---------- */

/** Tables with none open: every table as a card (company first, then each project's), or how to start. */
export function TablesHome({ tables, rows, clients, onOpen, onNew, onMenu, onRename, onDelete }: { tables: DataTable[]; rows: TableRow[]; clients: Client[]; onOpen: (id: string) => void; onNew: () => void; onMenu: () => void } & Omit<TableActions, 'onOpen'>) {
  useCreateAction('tables', { label: t('New table'), icon: Plus, run: onNew });
  useTableLinkOpen(null, onOpen); // a link to a table, a view or a row
  const groups = [{ id: '', name: t('Company'), list: tables.filter((tb) => !tb.clientId) }, ...clients.map((c) => ({ id: c.id, name: c.name, list: tables.filter((tb) => tb.clientId === c.id) }))].filter((g) => g.list.length);
  const phone = usePhone();
  const rowMenu = useTableMenu({ onOpen, onRename, onDelete }); // phones: hold a row
  // Phones: Notion's home, as iOS grouped rows under who they belong to: the table's tile, its name, how many rows.
  if (phone && tables.length)
    return (
      <section className="tasks-pane view-enter g-page tb-home-phone">
        <div className="tracking-scroll">
          {groups.map((g) => (
            <Group key={g.id || 'company'} title={g.name}>
              {g.list.map((tb) => (
                <button key={tb.id} type="button" className="g-row has-icon tb-home-row" onClick={() => onOpen(tb.id)} {...rowMenu.bind(tb)}>
                  <IconTile letter={tb.name} color={tb.color} size={32} className="tb-home-tile" />
                  <span className="g-label">
                    <span className="g-text">{tb.name}</span>
                  </span>
                  <span className="g-val">{tn(rows.filter((r) => r.tableId === tb.id).length, '{n} row', '{n} rows')}</span>
                  <ChevronRight size={18} className="g-chev" aria-hidden />
                </button>
              ))}
            </Group>
          ))}
        </div>
        {rowMenu.extra}
      </section>
    );
  return (
    <section className="tasks-pane view-enter">
      <header className="tracking-head tasks-head tb-head-bar tb-home-head">
        <button className="icon-btn menu-btn" onClick={onMenu} aria-label={t('Open menu')}>
          <Menu size={18} />
        </button>
        <div className="th-text">
          <h1>{t('Tables')}</h1>
        </div>
        {/* No New table here: the sidebar's button is the one way in (as in Drive). */}
      </header>
      <div className="tracking-scroll">
        {!tables.length ? (
          <EmptyState
            icon={<Table2 size={20} />}
            title={t('No tables yet')}
            text={t('Start from Leads, a content pipeline or a blank table. Add your own columns any time.')}
            action={
              // Phones: the create button is the one way in, so no second "New table" here.
              // With the sidebar open its New table is the one button (tables.css hides this one).
              !phone && <button className="primary-btn sm tb-empty-new" onClick={onNew}>
                <Plus size={14} /> {t('New table')}
              </button>
            }
          />
        ) : (
          groups.map((g) => (
            <div key={g.id || 'company'} className="tb-home-group">
              <h3 className="tb-home-group-head">{g.name}</h3>
              <ProjectTables tables={g.list} rows={rows} onOpen={onOpen} onNew={onNew} onRename={onRename} onDelete={onDelete} bare />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

