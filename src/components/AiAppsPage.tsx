import { useState } from 'react';
import { Bot, Check, Copy, ShieldOff } from 'lucide-react';
import type { Workspace } from '../types';
import { usePhone } from '../mobile/media';
import { GRow, Group } from './ui/Grouped';
import { ConnectedApps } from './ConnectedApps';
import { server } from '../sync';
import { mark, t } from '../i18n';
import '../connector.css';

/*
 * Settings, Connect AI apps: what the sprint2go connector does, the address to paste, the steps in Claude and in
 * ChatGPT, and the person's own connections (ConnectedApps.tsx, the same list that used to sit in Account). The
 * server side is server/connector.ts and server/mcpTools.ts. When the company's admins switched AI apps off
 * (Security & data, ws.aiApps false), it says so first.
 */

/** Its place in Settings (one line in SettingsPage's SECTIONS). */
export const AI_APPS_SECTION = {
  id: 'ai-apps' as const,
  name: mark('Connect AI apps'),
  icon: Bot,
  group: 'You' as const,
};

const steps = () => [
  {
    id: 'claude',
    name: 'Claude',
    list: [t('In Claude, open Settings, then Connectors.'), t('Choose Add custom connector.'), t('Name it sprint2go and paste the address above.'), t('Choose Connect, sign in to sprint2go and pick the company.')],
    foot: t('Works in Claude on the web, the desktop app and the phone app. On a Team or Enterprise plan, an owner may need to add it first.'),
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    list: [
      t('In ChatGPT, open Settings, then Apps & Connectors.'),
      t('Under Advanced settings, switch on Developer mode.'),
      t('Choose Create, name it sprint2go and paste the address above. Leave sign-in on OAuth.'),
      t('Choose Create, sign in to sprint2go and pick the company.'),
    ],
    foot: t('Developer mode is on paid ChatGPT plans. On a business plan, an admin may need to allow it.'),
  },
];

export function AiAppsPage({ ws, toast }: { ws: Workspace; toast?: (t: string) => void }) {
  const phone = usePhone();
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/mcp`;
  const off = ws.aiApps === false;
  const copy = () =>
    void navigator.clipboard?.writeText(url).then(
      () => (setCopied(true), setTimeout(() => setCopied(false), 1600)),
      () => toast?.(t('Couldn’t copy it. Select the address and copy it yourself.')),
    );
  const intro = t('Ask Claude or ChatGPT about your work here: what needs you, a project’s late tasks, last week’s meeting notes, a file in Drive. They can also make tasks, notes and calendar events for you.');
  const safe = t('An AI app sees only what you see in the company you pick, and acts as you. Email is only ever a draft you send yourself.');
  const offText = t('{company} switched AI apps off, so connections to it don’t work. An admin can switch them back on in Settings, Security & data.', { company: ws.name || t('This company') });

  if (!server.on)
    return (
      <>
        <h2>{t('Connect AI apps')}</h2>
        <p className="set-intro">{intro}</p>
        <p className="set-hint">{t('This works with sprint2go on a server; this demo has none.')}</p>
      </>
    );

  const stepCards = (
    <div className="aa-steps">
      {steps().map((s) => (
        <section key={s.id} className="aa-step">
          <h3>{t('In {app}', { app: s.name })}</h3>
          <ol className="aa-list">
            {s.list.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ol>
          <p className="aa-foot">{s.foot}</p>
        </section>
      ))}
    </div>
  );

  if (phone)
    return (
      <div className="aa-page">
        <Group footer={safe}>
          <div className="aa-intro">
            <span className="aa-icon" aria-hidden>
              <Bot size={20} />
            </span>
            <p>{intro}</p>
          </div>
        </Group>
        {off && (
          <Group>
            <div className="aa-off" role="status">
              <ShieldOff size={20} aria-hidden />
              <p>{offText}</p>
            </div>
          </Group>
        )}
        <Group title={t('The address')} footer={t('Paste this in the AI app. It’s the same for Claude, ChatGPT and other apps that connect to MCP servers.')}>
          <GRow
            label={<code className="cn-url">{url}</code>}
            accessory={
              <button type="button" className="g-btn" onClick={copy} aria-label={t('Copy the address')}>
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            }
          />
        </Group>
        {steps().map((s) => (
          <Group key={s.id} title={t('In {app}', { app: s.name })} footer={s.foot}>
            <ol className="aa-list">
              {s.list.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ol>
          </Group>
        ))}
        <ConnectedApps toast={toast} listOnly />
      </div>
    );

  return (
    <div className="aa-page">
      <h2>{t('Connect AI apps')}</h2>
      <p className="set-intro">{intro}</p>
      {off && (
        <div className="aa-off" role="status">
          <ShieldOff size={18} aria-hidden />
          <p>{offText}</p>
        </div>
      )}
      <div className="set-row cn-add aa-url">
        <span>
          <strong>{t('The address')}</strong>
          <small>{t('Paste this in the AI app. It’s the same for Claude, ChatGPT and other apps that connect to MCP servers.')}</small>
          <code className="cn-url">{url}</code>
        </span>
        <button type="button" className="ghost-btn outline sm cn-copy" onClick={copy} aria-label={t('Copy the address')}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t('Copied') : t('Copy')}
        </button>
      </div>
      {stepCards}
      <p className="set-hint aa-safe">{safe}</p>
      <ConnectedApps toast={toast} listOnly />
    </div>
  );
}
