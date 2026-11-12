// Team › Agent access (/admin/v2/team/agents): tokens for AI agents (any model, any MCP app) that read or work in the
// console through /admin/mcp. The console's own look; the same API as the kit part it replaces (server/opmcp/routes.mjs:
// /api/admin/agent-tokens, owners past two-step only; the server checks again). Nothing is deleted: revoking keeps the
// token's history in the audit log.
import { useState } from 'react';
import { Bot, KeyRound, Plus } from 'lucide-react';
import { t, tn } from '../../i18n';
import { post, rel, day } from '../api';
import { Badge, Confirm, CopyBtn, Dialog, Empty, Failed, Field, Loading, Menu, Section, useAct, useApi } from '../ui';

interface Tool { name: string; title: string; description: string; kind: 'read' | 'write' | 'send'; undo?: string }
interface Token { id: string; name: string; scopes: string[]; hint: string; lastUsedAt?: string | null; revokedAt?: string | null; revokedBy?: string | null; uses?: number }
interface Data { tools: Tool[]; tokens: Token[]; limits: { perMinute?: number; perDay?: number } }

const patch = (body: unknown) =>
  fetch('/api/admin/agent-tokens', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) =>
    r.ok ? r.json() : Promise.reject(new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || t('Couldn’t save'))),
  );

export function Agents() {
  const { data, error, reload } = useApi<Data>('agent-tokens');
  const act = useAct();
  const [editing, setEditing] = useState<Token | 'new' | null>(null);
  const [revoking, setRevoking] = useState<Token | null>(null);
  const [made, setMade] = useState<{ secret: string; name: string } | null>(null);
  const mcpUrl = `${location.origin}/admin/mcp`;
  if (error) return <Failed error={error} retry={reload} />;
  if (!data) return <Loading rows={4} />;
  const live = data.tokens.filter((x) => !x.revokedAt);
  const dead = data.tokens.filter((x) => x.revokedAt);
  const can = (x: Token) => {
    const w = x.scopes.filter((s) => s !== 'read').length;
    const r = x.scopes.includes('read') ? t('Reads') : t('No reading');
    return w ? tn(w, '{reads} and {n} change', '{reads} and {n} changes', { reads: r }) : t('{reads} only', { reads: r });
  };
  return (
    <>
      <Section
        title={t('Agent tokens')}
        actions={
          <button className="primary-btn sm" onClick={() => setEditing('new')}>
            <Plus size={14} /> {t('New token')}
          </button>
        }
      >
        <p className="adm-dialog-text">{t('An AI agent (any model, any app that speaks MCP) can work in the console with a token you make here. Each token belongs to one agent. It reads; it changes only what you tick. Every call is in the audit log.')}</p>
        {live.length === 0 ? (
          <Empty icon={<Bot size={18} />} title={t('No agents yet')} text={t('Agents can’t connect until you make a token for one.')} />
        ) : (
          <div className="adm-mini-list">
            {live.map((x) => (
              <div key={x.id} className="adm-mini-row">
                <KeyRound size={15} />
                <span className="grow">
                  <strong>{x.name}</strong>
                  <small className="muted">
                    {' '}
                    · {can(x)} · {x.lastUsedAt ? t('used {ago}', { ago: rel(x.lastUsedAt) }) : t('never used')} · {x.hint}
                  </small>
                </span>
                <Menu
                  label={t('Manage')}
                  items={[
                    { label: t('Change what it can do'), run: () => setEditing(x) },
                    { label: t('Revoke'), danger: true, run: () => setRevoking(x) },
                  ]}
                />
              </div>
            ))}
          </div>
        )}
        {dead.length > 0 && (
          <details className="adm-revoked">
            <summary className="muted">{tn(dead.length, '{n} revoked token', '{n} revoked tokens')}</summary>
            <div className="adm-mini-list">
              {dead.map((x) => (
                <div key={x.id} className="adm-mini-row">
                  <span className="grow">
                    {x.name}{' '}
                    <small className="muted">
                      · {t('revoked {day}', { day: day(x.revokedAt) })}
                      {x.revokedBy ? ` · ${x.revokedBy}` : ''} · {tn(x.uses ?? 0, '{n} call', '{n} calls')}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </Section>
      <div className="adm-split">
        <Section title={t('What an agent can do')}>
          <div className="adm-mini-list">
            {data.tools.map((x) => (
              <div key={x.name} className="adm-mini-row">
                <span className="grow">
                  <strong>{x.title}</strong>
                  <small className="muted"> · {x.description}</small>
                </span>
                <Badge tone={x.kind === 'read' ? 'neutral' : x.kind === 'write' ? 'warn' : 'bad'}>{x.kind === 'read' ? t('Reads') : x.kind === 'write' ? t('Changes') : t('Sends')}</Badge>
              </div>
            ))}
          </div>
        </Section>
        <Section title={t('Connect an agent')}>
          <p className="adm-dialog-text">{t('Make a token, then add an MCP server in the agent’s app with this address and the token as a header.')}</p>
          <Snippets url={mcpUrl} token="<token>" />
        </Section>
      </div>

      {editing && <TokenForm data={data} token={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(r) => (setEditing(null), reload(), r && setMade(r))} />}
      {revoking && (
        <Confirm
          title={t('Revoke {name}?', { name: revoking.name })}
          text={t('The agent is signed out at once and this token never works again. Its history stays in the audit log.')}
          action={t('Revoke token')}
          danger
          onClose={() => setRevoking(null)}
          onConfirm={() => act(() => post('agent-tokens', { action: 'revoke', id: revoking.id }), t('{name} is signed out', { name: revoking.name })).then(() => (setRevoking(null), reload()))}
        />
      )}
      {made && (
        <Dialog
          title={t('Token for {name}', { name: made.name })}
          onClose={() => setMade(null)}
          foot={
            <button className="primary-btn" onClick={() => setMade(null)}>
              {t('Done')}
            </button>
          }
        >
          <div className="adm-form">
            <p className="adm-dialog-text">{t('Copy it now: this is the only time it is shown. If it is lost, revoke it and make a new one.')}</p>
            <pre className="adm-code">{made.secret}</pre>
            <CopyBtn text={made.secret} label={t('Copy token')} />
            <Snippets url={mcpUrl} token={made.secret} />
          </div>
        </Dialog>
      )}
    </>
  );
}

function Snippets({ url, token }: { url: string; token: string }) {
  const short = 'sprint2go-operators';
  const rows: [string, string][] = [
    [t('Address and header (any MCP app)'), `${url}\nAuthorization: Bearer ${token}`],
    ['Claude Code', `claude mcp add --transport http ${short} ${url} --header "Authorization: Bearer ${token}"`],
    [t('Apps with a JSON config'), JSON.stringify({ mcpServers: { [short]: { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2)],
    [t('Apps that only start local servers'), `npx mcp-remote ${url} --header "Authorization: Bearer ${token}"`],
  ];
  return (
    <div className="adm-snippets">
      {rows.map(([label, code]) => (
        <div key={label}>
          <span className="muted small">{label}</span>
          <pre className="adm-code">{code}</pre>
        </div>
      ))}
    </div>
  );
}

function TokenForm({ data, token, onClose, onSaved }: { data: Data; token: Token | null; onClose: () => void; onSaved: (made?: { secret: string; name: string }) => void }) {
  const [name, setName] = useState(token?.name ?? '');
  const [scopes, setScopes] = useState<string[]>(token?.scopes ?? ['read']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const flip = (s: string) => setScopes((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]));
  const group = (kind: Tool['kind'], legend: string, note?: string) => {
    const list = data.tools.filter((x) => x.kind === kind);
    if (!list.length) return null;
    return (
      <fieldset className="adm-agent-group">
        <legend>{legend}</legend>
        {note && <p className="muted small">{note}</p>}
        {list.map((x) => (
          <label key={x.name} className="adm-check-row">
            <input type="checkbox" checked={scopes.includes(x.name)} onChange={() => flip(x.name)} />
            <span>
              <strong>{x.title}</strong>
              <small className="muted">
                {x.description}
                {x.undo ? ` ${t('Undo: {how}', { how: x.undo })}` : ''}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
    );
  };
  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      if (token) {
        await patch({ id: token.id, name, scopes });
        onSaved();
      } else {
        const r = await post<{ token: string; record: { name: string } }>('agent-tokens', { name, scopes });
        onSaved({ secret: r.token, name: r.record.name });
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={token ? t('Change {name}', { name: token.name }) : t('New token')}
      onClose={onClose}
      foot={
        <>
          <button className="ghost-btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className="primary-btn" disabled={busy || !name.trim()} onClick={() => void save()}>
            {token ? t('Save') : t('Make token')}
          </button>
        </>
      }
    >
      <div className="adm-form">
        <Field label={t('Name')} hint={t('Which agent, for example Donna (aqeelOS)')}>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <fieldset className="adm-agent-group">
          <legend>{t('Reading')}</legend>
          <label className="adm-check-row">
            <input type="checkbox" checked={scopes.includes('read')} onChange={() => flip('read')} />
            <span>
              <strong>{t('Read')}</strong>
              <small className="muted">
                {data.tools
                  .filter((x) => x.kind === 'read')
                  .map((x) => x.title)
                  .join(', ')}
              </small>
            </span>
          </label>
        </fieldset>
        {group('write', t('Changes'), t('Off until you tick them. Each change is logged and can be undone.'))}
        {group('send', t('Sends to people'), t('These reach real people and cannot be called back. Tick one only for an agent you trust with it.'))}
        {err && <p className="signin-error">{err}</p>}
      </div>
    </Dialog>
  );
}
