// Keep: Notes, Drive, Tables, Vault.
import { useMemo } from 'react';
import type { DataTable, DriveItem, Note } from '../../types';
import { useStored } from '../../store';
import { t } from '../../i18n';
import { sanitize } from '../../sanitize';
import { fmtSize } from '../../data/drive';
import { Card, Empty, Page, esc, useKitList, useV2, when, BASE } from '../ui';
import { nameOf, useTeam } from '../team';
import { ICON } from '../Shell';

/* ---------------- Notes ---------------- */
// Opens on the latest note, not on "No note open" (the review). The editor is the full Notes view's for now.
export function Notes({ open }: { open?: string }) {
  const { me, ws, users } = useTeam();
  const [notes] = useStored('notes');
  const list = useMemo(() => notes.filter((n) => n.workspaceId === ws.id && !n.deletedAt && (n.visibility === 'team' || n.ownerId === me.id)).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt.localeCompare(a.updatedAt)), [notes, ws.id, me.id]);
  const note = list.find((n) => n.id === open) ?? list[0];
  return (
    <Page title={t('Notes')} sub={t('Your notes and the ones shared with the team.')} actions={<a className="ak-btn ak-btn--primary" href="/notes?new=1">{t('New note')}</a>}>
      {list.length ? (
        <div className="s2a-split">
          <Card title={t('All notes')} flush>
            <ul className="s2a-rows s2a-pad">
              {list.map((n) => (
                <li key={n.id}>
                  <a className="s2a-row s2a-link" href={`${BASE}/notes/${n.id}`} aria-current={n.id === note?.id ? 'true' : undefined}>
                    <span className="s2a-row__main"><span className="s2a-row__title">{n.title || t('Untitled')}</span><span className="s2a-row__sub">{when(n.updatedAt)}, {n.visibility === 'team' ? t('shared') : t('private')}</span></span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
          {note && <NoteView n={note} by={nameOf(users, note.updatedBy)} />}
        </div>
      ) : (
        <Card><Empty title={t('No notes yet')} text={t('New note starts one.')} /></Card>
      )}
    </Page>
  );
}
function NoteView({ n, by }: { n: Note; by: string }) {
  return (
    <Card title={n.title || t('Untitled')} aside={<a className="ak-btn" href={`/notes/${n.id}`}>{t('Edit')}</a>}>
      <p className="s2a-note">{t('Changed {when} by {name}', { when: when(n.updatedAt), name: by || t('someone') })}</p>
      <div className="s2a-read s2a-html" dangerouslySetInnerHTML={{ __html: sanitize(n.html) }} />
    </Card>
  );
}

/* ---------------- Drive ---------------- */
export function Drive() {
  const { ws } = useTeam();
  const { toast } = useV2();
  const [drive, setDrive] = useStored('drive');
  const rows = useMemo(() => drive.filter((d) => (!d.workspaceId || d.workspaceId === ws.id) && !d.trashed), [drive, ws.id]);
  const folder = (d: DriveItem) => rows.find((x) => x.id === d.parentId)?.name ?? t('My Drive');
  const star = (d: DriveItem) => setDrive((list) => list.map((x) => (x.id === d.id ? { ...x, starred: !x.starred } : x)));
  const { el } = useKitList<DriveItem>(
    () => ({
      id: 'dr',
      rowId: (r) => r.id,
      searchLabel: t('Search files and folders'),
      search: (r) => r.name,
      views: [
        { value: 'recent', label: t('Recent'), test: (r) => r.kind !== 'folder' },
        { value: 'starred', label: t('Starred'), test: (r) => !!r.starred },
        { value: 'guests', label: t('Shared with guests'), test: (r) => !!r.sharedWithClient },
        { value: 'folders', label: t('Folders'), test: (r) => r.kind === 'folder' },
      ],
      sort: { key: 'modified', dir: -1 },
      columns: [
        { key: 'name', label: t('Name'), primary: true, truncate: true, value: (r) => r.name, cell: (r) => (r.url ? `<a class="s2a-open" href="${esc(r.url)}" target="_blank" rel="noreferrer">${esc(r.name)}</a>` : `<span class="s2a-open">${esc(r.name)}</span>`) + `<span class="s2a-sub">${esc(folder(r))}</span>` },
        { key: 'modified', label: t('Changed'), sort: 'date', value: (r) => r.modified, cell: (r) => esc(when(r.modified)) },
        { key: 'size', label: t('Size'), align: 'end', sort: 'number', hidePhone: true, value: (r) => r.size, cell: (r) => (r.kind === 'folder' ? '' : esc(fmtSize(r.size))) },
      ],
      actions: [{ key: 'star', label: t('Star'), icon: ICON.star, run: (r) => (star(r), toast(r.starred ? t('Unstarred') : t('Starred'))) }],
      summary: (list) => t('{n} items', { n: list.length }),
      empty: { none: t('No files yet. Upload adds the first.'), views: { starred: t('Nothing starred. The star on a row keeps a file here.') } },
    }),
    rows,
  );
  return (
    <Page title={t('Drive')} sub={t('Files in {company}, newest first.', { company: ws.name })} actions={<a className="ak-btn ak-btn--primary" href="/drive">{t('Upload')}</a>}>
      {el}
    </Page>
  );
}

/* ---------------- Tables ---------------- */
export function Tables() {
  const { ws, users } = useTeam();
  const [tables] = useStored('tables');
  const [rowsAll] = useStored('rows');
  const [clients] = useStored('clients');
  const rows = useMemo(() => tables.filter((tb) => tb.workspaceId === ws.id), [tables, ws.id]);
  const count = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rowsAll) m.set(r.tableId, (m.get(r.tableId) ?? 0) + 1);
    return m;
  }, [rowsAll]);
  const { el } = useKitList<DataTable>(
    () => ({
      id: 'tb',
      rowId: (r) => r.id,
      searchLabel: t('Search tables'),
      search: (r) => [r.name, r.description].join(' '),
      sort: { key: 'name', dir: 1 },
      columns: [
        { key: 'name', label: t('Table'), primary: true, truncate: true, value: (r) => r.name, cell: (r) => `<a class="s2a-open" href="/tables/${esc(r.id)}">${esc(r.name)}</a>${r.description ? `<span class="s2a-sub">${esc(r.description)}</span>` : ''}` },
        { key: 'rows', label: t('Rows'), align: 'end', sort: 'number', value: (r) => count.get(r.id) ?? 0, cell: (r) => String(count.get(r.id) ?? 0) },
        { key: 'project', label: t('Project'), hidePhone: true, value: (r) => clients.find((c) => c.id === r.clientId)?.name ?? '', cell: (r) => esc(clients.find((c) => c.id === r.clientId)?.name ?? t('Whole company')) },
        { key: 'by', label: t('Made by'), hidePhone: true, value: (r) => nameOf(users, r.createdBy), cell: (r) => esc(nameOf(users, r.createdBy)) },
      ],
      summary: (list) => t('{n} tables', { n: list.length }),
      empty: { none: t('No tables yet. New table starts one.') },
    }),
    rows,
  );
  return (
    <Page title={t('Tables')} sub={t('Small databases: leads, stock, anything with rows.')} actions={<a className="ak-btn ak-btn--primary" href="/tables">{t('New table')}</a>}>
      {el}
    </Page>
  );
}

/* ---------------- Vault ---------------- */
// Logins are encrypted with the team's passphrase in the browser (src/vaultCrypto.ts); v2 does not unlock them yet.
// No faded "Add a login" before the vault is set up (the review): one clear way in.
export function Vault() {
  return (
    <Page title={t('Vault')} sub={t('Shared logins, locked with your team passphrase.')}>
      <Card title={t('Open the Vault')}>
        <Empty title={t('The Vault unlocks with your passphrase')} text={t('Logins are encrypted on your device. Open the Vault to set the passphrase or unlock it, then add and copy logins there.')}>
          <a className="ak-btn ak-btn--primary" href="/vault">{t('Open the Vault')}</a>
        </Empty>
      </Card>
    </Page>
  );
}
