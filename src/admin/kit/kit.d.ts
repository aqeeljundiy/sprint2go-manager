// aqeel-admin-kit (public/admin-v2/kit) is plain custom elements plus window.AdminKit. These types let TSX use them.
import 'react';

type AkProps = Record<string, unknown> & { children?: React.ReactNode; class?: string; className?: string; ref?: unknown; slot?: string; id?: string; style?: React.CSSProperties };

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      [tag: `ak-${string}`]: AkProps;
    }
  }
}

export interface AkListColumn<T> {
  key: string;
  label: string;
  primary?: boolean;
  align?: 'end';
  sort?: 'text' | 'number' | 'date';
  hidePhone?: boolean;
  truncate?: boolean;
  value?: (r: T) => string | number;
  cell: (r: T) => string;
}
export interface AkListOptions<T> {
  id: string;
  rowId: (r: T) => string;
  searchLabel?: string;
  search?: (r: T) => string;
  views?: { value: string; label: string; test?: (r: T) => boolean; count?: boolean; order?: 1 | -1 }[];
  filters?: { key: string; label: string; any: string; options?: (rows: T[]) => [string, string][]; kind?: 'date'; test: (r: T, v: string) => boolean }[];
  sort?: { key: string; dir: 1 | -1 };
  columns: AkListColumn<T>[];
  actions?: { key: string; label: string; icon: string; show?: (r: T) => boolean; run: (r: T) => void }[];
  bulk?: { key: string; label: string; tone?: string; run: (rows: T[]) => void }[];
  onOpen?: (r: T) => void;
  summary?: (rows: T[]) => string;
  side?: string;
  empty?: { none?: string; noMatch?: string; views?: Record<string, string> };
  onChange?: (state: unknown) => void;
}
export interface AkList<T> {
  setRows(rows: T[]): void;
  set(state: { view?: string; q?: string; filters?: Record<string, string> }): void;
  matching(): T[];
  destroy?: () => void;
}
export interface AdminKitApi {
  toast: ((text: string, o?: { description?: string; action?: { label: string; onClick: () => void } }) => void) & { success: (t: string, o?: object) => void; error: (t: string, o?: object) => void; promise: <P>(p: Promise<P>, o: { loading: string; success: string; error: string }) => Promise<P> };
  confirm: (o: { title: string; body?: string; confirmLabel?: string; cancelLabel?: string; tone?: 'danger' }) => Promise<boolean>;
  prompt: (o: { title: string; label?: string; value?: string; confirmLabel?: string }) => Promise<string | null>;
  pick: <V>(o: { title: string; placeholder?: string; items: { label: string; hint?: string; keywords?: string; value: V }[] }) => Promise<{ value: V } | null>;
  command: { add: (items: { group: string; label: string; hint?: string; run: () => void }[]) => void; open: () => void; set: (items: unknown[]) => void };
  list: <T>(host: HTMLElement, o: AkListOptions<T>) => AkList<T>;
  esc: (s: unknown) => string;
}
declare global {
  interface Window {
    AdminKit: AdminKitApi;
  }
}
