// What's inside each Settings page, for searching Settings and the ⌘K palette ("signature" finds Mail & signature).
// To add a page or an option: add its id (a SettingsSection) and the option labels people would type. Labels are
// English, marked for translation (Indonesian in src/i18n/id/settings.search.ts). A page only shows up in results
// when SettingsPage actually has it (see liveSettings), so entries for pages still being built are safe here.
import { mark, t } from './i18n';

export const SETTINGS_INDEX: Record<string, { name?: string; options: string[] }> = {
  account: { options: [mark('Name'), mark('Photo'), mark('Password'), mark('Two-step sign-in'), mark('Backup email'), mark('Language'), mark('Delete account')] },
  appearance: { options: [mark('Theme'), mark('Dark mode'), mark('Light mode'), mark('Density')] },
  myapps: { options: [mark('Hide apps'), mark('Ask for an app'), mark('App order')] },
  mail: { options: [mark('Signature'), mark('Writing'), mark('Out of office'), mark('Mailboxes')] },
  mailapps: { options: [mark('Phone mail apps'), mark('IMAP'), mark('App password')] },
  mailaccess: { options: [mark('Delegation'), mark('Forwarding'), mark('POP')] },
  mailstorage: { options: [mark('Mail storage'), mark('Mailbox size')] },
  notifications: { options: [mark('Push notifications'), mark('Email notifications'), mark('Quiet hours'), mark('Sounds')] },
  help: { options: [mark('Contact support'), mark('Guides')] },
  shortcuts: { options: [mark('Keyboard shortcuts')] },
  developer: { options: [mark('Demo company'), mark('Onboarding')] },
  workspace: { options: [mark('Company name'), mark('Logo'), mark('Members'), mark('Invite people'), mark('Mailboxes'), mark('Mail routing'), mark('Public holidays')] },
  email: { options: [mark('Sending'), mark('DNS records'), mark('SPF'), mark('DKIM')] },
  permissions: { options: [mark('Roles'), mark('Who can see billing'), mark('Admins')] },
  agency: { options: [mark('Client portal'), mark('Brand colour'), mark('Logo')] },
  teams: { options: [mark('Create a team'), mark('Team members')] },
  stages: { options: [mark('Task stages'), mark('Review')] },
  clients: { options: [mark('Guests'), mark('Guest access')] },
  apps: { options: [mark('Company apps'), mark('Chat')] },
  meetings: { options: [mark('Recording'), mark('Meeting notes'), mark('Note taker')] },
  ai: { options: [mark('AI keys'), mark('AI costs'), mark('Models')] },
  billing: { options: [mark('Plan'), mark('Invoices'), mark('Payment method'), mark('Upgrade')] },
  storage: { options: [mark('Storage used'), mark('Buy more storage')] },
  security: { options: [mark('Sign-in rules'), mark('Two-step sign-in'), mark('Export data'), mark('Sessions')] },
  mailgroups: { options: [mark('Groups'), mark('Shared inboxes')] },
  mailrules: { options: [mark('Retention'), mark('Mail rules')] },
  import: { options: [mark('Import mail'), mark('Import from Google'), mark('Import from Microsoft')] },
  domains: { name: mark('Domains'), options: [mark('Add domain'), mark('Primary domain'), mark('Verify DNS'), mark('Aliases'), mark('Domain look'), mark('Sender name'), mark('Logo'), mark('Colour')] },
  'ai-apps': { name: mark('Connect AI apps'), options: [mark('Claude'), mark('ChatGPT'), mark('MCP'), mark('Connector')] },
};

// The pages SettingsPage has, with their names: it tells us when it loads, so pages still being built stay hidden.
let live: { id: string; name: string }[] | null = null;
export function registerSettings(pages: { id: string; name: string }[]) {
  live = pages; // kept as is: some names are worked out when read (Guest access)
}
/** Pages known to exist. Before SettingsPage has loaded (it's lazy), every indexed page with a known name. */
export function liveSettings(): { id: string; name: string }[] | null {
  return live;
}

export interface SettingsHit {
  id: string;
  page: string; // translated page name
  option?: string; // translated option that matched (none when the page name matched)
}

/** Pages and options that match every typed word, page-name matches first. */
export function searchSettings(q: string, pages: { id: string; name: string }[]): SettingsHit[] {
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: (SettingsHit & { score: number })[] = [];
  const has = (s: string) => words.every((w) => s.toLowerCase().includes(w));
  for (const p of pages) {
    const page = t(p.name);
    const both = `${page} ${p.name}`;
    if (has(both)) hits.push({ id: p.id, page, score: page.toLowerCase().startsWith(words[0]) ? 100 : 80 });
    for (const o of SETTINGS_INDEX[p.id]?.options ?? []) {
      const opt = t(o);
      if (has(`${opt} ${o}`) || (!has(both) && has(`${opt} ${o} ${both}`) && words.some((w) => `${opt} ${o}`.toLowerCase().includes(w)))) {
        hits.push({ id: p.id, page, option: opt, score: opt.toLowerCase().startsWith(words[0]) ? 60 : 40 });
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 30);
}

/** After a jump: find the option on the open page, scroll to it and flash it once. */
export function flashOption(label: string) {
  const want = label.toLowerCase();
  let tries = 0;
  const look = () => {
    const root = document.querySelector('.settings-push .settings-content, .settings-content');
    const els = root ? Array.from(root.querySelectorAll<HTMLElement>('h2, h3, h4, label, strong, legend, .g-label, .set-row-title, button, span')) : [];
    const el = els.find((e) => e.childElementCount <= 2 && e.textContent?.trim().toLowerCase().startsWith(want));
    if (!el) return void (++tries < 8 && setTimeout(look, 120));
    const target = (el.closest('.set-block, .toggle, .g-row, .set-row, label') as HTMLElement | null) ?? el;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    target.classList.remove('set-hit');
    void target.offsetWidth;
    target.classList.add('set-hit');
    setTimeout(() => target.classList.remove('set-hit'), 1800);
  };
  setTimeout(look, 260);
}

/** Everything in Settings, one entry per page and per option, for the ⌘K palette. Empty until SettingsPage loads. */
export function settingsEntries(): { key: string; id: string; page: string; option?: string }[] {
  if (!live) {
    void import('./components/SettingsPage'); // it registers its pages when it loads; the next search has them
    return [];
  }
  return live.flatMap((p) => [{ key: p.id, id: p.id, page: t(p.name) }, ...(SETTINGS_INDEX[p.id]?.options ?? []).map((o) => ({ key: `${p.id}:${o}`, id: p.id, page: t(p.name), option: t(o) }))]);
}
